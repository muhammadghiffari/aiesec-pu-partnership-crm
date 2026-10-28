/**
 * Auth domain types and ports (FR-100).
 *
 * Ports are deliberately narrow so M1-01 (DB-backed user/session repositories) and
 * M0-04 (config) plug in without this package depending on them.
 */

export const ACCESS_ROLES = ["CRM_LEAD", "BD_STAFF", "VIEWER"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export function isAccessRole(value: unknown): value is AccessRole {
  return typeof value === "string" && (ACCESS_ROLES as readonly string[]).includes(value);
}

/** Database user record. `organizationalTitle` is metadata only (D-007): never a policy input. */
export interface UserRecord {
  userId: string;
  email: string;
  name: string;
  accessRole: AccessRole;
  isActive: boolean;
  organizationalTitle?: string | undefined;
}

/** Authenticated, currently-valid caller. Built only by the session service. */
export interface Principal {
  userId: string;
  email: string;
  accessRole: AccessRole;
  organizationalTitle?: string | undefined;
}

/** Claims accepted after the identity provider's token has been cryptographically verified. */
export interface VerifiedIdentity {
  /** Provider subject (stable id). */
  subject: string;
  /** Normalized (trimmed, lower-cased) email. */
  email: string;
  emailVerified: true;
  name?: string | undefined;
}

export interface IdentityVerifier {
  /** Must reject (throw) for any token that is not authentic, current and addressed to this app. */
  verify(idToken: string): Promise<VerifiedIdentity>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface UserDirectory {
  findByEmail(normalizedEmail: string): Promise<UserRecord | null>;
  findById(userId: string): Promise<UserRecord | null>;
}

export interface AllowlistProvider {
  /** Evaluated on every authenticated request so removal takes effect immediately. */
  isAllowed(normalizedEmail: string): Promise<boolean> | boolean;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  /** SHA-256 hex of the opaque bearer token. The raw token is never stored. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | undefined;
}

export interface SessionStore {
  create(session: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<number>;
}

/** Reasons a request is not authenticated/permitted. Log internally; map uniformly on the wire. */
export type DenialCode =
  | "INVALID_IDENTITY_TOKEN"
  | "NOT_ALLOWLISTED"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "VIEWER_DISABLED"
  | "NO_SESSION"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "ACTION_UNKNOWN"
  | "ACTION_NOT_PERMITTED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "CONTEXT_REQUIRED";

export interface Denial {
  ok: false;
  code: DenialCode;
  /** 401 = not authenticated (re-login), 403 = authenticated or identified but not permitted. */
  httpStatus: 401 | 403;
}

const UNAUTHENTICATED: ReadonlySet<DenialCode> = new Set([
  "INVALID_IDENTITY_TOKEN",
  "NO_SESSION",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
]);

export function deny(code: DenialCode): Denial {
  return { ok: false, code, httpStatus: UNAUTHENTICATED.has(code) ? 401 : 403 };
}

/**
 * Uniform response body for the HTTP layer. Callers must not distinguish "not allowlisted"
 * from "unknown user" to the outside (avoids account enumeration); the code stays in server logs.
 */
export function toPublicDenial(denial: Denial): { status: 401 | 403; error: string } {
  return denial.httpStatus === 401
    ? { status: 401, error: "authentication_required" }
    : { status: 403, error: "forbidden" };
}
