import { describe, expect, it } from "vitest";
import { createInMemoryAuditStore, DuplicateAuditEventError } from "./memory-store";
import type { AuditEvent } from "./types";

function event(id: string, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: id,
    occurredAt: new Date("2026-10-29T03:00:00.000Z"),
    kind: "MUTATION",
    actorUserId: "u-staff",
    action: "partner.write",
    entityType: "partner",
    entityId: "p-1",
    metadata: { changedFields: ["status"] },
    ...overrides,
  };
}

describe("in-memory append-only audit store", () => {
  it("exposes append and list only — no update or delete surface", () => {
    const store = createInMemoryAuditStore();
    const surface = Object.keys(store).sort();
    expect(surface).toEqual(["append", "list", "size"]);
    for (const name of ["update", "delete", "remove", "clear", "truncate", "set", "put"]) {
      expect((store as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it("stores and returns immutable copies", async () => {
    const store = createInMemoryAuditStore();
    const source = event("e1");
    const returned = await store.append(source);
    expect(Object.isFrozen(returned)).toBe(true);
    expect(Object.isFrozen(returned.metadata)).toBe(true);

    // Caller-side tampering after the fact does not reach stored state.
    source.occurredAt.setUTCFullYear(1999);
    expect(() => {
      (returned as { actorUserId: string }).actorUserId = "attacker";
    }).toThrow();
    const [stored] = await store.list({});
    expect(stored?.occurredAt.toISOString()).toBe("2026-10-29T03:00:00.000Z");
    expect(stored?.actorUserId).toBe("u-staff");

    // Mutating a listed copy does not reach stored state either.
    stored?.occurredAt.setUTCFullYear(1999);
    const [again] = await store.list({});
    expect(again?.occurredAt.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("refuses to overwrite an existing event id", async () => {
    const store = createInMemoryAuditStore();
    await store.append(event("e1"));
    await expect(store.append(event("e1", { actorUserId: "someone-else" }))).rejects.toBeInstanceOf(
      DuplicateAuditEventError,
    );
    expect(store.size).toBe(1);
    expect((await store.list({}))[0]?.actorUserId).toBe("u-staff");
  });

  it("filters by actor, entity, action, kind and time", async () => {
    const store = createInMemoryAuditStore();
    await store.append(event("e1"));
    await store.append(
      event("e2", { actorUserId: "u-tlbd", entityId: "p-2", kind: "EXPORT", action: "export.run" }),
    );
    await store.append(event("e3", { occurredAt: new Date("2026-10-30T00:00:00.000Z") }));
    expect((await store.list({ actorUserId: "u-tlbd" })).map((e) => e.eventId)).toEqual(["e2"]);
    expect((await store.list({ entityId: "p-1" })).map((e) => e.eventId)).toEqual(["e1", "e3"]);
    expect((await store.list({ kind: "EXPORT" })).map((e) => e.eventId)).toEqual(["e2"]);
    expect((await store.list({ action: "export.run" })).length).toBe(1);
    expect(
      (await store.list({ from: new Date("2026-10-30T00:00:00.000Z") })).map((e) => e.eventId),
    ).toEqual(["e3"]);
  });

  it("caps result size and keeps most recent events", async () => {
    const store = createInMemoryAuditStore();
    for (let i = 0; i < 600; i++) await store.append(event(`e${i}`));
    expect((await store.list({})).length).toBe(100);
    expect((await store.list({ limit: 10_000 })).length).toBe(500);
    expect((await store.list({ limit: 2 })).map((e) => e.eventId)).toEqual(["e598", "e599"]);
  });
});
