import { beforeAll, describe, expect, it } from "vitest";
import { createStaticAllowlist } from "./allowlist";
import { createGoogleIdentityVerifier } from "./google-id-token";
import { createSessionService, hashSessionToken } from "./session";
import {
  ALLOWLIST_RAW,
  generateTestKeyPair,
  InMemorySessions,
  InMemoryUsers,
  MutableClock,
  signJwt,
  syntheticUsers,
  TEST_CLIENT_ID,
  type TestKeyPair,
  validClaims,
} from "./test-support";
import { toPublicDenial } from "./types";

let key: TestKeyPair;
beforeAll(async () => {
  key = await generateTestKeyPair();
});

function setup(options: { viewerEnabled?: boolean; ttl?: number; allowlist?: string } = {}) {
  const clock = new MutableClock();
  const users = new InMemoryUsers(syntheticUsers.map((u) => ({ ...u })));
  const sessions = new InMemorySessions();
  const service = createSessionService({
    identity: createGoogleIdentityVerifier({
      clientId: TEST_CLIENT_ID,
      jwks: { getKeys: async () => [key.publicJwk] },
      clock,
    }),
    allowlist: createStaticAllowlist(options.allowlist ?? ALLOWLIST_RAW),
    users,
    sessions,
    clock,
    viewerEnabled: options.viewerEnabled,
    sessionTtlMs: options.ttl,
  });
  const tokenFor = (email: string, extra: Record<string, unknown> = {}) =>
    signJwt(key, validClaims(clock, { email, ...extra }));
  return { clock, users, sessions, service, tokenFor };
}

