/**
 * Test-only helpers for the auth module: in-memory ports and an RSA JWT signer.
 * Synthetic data only (`example.invalid`). Not exported from the package index.
 */

import type { Clock, SessionRecord, SessionStore, UserDirectory, UserRecord } from "./types";

export const TEST_CLIENT_ID = "synthetic-client-id.apps.example.invalid";

export class MutableClock implements Clock {
  constructor(private current: Date = new Date("2026-10-29T03:00:00.000Z")) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class InMemoryUsers implements UserDirectory {
  readonly users = new Map<string, UserRecord>();
  constructor(users: UserRecord[] = []) {
    for (const user of users) this.users.set(user.userId, user);
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email.toLowerCase() === email) ?? null;
  }
  async findById(userId: string): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }
}

export class InMemorySessions implements SessionStore {
  readonly sessions = new Map<string, SessionRecord>();
  async create(session: SessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return [...this.sessions.values()].find((s) => s.tokenHash === tokenHash) ?? null;
  }
  async revoke(sessionId: string, at: Date): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) this.sessions.set(sessionId, { ...s, revokedAt: at });
  }
  async revokeAllForUser(userId: string, at: Date): Promise<number> {
    let count = 0;
    for (const [id, s] of this.sessions) {
      if (s.userId === userId && !s.revokedAt) {
        this.sessions.set(id, { ...s, revokedAt: at });
        count++;
      }
    }
    return count;
  }
}

export const syntheticUsers: UserRecord[] = [
  {
    userId: "u-tlbd",
    email: "tlbd@example.invalid",
    name: "Synthetic TL BD",
    accessRole: "CRM_LEAD",
    isActive: true,
    organizationalTitle: "TL BD",
  },
  {
    userId: "u-lcvp",
    email: "lcvp.pd@example.invalid",
    name: "Synthetic LCVP PD",
    accessRole: "CRM_LEAD",
    isActive: true,
    organizationalTitle: "LCVP PD",
  },
  {
    userId: "u-staff",
    email: "staff@example.invalid",
    name: "Synthetic Staff",
    accessRole: "BD_STAFF",
    isActive: true,
  },
  {
    userId: "u-viewer",
    email: "viewer@example.invalid",
    name: "Synthetic Viewer",
    accessRole: "VIEWER",
    isActive: true,
  },
  {
    userId: "u-inactive",
    email: "inactive@example.invalid",
    name: "Synthetic Inactive",
    accessRole: "BD_STAFF",
    isActive: false,
  },
  {
    userId: "u-notlisted",
    email: "notlisted@example.invalid",
    name: "Synthetic Not Allowlisted",
    accessRole: "CRM_LEAD",
    isActive: true,
  },
];

export const ALLOWLIST_RAW =
  "tlbd@example.invalid, lcvp.pd@example.invalid\nstaff@example.invalid;viewer@example.invalid, inactive@example.invalid";

// ---------- JWT signing (RS256) ----------

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface TestKeyPair {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string };
}

export async function generateTestKeyPair(kid = "test-key-1"): Promise<TestKeyPair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { kid, privateKey: pair.privateKey, publicJwk: { ...publicJwk, kid } };
}

export async function signJwt(
  key: TestKeyPair,
  claims: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: key.kid, ...headerOverrides };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64url(signature)}`;
}

export function validClaims(clock: Clock, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(clock.now().getTime() / 1000);
  return {
    iss: "https://accounts.google.com",
    aud: TEST_CLIENT_ID,
    sub: "synthetic-subject-1",
    email: "staff@example.invalid",
    email_verified: true,
    name: "Synthetic Staff",
    iat: now - 10,
    exp: now + 3600,
    ...overrides,
  };
}
