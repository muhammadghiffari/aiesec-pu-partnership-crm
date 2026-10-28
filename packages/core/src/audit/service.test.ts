import { describe, expect, it } from "vitest";
import { AuditMetadataError } from "./metadata";
import { AuditWriteError } from "./service";
import { buildAuditHarness } from "./test-support";

const partnerWrite = {
  action: "partner.write" as const,
  kind: "MUTATION" as const,
  entityType: "partner",
};

describe("mutation capture", () => {
  it("writes exactly one audit event per authorized mutation with actor, action, entity, UTC time", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("staff@example.invalid");
    const result = await h.audit.audited(token, partnerWrite, () => {
      h.domain.write("partner-1", "Renamed");
      return { value: "ok", entityId: "partner-1", metadata: { changedFields: ["name"] } };
    });
    expect(result).toMatchObject({ ok: true, value: "ok" });
    expect(h.domain.records.get("partner-1")).toBe("Renamed");

    const events = await h.auditStore.list({});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: "evt-0001",
      kind: "MUTATION",
      actorUserId: "u-staff",
      action: "partner.write",
      entityType: "partner",
      entityId: "partner-1",
      metadata: { changedFields: ["name"] },
    });
    expect(events[0]?.occurredAt.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("derives the actor from the session, not from caller input", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("lcvp.pd@example.invalid");
    await h.audit.audited(token, partnerWrite, () => ({ value: 1, entityId: "p", metadata: {} }));
    expect((await h.auditStore.list({}))[0]?.actorUserId).toBe("u-lcvp");
  });

  it("records approvals and exports with their own kinds", async () => {
    const h = await buildAuditHarness();
    const lead = await h.login("tlbd@example.invalid");
    const other = await h.login("lcvp.pd@example.invalid");

    await h.audit.audited(
      other,
      {
        action: "loa.approve",
        kind: "APPROVAL",
        entityType: "loa",
        context: { submitterUserId: "u-tlbd" },
      },
      () => ({ value: 1, entityId: "loa-1", metadata: { decision: "approved" } }),
    );
    await h.audit.audited(
      lead,
      { action: "export.run", kind: "EXPORT", entityType: "essm_export" },
      () => ({ value: 1, entityId: "exp-1", metadata: { rowCount: 12, format: "xlsx" } }),
    );
    const kinds = (await h.auditStore.list({})).map(
      (e) => `${e.kind}:${e.actorUserId}:${e.action}`,
    );
    expect(kinds).toEqual(["APPROVAL:u-lcvp:loa.approve", "EXPORT:u-tlbd:export.run"]);
  });
});

describe("no mutation without an audit record (atomicity)", () => {
  it("rolls the mutation back when the audit append fails", async () => {
    const h = await buildAuditHarness({ failAudit: true });
    const token = await h.login("staff@example.invalid");
    const before = h.domain.snapshot();
    await expect(
      h.audit.audited(token, partnerWrite, () => {
        h.domain.write("partner-1", "Should not persist");
        return { value: 1, entityId: "partner-1", metadata: {} };
      }),
    ).rejects.toBeInstanceOf(AuditWriteError);
    expect(h.domain.records).toEqual(before.records);
    await expect(h.auditStore.list({})).resolves.toHaveLength(0);
  });

  it("rolls the mutation back and stores nothing when metadata is unsafe", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("staff@example.invalid");
    await expect(
      h.audit.audited(token, partnerWrite, () => {
        h.domain.write("partner-1", "Should not persist");
        return {
          value: 1,
          entityId: "partner-1",
          metadata: { summary: "call budi@example.invalid" },
        };
      }),
    ).rejects.toBeInstanceOf(AuditMetadataError);
    expect(h.domain.records.get("partner-1")).toBe("Synthetic Partner");
    expect(await h.auditStore.list({})).toHaveLength(0);
  });

  it("writes no audit event when the handler itself fails", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("staff@example.invalid");
    await expect(
      h.audit.audited(token, partnerWrite, () => {
        h.domain.write("partner-1", "partial");
        throw new Error("constraint violation");
      }),
    ).rejects.toThrow("constraint violation");
    expect(h.domain.records.get("partner-1")).toBe("Synthetic Partner");
    expect(await h.auditStore.list({})).toHaveLength(0);
  });
});

