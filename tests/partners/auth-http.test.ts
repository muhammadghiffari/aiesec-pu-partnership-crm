/** FR-100: HTTP session cookie only follows the verified M0-05 sign-in flow. */
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHttp } from "../../apps/web/features/partners/auth-http";
import { createPersistedBackend } from "../../apps/web/features/partners/backend";
import { freshDb, insert } from "../../packages/db/src/test-support";

describe("auth HTTP adapter", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });
  it("rejects cross-origin sign-in and issues an HttpOnly session only for an allowlisted active user", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const backend = createPersistedBackend(db, {
      identity: {
        verify: async () => ({
          subject: "synthetic",
          email: "lead@example.invalid",
          emailVerified: true,
        }),
      },
      allowlist: "lead@example.invalid",
    });
    const handlers = createAuthHttp(async (run) => run(backend));
    const url = "https://crm.example.invalid/api/auth/session";
    expect(
      (
        await handlers.signIn(
          new Request(url, {
            method: "POST",
            headers: { origin: "https://evil.example.invalid" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    const signed = await handlers.signIn(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://crm.example.invalid", "content-type": "application/json" },
        body: JSON.stringify({ idToken: "synthetic-only-test-token" }),
      }),
    );
    expect(signed.status).toBe(200);
    for (const part of [/^crm_session=/i, /; HttpOnly;/i, /; Secure;/i, /; SameSite=Strict/i]) {
      expect(signed.headers.get("set-cookie")).toMatch(part);
    }
    expect((await db.query("SELECT * FROM user_sessions")).rows).toHaveLength(1);
    const cookie = signed.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toMatch(/^crm_session=/);
    expect(
      (
        await handlers.signOut(
          new Request(url, {
            method: "DELETE",
            headers: { origin: "https://evil.example.invalid", cookie },
          }),
        )
      ).status,
    ).toBe(403);
    const signedOut = await handlers.signOut(
      new Request(url, {
        method: "DELETE",
        headers: { origin: "https://crm.example.invalid", cookie },
      }),
    );
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(
      (await db.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM user_sessions")).rows[0]
        ?.revoked_at,
    ).not.toBeNull();
  });
});
