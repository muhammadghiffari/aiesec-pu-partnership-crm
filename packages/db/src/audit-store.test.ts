/** FR-100: M0-06 append-only writer and transaction use the same SQL connection. */
import { afterEach, describe, expect, it } from "vitest";
import { createAuditSqlStore } from "./audit-store";
import { freshDb, insert } from "./test-support";

describe("SQL audit transaction", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });
  it("rolls back domain writes when audit append fails", async () => {
    const db = await freshDb();
    databases.push(db);
    const category = await insert(db, "industry_categories", {
      code: "EDUCATION",
      name: "Education",
    });
    const store = createAuditSqlStore(db);
    await expect(
      store.transaction(async (audit) => {
        await db.query(
          "INSERT INTO partners (name, industry_category_id, source) VALUES ($1,$2,$3)",
          ["Synthetic", category.category_id, "Directory"],
        );
        await audit.append({
          eventId: crypto.randomUUID(),
          occurredAt: new Date(),
          kind: "MUTATION",
          actorUserId: crypto.randomUUID(),
          action: "partner.write",
          entityType: "partner",
          entityId: crypto.randomUUID(),
          metadata: {},
        });
        return true;
      }),
    ).rejects.toThrow();
    expect((await db.query("SELECT * FROM partners")).rows).toHaveLength(0);
  });
});