describe("unauthorized access", () => {
  it("denied roles never run the handler, and the denial is audited for the known actor", async () => {
    const h = await buildAuditHarness();
    const viewer = await h.login("viewer@example.invalid");
    const result = await h.audit.audited(viewer, partnerWrite, () => {
      h.domain.write("partner-1", "viewer wrote");
      return { value: 1, entityId: "partner-1", metadata: {} };
    });
    expect(result).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED", httpStatus: 403 });
    expect(h.domain.writes).toBe(0);

    const events = await h.auditStore.list({});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "ACCESS_DENIED",
      actorUserId: "u-viewer",
      action: "partner.write",
      metadata: { denialCode: "ACTION_NOT_PERMITTED" },
    });
    expect(events.some((e) => e.kind === "MUTATION")).toBe(false);
  });

  it("does not store anonymous or invalid-session attempts", async () => {
    const h = await buildAuditHarness();
    for (const token of [undefined, "", "forged"]) {
      const r = await h.audit.audited(token, partnerWrite, () => {
        h.domain.write("partner-1", "x");
        return { value: 1, entityId: "p", metadata: {} };
      });
      expect(r).toMatchObject({ ok: false, httpStatus: 401 });
    }
    expect(h.domain.writes).toBe(0);
    expect(await h.auditStore.list({})).toHaveLength(0);
  });

  it("LoA self-approval by either CRM Lead is denied, audited, and does not mutate", async () => {
    const h = await buildAuditHarness();
    for (const [email, id] of [
      ["tlbd@example.invalid", "u-tlbd"],
      ["lcvp.pd@example.invalid", "u-lcvp"],
    ] as const) {
      const token = await h.login(email);
      const r = await h.audit.audited(
        token,
        {
          action: "loa.approve",
          kind: "APPROVAL",
          entityType: "loa",
          context: { submitterUserId: id },
        },
        () => {
          h.domain.write("loa-1", "APPROVED");
          return { value: 1, entityId: "loa-1", metadata: {} };
        },
      );
      expect(r).toMatchObject({ ok: false, code: "SELF_APPROVAL_FORBIDDEN" });
    }
    expect(h.domain.writes).toBe(0);
    const events = await h.auditStore.list({});
    expect(events.map((e) => e.kind)).toEqual(["ACCESS_DENIED", "ACCESS_DENIED"]);
    expect(events.map((e) => e.metadata.denialCode)).toEqual([
      "SELF_APPROVAL_FORBIDDEN",
      "SELF_APPROVAL_FORBIDDEN",
    ]);
  });

  it("denial logging failure never turns a denial into an allow", async () => {
    const h = await buildAuditHarness({ denialWriterFails: true });
    const viewer = await h.login("viewer@example.invalid");
    const r = await h.audit.audited(viewer, partnerWrite, () => {
      h.domain.write("partner-1", "x");
      return { value: 1, entityId: "p", metadata: {} };
    });
    expect(r).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED" });
    expect(h.domain.writes).toBe(0);
  });

  it("denial events carry no email, token or payload", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("viewer@example.invalid");
    await h.audit.audited(token, partnerWrite, () => ({ value: 1, entityId: "p", metadata: {} }));
    const serialized = JSON.stringify(await h.auditStore.list({}));
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain(token);
  });
});

describe("append-only policy: no role can update or delete audit records", () => {
  it("audit update/delete are not authorizable for any role, including CRM Leads", async () => {
    const h = await buildAuditHarness();
    await h.audit.audited(await h.login("staff@example.invalid"), partnerWrite, () => ({
      value: 1,
      entityId: "p",
      metadata: {},
    }));
    const before = JSON.stringify(await h.auditStore.list({}));

    for (const email of [
      "tlbd@example.invalid",
      "lcvp.pd@example.invalid",
      "staff@example.invalid",
      "viewer@example.invalid",
    ]) {
      const token = await h.login(email);
      for (const action of ["audit.update", "audit.delete", "audit.purge", "audit.write"]) {
        const r = await h.audit.audited(
          token,
          { action: action as never, kind: "MUTATION", entityType: "audit" },
          () => {
            h.domain.write("audit", "tamper");
            return { value: 1, entityId: "x", metadata: {} };
          },
        );
        expect(r, `${email} ${action}`).toMatchObject({ ok: false, code: "ACTION_UNKNOWN" });
      }
    }
    expect(h.domain.writes).toBe(0);
    const stored = (await h.auditStore.list({ kind: "MUTATION" })).filter(
      (e) => e.entityType === "audit",
    );
    expect(stored).toHaveLength(0);
    expect(JSON.stringify(await h.auditStore.list({ kind: "MUTATION" }))).toBe(before);
  });
});

describe("audit read access", () => {
  it("only CRM Leads can read the audit log", async () => {
    const h = await buildAuditHarness();
    await h.audit.audited(await h.login("staff@example.invalid"), partnerWrite, () => ({
      value: 1,
      entityId: "p",
      metadata: {},
    }));
    for (const email of ["tlbd@example.invalid", "lcvp.pd@example.invalid"]) {
      const r = await h.audit.listEvents(await h.login(email), {});
      expect(r.ok && r.value.length).toBe(1);
    }
    for (const email of ["staff@example.invalid", "viewer@example.invalid"]) {
      expect(await h.audit.listEvents(await h.login(email), {})).toMatchObject({
        ok: false,
        code: "ACTION_NOT_PERMITTED",
      });
    }
    expect(await h.audit.listEvents(undefined, {})).toMatchObject({ ok: false, httpStatus: 401 });
  });
});

