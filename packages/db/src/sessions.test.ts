/** FR-100: database adapters implement M0-05 user/session ports. */
import { afterEach, describe, expect, it } from "vitest";
import { createSessionStore, createUserDirectory } from "./sessions";
import { freshDb, insert } from "./test-support";

describe("SQL session and user adapters", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });
  it("loads active roles from users and revokes a persisted session", async () => {
    const db = await freshDb();
    databases.push(db);
    const user = await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const users = createUserDirectory(db);
    const store = createSessionStore(db);
    expect((await users.findByEmail("lead@example.invalid"))?.accessRole).toBe("CRM_LEAD");
    const id = crypto.randomUUID();
    const tokenHash = "a".repeat(64);
    await store.create({
      sessionId: id,
      userId: String(user.user_id),
      tokenHash,
      createdAt: new Date("2026-10-29T02:00:00Z"),
      expiresAt: new Date("2026-10-29T10:00:00Z"),
    });
    expect((await store.findByTokenHash(tokenHash))?.userId).toBe(user.user_id);
    await store.revoke(id, new Date("2026-10-29T03:00:00Z"));
    expect((await store.findByTokenHash(tokenHash))?.revokedAt).toBeInstanceOf(Date);
    expect(await store.revokeAllForUser(String(user.user_id), new Date())).toBe(0);
  });
});
