/**
 * Session service (FR-100): sign-in from a verified identity, per-request authentication
 * and revocation.
 *
 * Security properties:
 * - Access requires allowlisted email AND an existing, active user. Both are re-checked on
 *   EVERY request, so deactivation or allowlist removal is effective immediately (PRD §11),
 *   not at session expiry.
 * - The role comes from the database user row at request time, never from the session or
 *   the identity token. A role change applies immediately.
 * - Session tokens are 256-bit random opaque values; only their SHA-256 hash is stored.
 * - `VIEWER` is disabled unless explicitly enabled by configuration.
 * - Public denials are uniform; specific codes are for server-side logging only.
 */

import { IdentityVerificationError, normalizeEmail } from "./google-id-token";
import {
  type AllowlistProvider,
  type Clock,
  type Denial,
  deny,
  type IdentityVerifier,
  type Principal,
  type SessionRecord,
  type SessionStore,
  systemClock,
  type UserDirectory,
  type UserRecord,
} from "./types";

export interface SessionServiceDeps {
  identity: IdentityVerifier;
  allowlist: AllowlistProvider;
  users: UserDirectory;
  sessions: SessionStore;
  clock?: Clock;
  /** Session lifetime. Default 8 hours. Must be a positive finite number. */
  sessionTtlMs?: number;
  /** Optional VIEWER role is off unless explicitly enabled. */
  viewerEnabled?: boolean;
}

export type SignInResult =
  | { ok: true; sessionToken: string; expiresAt: Date; principal: Principal }
  | Denial;

export type AuthenticateResult = { ok: true; principal: Principal } | Denial;

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function toPrincipal(user: UserRecord): Principal {
  return {
    userId: user.userId,
    email: normalizeEmail(user.email),
    accessRole: user.accessRole,
    organizationalTitle: user.organizationalTitle,
  };
}

export function createSessionService(deps: SessionServiceDeps) {
  const clock = deps.clock ?? systemClock;
  const ttl = deps.sessionTtlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("sessionTtlMs must be positive");
  const viewerEnabled = deps.viewerEnabled ?? false;

  /** Shared account-state gate used at sign-in and on every request. */
  async function resolveActiveUser(
    user: UserRecord | null,
  ): Promise<{ ok: true; user: UserRecord } | Denial> {
    if (!user) return deny("USER_NOT_FOUND");
    if (!user.isActive) return deny("USER_INACTIVE");
    if (!(await deps.allowlist.isAllowed(normalizeEmail(user.email))))
      return deny("NOT_ALLOWLISTED");
    if (user.accessRole === "VIEWER" && !viewerEnabled) return deny("VIEWER_DISABLED");
    return { ok: true, user };
  }

  return {
    async signIn(idToken: string): Promise<SignInResult> {
      let email: string;
      try {
        email = (await deps.identity.verify(idToken)).email;
      } catch (error) {
        if (error instanceof IdentityVerificationError) return deny("INVALID_IDENTITY_TOKEN");
        return deny("INVALID_IDENTITY_TOKEN");
      }
      email = normalizeEmail(email);

      // Allowlist first: a non-allowlisted identity never reaches the user lookup.
      if (!(await deps.allowlist.isAllowed(email))) return deny("NOT_ALLOWLISTED");

      const resolved = await resolveActiveUser(await deps.users.findByEmail(email));
      if (!resolved.ok) return resolved;

      const now = clock.now();
      const sessionToken = generateSessionToken();
      const record: SessionRecord = {
        sessionId: crypto.randomUUID(),
        userId: resolved.user.userId,
        tokenHash: await hashSessionToken(sessionToken),
        createdAt: now,
        expiresAt: new Date(now.getTime() + ttl),
      };
      await deps.sessions.create(record);

      return {
        ok: true,
        sessionToken,
        expiresAt: record.expiresAt,
        principal: toPrincipal(resolved.user),
      };
    },

    async authenticate(sessionToken: string | undefined | null): Promise<AuthenticateResult> {
      if (!sessionToken || typeof sessionToken !== "string") return deny("NO_SESSION");

      const session = await deps.sessions.findByTokenHash(await hashSessionToken(sessionToken));
      if (!session) return deny("NO_SESSION");
      if (session.revokedAt) return deny("SESSION_REVOKED");
      if (session.expiresAt.getTime() <= clock.now().getTime()) return deny("SESSION_EXPIRED");

      const resolved = await resolveActiveUser(await deps.users.findById(session.userId));
      if (!resolved.ok) return resolved;
      return { ok: true, principal: toPrincipal(resolved.user) };
    },

    async signOut(sessionToken: string): Promise<void> {
      const session = await deps.sessions.findByTokenHash(await hashSessionToken(sessionToken));
      if (session && !session.revokedAt) await deps.sessions.revoke(session.sessionId, clock.now());
    },

    /** Use when deactivating a user or rotating credentials; returns number revoked. */
    async revokeAllForUser(userId: string): Promise<number> {
      return deps.sessions.revokeAllForUser(userId, clock.now());
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