describe("sign-in", () => {
  it("creates a session for an allowlisted, active user and derives the role from the DB", async () => {
    const { service, tokenFor, sessions } = setup();
    const result = await service.signIn(await tokenFor("staff@example.invalid"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.principal).toMatchObject({ userId: "u-staff", accessRole: "BD_STAFF" });
    expect(sessions.sessions.size).toBe(1);
  });

  it("stores only a hash of the session token", async () => {
    const { service, tokenFor, sessions } = setup();
    const result = await service.signIn(await tokenFor("staff@example.invalid"));
    if (!result.ok) throw new Error("expected sign-in");
    const [record] = [...sessions.sessions.values()];
    expect(record?.tokenHash).toBe(await hashSessionToken(result.sessionToken));
    expect(JSON.stringify(record)).not.toContain(result.sessionToken);
    expect(result.sessionToken.length).toBeGreaterThanOrEqual(43); // 256-bit base64url
  });

  it("issues unique tokens per sign-in", async () => {
    const { service, tokenFor } = setup();
    const a = await service.signIn(await tokenFor("staff@example.invalid"));
    const b = await service.signIn(await tokenFor("staff@example.invalid"));
    if (!a.ok || !b.ok) throw new Error("expected sign-in");
    expect(a.sessionToken).not.toBe(b.sessionToken);
  });

  it("denies a verified Google identity that is not on the allowlist, creating no session", async () => {
    const { service, tokenFor, sessions } = setup();
    const result = await service.signIn(await tokenFor("notlisted@example.invalid"));
    expect(result).toMatchObject({ ok: false, code: "NOT_ALLOWLISTED", httpStatus: 403 });
    expect(sessions.sessions.size).toBe(0);
  });

  it("denies an allowlisted email that has no user row", async () => {
    const { service, tokenFor, sessions } = setup({
      allowlist: `${ALLOWLIST_RAW}, ghost@example.invalid`,
    });
    const result = await service.signIn(await tokenFor("ghost@example.invalid"));
    expect(result).toMatchObject({ ok: false, code: "USER_NOT_FOUND" });
    expect(sessions.sessions.size).toBe(0);
  });

  it("denies inactive users even when allowlisted", async () => {
    const { service, tokenFor, sessions } = setup();
    const result = await service.signIn(await tokenFor("inactive@example.invalid"));
    expect(result).toMatchObject({ ok: false, code: "USER_INACTIVE" });
    expect(sessions.sessions.size).toBe(0);
  });

  it("denies every sign-in when the allowlist is empty", async () => {
    const { service, tokenFor } = setup({ allowlist: "" });
    for (const email of ["tlbd@example.invalid", "staff@example.invalid"]) {
      expect(await service.signIn(await tokenFor(email))).toMatchObject({ ok: false });
    }
  });

  it("keeps VIEWER disabled unless explicitly enabled", async () => {
    const off = setup();
    expect(await off.service.signIn(await off.tokenFor("viewer@example.invalid"))).toMatchObject({
      ok: false,
      code: "VIEWER_DISABLED",
    });
    const on = setup({ viewerEnabled: true });
    expect(await on.service.signIn(await on.tokenFor("viewer@example.invalid"))).toMatchObject({
      ok: true,
    });
  });

  it("denies invalid identity tokens as 401 without touching users or sessions", async () => {
    const { service, sessions, clock } = setup();
    const expired = await signJwt(key, validClaims(clock, { exp: 1 }));
    for (const bad of ["garbage", expired, ""]) {
      expect(await service.signIn(bad)).toMatchObject({
        ok: false,
        code: "INVALID_IDENTITY_TOKEN",
        httpStatus: 401,
      });
    }
    expect(sessions.sessions.size).toBe(0);
  });

  it("rejects an unverified-email token even for an allowlisted address", async () => {
    const { service, tokenFor } = setup();
    const result = await service.signIn(
      await tokenFor("tlbd@example.invalid", { email_verified: false }),
    );
    expect(result).toMatchObject({ ok: false, code: "INVALID_IDENTITY_TOKEN" });
  });
});

describe("per-request authentication and session states", () => {
  async function signedIn(email = "staff@example.invalid", options = {}) {
    const ctx = setup(options);
    const result = await ctx.service.signIn(await ctx.tokenFor(email));
    if (!result.ok) throw new Error("expected sign-in");
    return { ...ctx, token: result.sessionToken };
  }

  it("authenticates a valid session", async () => {
    const { service, token } = await signedIn();
    expect(await service.authenticate(token)).toMatchObject({
      ok: true,
      principal: { userId: "u-staff", accessRole: "BD_STAFF" },
    });
  });

  it("denies missing, empty and unknown tokens as NO_SESSION (401)", async () => {
    const { service } = await signedIn();
    for (const t of [undefined, null, "", "unknown-token"]) {
      expect(await service.authenticate(t)).toMatchObject({
        ok: false,
        code: "NO_SESSION",
        httpStatus: 401,
      });
    }
  });

  it("denies expired sessions and boundary-exact expiry", async () => {
    const { service, token, clock } = await signedIn("staff@example.invalid", { ttl: 60_000 });
    clock.advance(59_999);
    expect((await service.authenticate(token)).ok).toBe(true);
    clock.advance(1);
    expect(await service.authenticate(token)).toMatchObject({
      ok: false,
      code: "SESSION_EXPIRED",
      httpStatus: 401,
    });
  });

  it("denies revoked sessions after sign-out", async () => {
    const { service, token } = await signedIn();
    await service.signOut(token);
    expect(await service.authenticate(token)).toMatchObject({ ok: false, code: "SESSION_REVOKED" });
  });

  it("deactivating a user takes effect immediately on an existing session", async () => {
    const { service, token, users } = await signedIn();
    const u = users.users.get("u-staff");
    if (!u) throw new Error("missing");
    users.users.set("u-staff", { ...u, isActive: false });
    expect(await service.authenticate(token)).toMatchObject({ ok: false, code: "USER_INACTIVE" });
  });

  it("removal from the allowlist takes effect immediately on an existing session", async () => {
    const live = new Set(["staff@example.invalid"]);
    const clock = new MutableClock();
    const users = new InMemoryUsers(syntheticUsers.map((u) => ({ ...u })));
    const service = createSessionService({
      identity: createGoogleIdentityVerifier({
        clientId: TEST_CLIENT_ID,
        jwks: { getKeys: async () => [key.publicJwk] },
        clock,
      }),
      allowlist: { isAllowed: (e) => live.has(e) },
      users,
      sessions: new InMemorySessions(),
      clock,
    });
    const result = await service.signIn(await signJwt(key, validClaims(clock)));
    if (!result.ok) throw new Error("expected sign-in");
    expect((await service.authenticate(result.sessionToken)).ok).toBe(true);
    live.delete("staff@example.invalid");
    expect(await service.authenticate(result.sessionToken)).toMatchObject({
      ok: false,
      code: "NOT_ALLOWLISTED",
    });
  });

  it("deleting the user row denies the session", async () => {
    const { service, token, users } = await signedIn();
    users.users.delete("u-staff");
    expect(await service.authenticate(token)).toMatchObject({ ok: false, code: "USER_NOT_FOUND" });
  });

  it("role changes apply immediately because the role is read from the DB each request", async () => {
    const { service, token, users } = await signedIn();
    const u = users.users.get("u-staff");
    if (!u) throw new Error("missing");
    users.users.set("u-staff", { ...u, accessRole: "CRM_LEAD" });
    expect(await service.authenticate(token)).toMatchObject({
      principal: { accessRole: "CRM_LEAD" },
    });
    users.users.set("u-staff", { ...u, accessRole: "VIEWER" });
    expect(await service.authenticate(token)).toMatchObject({ ok: false, code: "VIEWER_DISABLED" });
  });

  it("revokeAllForUser invalidates all of a user's sessions", async () => {
    const ctx = setup();
    const a = await ctx.service.signIn(await ctx.tokenFor("staff@example.invalid"));
    const b = await ctx.service.signIn(await ctx.tokenFor("staff@example.invalid"));
    const other = await ctx.service.signIn(await ctx.tokenFor("tlbd@example.invalid"));
    if (!a.ok || !b.ok || !other.ok) throw new Error("expected sign-in");
    expect(await ctx.service.revokeAllForUser("u-staff")).toBe(2);
    expect((await ctx.service.authenticate(a.sessionToken)).ok).toBe(false);
    expect((await ctx.service.authenticate(b.sessionToken)).ok).toBe(false);
    expect((await ctx.service.authenticate(other.sessionToken)).ok).toBe(true);
  });

  it("a session token cannot be reused after the client-visible token is altered", async () => {
    const { service, token } = await signedIn();
    expect((await service.authenticate(`${token}x`)).ok).toBe(false);
    expect((await service.authenticate(token.slice(0, -1))).ok).toBe(false);
  });
});

describe("public denial mapping", () => {
  it("does not distinguish allowlist, missing-user and inactive causes externally", () => {
    const codes = [
      "NOT_ALLOWLISTED",
      "USER_NOT_FOUND",
      "USER_INACTIVE",
      "VIEWER_DISABLED",
    ] as const;
    const bodies = codes.map((code) => toPublicDenial({ ok: false, code, httpStatus: 403 }));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(toPublicDenial({ ok: false, code: "NO_SESSION", httpStatus: 401 })).toEqual({
      status: 401,
      error: "authentication_required",
    });
  });
});