describe("gate overrides require an authorized lead and a reason", () => {
  const override = {
    gate: "market_research_proceed",
    entityType: "partnership_cycle",
    entityId: "cycle-1",
    reason: "Product owner approved exception for pilot partner",
  };

  it("records actor, named lead, reason, entity and timestamp for a CRM Lead", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("lcvp.pd@example.invalid");
    const r = await h.audit.overrideGate(token, override, () => {
      h.domain.write("cycle-1", "OVERRIDDEN");
      return "done";
    });
    expect(r).toMatchObject({ ok: true, value: "done" });
    expect(h.domain.records.get("cycle-1")).toBe("OVERRIDDEN");
    const [event] = await h.auditStore.list({ kind: "GATE_OVERRIDE" });
    expect(event).toMatchObject({
      kind: "GATE_OVERRIDE",
      actorUserId: "u-lcvp",
      authorizedByUserId: "u-lcvp",
      action: "gate.override",
      entityType: "partnership_cycle",
      entityId: "cycle-1",
      reason: override.reason,
      metadata: { gate: "market_research_proceed" },
    });
    expect(event?.occurredAt.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("both CRM Leads are equally authorized", async () => {
    const h = await buildAuditHarness();
    for (const email of ["tlbd@example.invalid", "lcvp.pd@example.invalid"]) {
      expect((await h.audit.overrideGate(await h.login(email), override, () => 1)).ok).toBe(true);
    }
    expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(2);
  });

  it("BD staff and viewers cannot override even with a reason; no override event is written", async () => {
    const h = await buildAuditHarness();
    for (const email of ["staff@example.invalid", "viewer@example.invalid"]) {
      const r = await h.audit.overrideGate(await h.login(email), override, () => {
        h.domain.write("cycle-1", "OVERRIDDEN");
        return 1;
      });
      expect(r).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED" });
    }
    expect(h.domain.writes).toBe(0);
    expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(0);
    expect(await h.auditStore.list({ kind: "ACCESS_DENIED" })).toHaveLength(2);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "          "],
    ["too short", "because"],
    ["too long", "x".repeat(501)],
  ])("rejects a %s reason without running the handler or writing an event", async (_n, reason) => {
    const h = await buildAuditHarness();
    const token = await h.login("tlbd@example.invalid");
    const r = await h.audit.overrideGate(token, { ...override, reason }, () => {
      h.domain.write("cycle-1", "OVERRIDDEN");
      return 1;
    });
    expect(r).toMatchObject({ ok: false, code: "REASON_REQUIRED", httpStatus: 400 });
    expect(h.domain.writes).toBe(0);
    expect(await h.auditStore.list({})).toHaveLength(0);
  });

  it("a missing reason (undefined) is rejected too", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("tlbd@example.invalid");
    const r = await h.audit.overrideGate(
      token,
      { ...override, reason: undefined as never },
      () => 1,
    );
    expect(r).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
  });

  it("an unauthorized caller gets a denial, not validation feedback, for a bad reason", async () => {
    const h = await buildAuditHarness();
    const r = await h.audit.overrideGate(
      await h.login("staff@example.invalid"),
      { ...override, reason: "" },
      () => 1,
    );
    expect(r).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED" });
  });

  it("rejects a reason containing contact PII and does not mutate", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("tlbd@example.invalid");
    await expect(
      h.audit.overrideGate(
        token,
        { ...override, reason: "Agreed by phone with budi@example.invalid yesterday" },
        () => {
          h.domain.write("cycle-1", "OVERRIDDEN");
          return 1;
        },
      ),
    ).rejects.toBeInstanceOf(AuditMetadataError);
    expect(h.domain.writes).toBe(0);
    expect(await h.auditStore.list({})).toHaveLength(0);
  });

  it("rolls the override back if the audit append fails", async () => {
    const h = await buildAuditHarness({ failAudit: true });
    const token = await h.login("tlbd@example.invalid");
    await expect(
      h.audit.overrideGate(token, override, () => {
        h.domain.write("cycle-1", "OVERRIDDEN");
        return 1;
      }),
    ).rejects.toBeInstanceOf(AuditWriteError);
    expect(h.domain.records.has("cycle-1")).toBe(false);
  });

  it("an expired session cannot override", async () => {
    const h = await buildAuditHarness();
    const token = await h.login("tlbd@example.invalid");
    h.clock.advance(9 * 60 * 60 * 1000);
    const r = await h.audit.overrideGate(token, override, () => 1);
    expect(r).toMatchObject({ ok: false, code: "SESSION_EXPIRED", httpStatus: 401 });
    expect(await h.auditStore.list({})).toHaveLength(0);
  });
});
