import { describe, expect, it } from "vitest";
import { ESSM_STAGES, type EssmStage, type StageFacts } from "./rules";
import {
  buildLifecycleHarness,
  loaWith,
  projectWith,
  researchWith,
  satisfiedFacts,
} from "./test-support";
import type { CycleRecord } from "./types";

type Harness = Awaited<ReturnType<typeof buildLifecycleHarness>>;

async function openAs(h: Harness, email = "staff@example.invalid") {
  const token = await h.login(email);
  const r = await h.lifecycle.openCycle(token, {
    partnerId: h.partnerId,
    projectSupport: "BD_PROJECT",
    approachMethod: "ACTIVE",
  });
  if (!r.ok) throw new Error(`open failed: ${r.code}`);
  return { token, cycle: r.value };
}

/** Seed a cycle directly at a given stage, bypassing the service (for precondition setup). */
function seed(h: Harness, stage: EssmStage, extra: Partial<CycleRecord> = {}): CycleRecord {
  const cycle: CycleRecord = {
    cycleId: crypto.randomUUID(),
    partnerId: h.partnerId,
    cycleNumber: 1,
    previousCycleId: null,
    salesType: "NEW",
    salesStatus: "ACTIVE",
    approachMethod: "ACTIVE",
    essmStage: stage,
    partnershipStatus:
      stage === "PARTNERSHIP_IMPLEMENTATION" || stage === "POST_SURVEY" ? "ACTIVE" : null,
    reRaiseDecision: null,
    projectSupport: "BD_PROJECT",
    openedAt: new Date("2026-10-01T00:00:00Z"),
    closedAt: null,
    ...extra,
  };
  h.repo.cycles.set(cycle.cycleId, cycle);
  return cycle;
}

const advance = (h: Harness, token: string, c: CycleRecord, extra: Record<string, unknown> = {}) =>
  h.lifecycle.advanceStage(token, { cycleId: c.cycleId, expectedStage: c.essmStage, ...extra });

describe("openCycle", () => {
  it("creates cycle 1 in PROSPECTING with ACTIVE sales status and an audit event", async () => {
    const h = await buildLifecycleHarness();
    const { cycle } = await openAs(h);
    expect(cycle).toMatchObject({
      cycleNumber: 1,
      essmStage: "PROSPECTING",
      salesType: "NEW",
      salesStatus: "ACTIVE",
      approachMethod: "ACTIVE",
      partnershipStatus: null,
      reRaiseDecision: null,
      previousCycleId: null,
      closedAt: null,
    });
    const [event] = await h.auditStore.list({ kind: "MUTATION" });
    expect(event).toMatchObject({
      actorUserId: "u-staff",
      action: "cycle.write",
      entityType: "partnership_cycle",
      entityId: cycle.cycleId,
      metadata: { essmStage: "PROSPECTING", cycleNumber: 1 },
    });
  });

  it("denies viewers and anonymous callers without creating anything; viewer denial is audited", async () => {
    const h = await buildLifecycleHarness();
    const input = { partnerId: h.partnerId, projectSupport: "OTHERS", approachMethod: "PASSIVE" };
    expect(
      await h.lifecycle.openCycle(await h.login("viewer@example.invalid"), input),
    ).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
      httpStatus: 403,
    });
    expect(await h.lifecycle.openCycle(undefined, input)).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
    expect(h.repo.cycles.size).toBe(0);
    expect((await h.auditStore.list({ kind: "ACCESS_DENIED" })).map((e) => e.actorUserId)).toEqual([
      "u-viewer",
    ]);
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(0);
  });

  it("validates input strictly: unknown fields, bad ids, forged stage/status are rejected", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const base = { partnerId: h.partnerId, projectSupport: "OTHERS", approachMethod: "ACTIVE" };
    for (const bad of [
      { ...base, partnerId: "not-a-uuid" },
      { ...base, projectSupport: "b2b" },
      { ...base, approachMethod: "COLD_CALL" },
      { ...base, essmStage: "CLOSE_DEAL" },
      { ...base, salesStatus: "INACTIVE" },
      { ...base, salesType: "RE_RAISE" },
      { ...base, cycleNumber: 9 },
      {},
      null,
    ]) {
      expect(await h.lifecycle.openCycle(token, bad), JSON.stringify(bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
        httpStatus: 400,
      });
    }
    expect(h.repo.cycles.size).toBe(0);
  });

  it("rejects an unknown partner and a partner that already has a cycle (re-raise is M5-03)", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    expect(
      await h.lifecycle.openCycle(token, {
        partnerId: crypto.randomUUID(),
        projectSupport: "OTHERS",
        approachMethod: "ACTIVE",
      }),
    ).toMatchObject({ ok: false, code: "PARTNER_NOT_FOUND", httpStatus: 404 });
    await openAs(h);
    expect(
      await h.lifecycle.openCycle(token, {
        partnerId: h.partnerId,
        projectSupport: "OTHERS",
        approachMethod: "ACTIVE",
      }),
    ).toMatchObject({ ok: false, code: "HAS_EXISTING_CYCLE", httpStatus: 409 });
    expect(h.repo.cycles.size).toBe(1);
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(1);
  });

  it("writes nothing if the audit append fails", async () => {
    const h = await buildLifecycleHarness({ failAudit: true });
    const token = await h.login("staff@example.invalid");
    await expect(
      h.lifecycle.openCycle(token, {
        partnerId: h.partnerId,
        projectSupport: "OTHERS",
        approachMethod: "ACTIVE",
      }),
    ).rejects.toThrow(/audit write failed/);
    expect(h.repo.cycles.size).toBe(0);
  });
});

describe("advanceStage: the five-stage path", () => {
  it("walks Prospecting -> Sales Process -> Close Deal -> Implementation -> Post Survey, one audited step at a time", async () => {
    const h = await buildLifecycleHarness();
    const { token, cycle } = await openAs(h);
    h.repo.facts.set(cycle.cycleId, satisfiedFacts());

    const visited: EssmStage[] = [cycle.essmStage];
    let current = cycle;
    for (let i = 0; i < 4; i++) {
      const r = await advance(h, token, current);
      if (!r.ok) throw new Error(`advance ${i} failed: ${r.code} ${r.gates}`);
      current = r.value;
      visited.push(current.essmStage);
    }
    expect(visited).toEqual([...ESSM_STAGES]);

    const events = await h.auditStore.list({ kind: "MUTATION" });
    const moves = events
      .filter((e) => e.metadata.fromStage)
      .map((e) => `${e.metadata.fromStage}>${e.metadata.toStage}`);
    expect(moves).toEqual([
      "PROSPECTING>SALES_PROCESS",
      "SALES_PROCESS>CLOSE_DEAL",
      "CLOSE_DEAL>PARTNERSHIP_IMPLEMENTATION",
      "PARTNERSHIP_IMPLEMENTATION>POST_SURVEY",
    ]);
    expect(events.every((e) => e.actorUserId === "u-staff" && e.entityId === cycle.cycleId)).toBe(
      true,
    );
  });

  it("starts the established-partnership status (ACTIVE) when implementation begins, not earlier", async () => {
    const h = await buildLifecycleHarness();
    const { token, cycle } = await openAs(h);
    h.repo.facts.set(cycle.cycleId, satisfiedFacts());
    let c = cycle;
    const statuses: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await advance(h, token, c);
      if (!r.ok) throw new Error(r.code);
      c = r.value;
      statuses.push(c.partnershipStatus);
    }
    expect(statuses).toEqual([null, null, "ACTIVE", "ACTIVE"]);
  });

  it("the last stage has no onward transition", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "POST_SURVEY");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    expect(await advance(h, token, c)).toMatchObject({
      ok: false,
      code: "TERMINAL_STAGE",
      httpStatus: 409,
    });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("POST_SURVEY");
  });

  it("cannot choose a target: skipping, going back or repeating a stage is not expressible", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    for (const extra of [
      { toStage: "CLOSE_DEAL" },
      { targetStage: "POST_SURVEY" },
      { essmStage: "SALES_PROCESS" },
    ]) {
      expect(await advance(h, token, c, extra)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("PROSPECTING");
  });

  it("rejects a stale expected stage and a replayed request (no double advance)", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    expect((await advance(h, token, c)).ok).toBe(true);
    expect(await advance(h, token, c)).toMatchObject({
      ok: false,
      code: "STALE_STAGE",
      httpStatus: 409,
    });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
    expect(
      await h.lifecycle.advanceStage(token, { cycleId: c.cycleId, expectedStage: "NOT_A_STAGE" }),
    ).toMatchObject({
      ok: false,
      code: "STALE_STAGE",
    });
  });

  it("refuses a closed cycle and an unknown cycle", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const closed = seed(h, "SALES_PROCESS", { closedAt: new Date("2026-10-15T00:00:00Z") });
    h.repo.facts.set(closed.cycleId, satisfiedFacts());
    expect(await advance(h, token, closed)).toMatchObject({ ok: false, code: "CYCLE_CLOSED" });
    expect(
      await h.lifecycle.advanceStage(token, {
        cycleId: crypto.randomUUID(),
        expectedStage: "PROSPECTING",
      }),
    ).toMatchObject({ ok: false, code: "CYCLE_NOT_FOUND", httpStatus: 404 });
  });
});

describe("advanceStage: every prerequisite blocks the move", () => {
  const blockers: [string, EssmStage, Partial<StageFacts>, string][] = [
    ["missing Market Research", "PROSPECTING", { marketResearch: null }, "MARKET_RESEARCH_MISSING"],
    [
      "Proceed not approved",
      "PROSPECTING",
      researchWith({ proceedDecision: false }),
      "PROCEED_NOT_APPROVED",
    ],
    [
      "score out of range",
      "PROSPECTING",
      researchWith({ valuesScore: 9 }),
      "ALIGNMENT_SCORES_INVALID",
    ],
    ["no sent proposal", "SALES_PROCESS", { sentProposalCount: 0 }, "PROPOSAL_NOT_SENT"],
    ["no meeting", "SALES_PROCESS", { meetingCount: 0 }, "NO_MEETING_RECORDED"],
    ["MoM not final", "SALES_PROCESS", { meetingsWithoutFinalMomCount: 2 }, "MOM_NOT_FINAL"],
    ["SnD not confirmed", "CLOSE_DEAL", { sndConfirmed: false }, "SND_NOT_CONFIRMED"],
    [
      "LoA not signed",
      "CLOSE_DEAL",
      loaWith({ status: "APPROVED", partnerSignedAt: null }),
      "LOA_NOT_FULLY_SIGNED",
    ],
    [
      "LoA self-approved",
      "CLOSE_DEAL",
      loaWith({ approvedByUserId: "u-staff" }),
      "LOA_SELF_APPROVED",
    ],
    [
      "project not finished",
      "PARTNERSHIP_IMPLEMENTATION",
      projectWith({ status: "RUNNING" }),
      "PROJECT_NOT_FINISHED",
    ],
    [
      "no report link",
      "PARTNERSHIP_IMPLEMENTATION",
      projectWith({ reportUrl: null }),
      "REPORT_URL_MISSING",
    ],
  ];

  it.each(blockers)("%s", async (_label, stage, patch, code) => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, stage);
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), ...patch });
    const r = await advance(h, token, c);
    expect(r).toMatchObject({ ok: false, code: "GATES_UNMET", httpStatus: 422 });
    expect(r.ok === false && r.gates).toContain(code);
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe(stage);
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(0);
  });

  it("reports which unmet gates a CRM Lead could waive", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "SALES_PROCESS");
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), sentProposalCount: 0, meetingCount: 0 });
    const r = await advance(h, token, c);
    expect(r).toMatchObject({
      ok: false,
      code: "GATES_UNMET",
      gates: ["PROPOSAL_NOT_SENT", "NO_MEETING_RECORDED"],
      waivableGates: ["PROPOSAL_NOT_SENT", "NO_MEETING_RECORDED"],
    });
  });

  it("re-evaluates gates inside the transaction: facts that change after the check still block", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    // 1st getFacts = planning read (passes); the human then withdraws Proceed before the commit.
    h.repo.onGetFacts = (id, call) => {
      if (call === 1) {
        h.repo.facts.set(id, researchWith({ proceedDecision: false }));
      }
    };
    expect(await advance(h, token, c)).toMatchObject({ ok: false, code: "GATES_UNMET" });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("PROSPECTING");
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(0);
  });

  it("a concurrent stage change during the write is detected and rolled back", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    h.repo.beforeUpdate = (id) => {
      const cur = h.repo.cycles.get(id);
      if (cur) h.repo.cycles.set(id, { ...cur, essmStage: "SALES_PROCESS" }); // someone else moved it
    };
    expect(await advance(h, token, c)).toMatchObject({ ok: false, code: "STALE_STAGE" });
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(0);
  });

  it("an audit failure rolls the stage change back", async () => {
    const h = await buildLifecycleHarness({ failAudit: true });
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    await expect(advance(h, token, c)).rejects.toThrow(/audit write failed/);
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("PROSPECTING");
  });
});

describe("advanceStage: authorization (no probing, no mutation)", () => {
  it("viewers and anonymous callers are denied before any cycle data is read", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    const viewer = await h.login("viewer@example.invalid");
    for (const token of [viewer, undefined, "forged"]) {
      for (const id of [c.cycleId, crypto.randomUUID()]) {
        const r = await h.lifecycle.advanceStage(token, {
          cycleId: id,
          expectedStage: "PROSPECTING",
        });
        // Same answer for an existing and a non-existing cycle: no existence oracle.
        expect(r).toMatchObject({ ok: false });
        expect([401, 403]).toContain(r.ok ? 0 : r.httpStatus);
        expect(r.ok === false && r.code).not.toBe("CYCLE_NOT_FOUND");
      }
    }
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("PROSPECTING");
  });

  it("an expired session cannot advance", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    h.clock.advance(9 * 60 * 60 * 1000);
    expect(await advance(h, token, c)).toMatchObject({
      ok: false,
      code: "SESSION_EXPIRED",
      httpStatus: 401,
    });
  });

  it("TL BD and LCVP PD behave identically for the same advance", async () => {
    const outcomes: unknown[] = [];
    for (const email of ["tlbd@example.invalid", "lcvp.pd@example.invalid"]) {
      const h = await buildLifecycleHarness();
      const token = await h.login(email);
      const c = seed(h, "SALES_PROCESS");
      h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), sndConfirmed: false });
      const r = await advance(h, token, c);
      outcomes.push(r.ok ? "ok" : { code: r.code, gates: r.gates });
      const ok = await h.lifecycle.advanceStage(token, {
        cycleId: c.cycleId,
        expectedStage: "SALES_PROCESS",
      });
      outcomes.push(ok.ok);
    }
    expect(outcomes[0]).toEqual(outcomes[2]);
    expect(outcomes[1]).toEqual(outcomes[3]);
  });
});

describe("gate waivers (CRM Lead only, reason required, soft gates only)", () => {
  const reason = "Product owner approved pilot partner without a meeting";

  async function softBlocked() {
    const h = await buildLifecycleHarness();
    const c = seed(h, "SALES_PROCESS");
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), meetingCount: 0 });
    return { h, c };
  }

  it("a CRM Lead can waive a soft gate: stage moves and a GATE_OVERRIDE records who, why, which gate", async () => {
    const { h, c } = await softBlocked();
    const token = await h.login("lcvp.pd@example.invalid");
    const r = await advance(h, token, c, { waiver: { reason } });
    expect(r).toMatchObject({ ok: true, value: { essmStage: "CLOSE_DEAL" } });
    const [event] = await h.auditStore.list({ kind: "GATE_OVERRIDE" });
    expect(event).toMatchObject({
      actorUserId: "u-lcvp",
      authorizedByUserId: "u-lcvp",
      entityType: "partnership_cycle",
      entityId: c.cycleId,
      reason,
      metadata: { gate: "SALES_PROCESS>CLOSE_DEAL|NO_MEETING_RECORDED" },
    });
  });

  it("both CRM Leads can waive equally", async () => {
    for (const email of ["tlbd@example.invalid", "lcvp.pd@example.invalid"]) {
      const { h, c } = await softBlocked();
      expect((await advance(h, await h.login(email), c, { waiver: { reason } })).ok).toBe(true);
    }
  });

  it("BD staff cannot waive; nothing changes and the denial is audited", async () => {
    const { h, c } = await softBlocked();
    const token = await h.login("staff@example.invalid");
    expect(await advance(h, token, c, { waiver: { reason } })).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
      httpStatus: 403,
    });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
    expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(0);
    expect(await h.auditStore.list({ kind: "ACCESS_DENIED" })).toHaveLength(1);
  });

  it.each([
    ["short", "no reason"],
    ["empty", ""],
    ["blank", "           "],
  ])("rejects a %s reason", async (_n, bad) => {
    const { h, c } = await softBlocked();
    const token = await h.login("tlbd@example.invalid");
    expect(await advance(h, token, c, { waiver: { reason: bad } })).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
  });

  it("without a waiver the same lead is blocked by the same soft gate", async () => {
    const { h, c } = await softBlocked();
    const token = await h.login("tlbd@example.invalid");
    expect(await advance(h, token, c)).toMatchObject({
      ok: false,
      code: "GATES_UNMET",
      waivableGates: ["NO_MEETING_RECORDED"],
    });
  });

  it("hard gates can never be waived, even by a CRM Lead with a reason", async () => {
    const hard: [EssmStage, Partial<StageFacts>][] = [
      ["PROSPECTING", { marketResearch: null }],
      ["CLOSE_DEAL", { sndConfirmed: false }],
      ["CLOSE_DEAL", loaWith({ partnerSignedAt: null })],
      ["CLOSE_DEAL", loaWith({ approvedByUserId: "u-staff" })],
      ["PARTNERSHIP_IMPLEMENTATION", projectWith({ reportUrl: null })],
    ];
    for (const [stage, patch] of hard) {
      const h = await buildLifecycleHarness();
      const c = seed(h, stage);
      h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), ...patch });
      const r = await advance(h, await h.login("tlbd@example.invalid"), c, { waiver: { reason } });
      expect(r, `${stage} ${JSON.stringify(Object.keys(patch))}`).toMatchObject({
        ok: false,
        code: "WAIVER_NOT_ALLOWED",
      });
      expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe(stage);
      expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(0);
    }
  });

  it("when several Close Deal gates fail together, none of them can be waived", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "CLOSE_DEAL");
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), sndConfirmed: false, loa: null });
    const r = await advance(h, await h.login("tlbd@example.invalid"), c, { waiver: { reason } });
    expect(r).toMatchObject({
      ok: false,
      code: "WAIVER_NOT_ALLOWED",
      gates: ["SND_NOT_CONFIRMED", "LOA_MISSING"],
    });
    expect(r.ok === false && r.waivableGates).toEqual([]);
  });

  it("a waiver with nothing to waive is refused (no meaningless override events)", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "SALES_PROCESS");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    expect(
      await advance(h, await h.login("tlbd@example.invalid"), c, { waiver: { reason } }),
    ).toMatchObject({
      ok: false,
      code: "WAIVER_NOT_NEEDED",
    });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
    expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(0);
  });

  it("a waiver only covers the gates the lead was shown: a newly failing gate invalidates it", async () => {
    const { h, c } = await softBlocked();
    h.repo.onGetFacts = (id, call) => {
      if (call === 1)
        h.repo.facts.set(id, { ...satisfiedFacts(), meetingCount: 0, sentProposalCount: 0 });
    };
    const r = await advance(h, await h.login("tlbd@example.invalid"), c, { waiver: { reason } });
    expect(r).toMatchObject({ ok: false, code: "WAIVER_STALE" });
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
    expect(await h.auditStore.list({ kind: "GATE_OVERRIDE" })).toHaveLength(0);
  });

  it("rolls the waived move back if the audit write fails", async () => {
    const h = await buildLifecycleHarness({ failAudit: true });
    const c = seed(h, "SALES_PROCESS");
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), meetingCount: 0 });
    await expect(
      advance(h, await h.login("tlbd@example.invalid"), c, { waiver: { reason } }),
    ).rejects.toThrow(/audit write failed/);
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("SALES_PROCESS");
  });
});

describe("separate dimensions never move the stage", () => {
  it("sales status changes only the sales status, leaves other dimensions alone, and is audited", async () => {
    const h = await buildLifecycleHarness();
    const { token, cycle } = await openAs(h);
    const r = await h.lifecycle.setSalesStatus(token, {
      cycleId: cycle.cycleId,
      status: "INACTIVE",
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        salesStatus: "INACTIVE",
        essmStage: "PROSPECTING",
        approachMethod: "ACTIVE",
        partnershipStatus: null,
      },
    });
    const [e] = (await h.auditStore.list({ kind: "MUTATION" })).slice(-1);
    expect(e?.metadata).toMatchObject({
      dimension: "salesStatus",
      from: "ACTIVE",
      to: "INACTIVE",
      stage: "PROSPECTING",
    });
  });

  it("approach method is separate and locked once the deal is being closed", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const early = seed(h, "SALES_PROCESS");
    expect(
      await h.lifecycle.setApproachMethod(token, { cycleId: early.cycleId, method: "PASSIVE" }),
    ).toMatchObject({
      ok: true,
      value: { approachMethod: "PASSIVE", essmStage: "SALES_PROCESS" },
    });
    const late = seed(h, "CLOSE_DEAL", { cycleNumber: 2 });
    expect(
      await h.lifecycle.setApproachMethod(token, { cycleId: late.cycleId, method: "PASSIVE" }),
    ).toMatchObject({
      ok: false,
      code: "STATUS_NOT_ALLOWED_IN_STAGE",
    });
  });

  it("sales status is frozen once implementation starts", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PARTNERSHIP_IMPLEMENTATION");
    expect(
      await h.lifecycle.setSalesStatus(token, { cycleId: c.cycleId, status: "INACTIVE" }),
    ).toMatchObject({
      ok: false,
      code: "STATUS_NOT_ALLOWED_IN_STAGE",
    });
  });

  it("setting the same value again is a no-op error, not a second audit event", async () => {
    const h = await buildLifecycleHarness();
    const { token, cycle } = await openAs(h);
    expect(
      await h.lifecycle.setSalesStatus(token, { cycleId: cycle.cycleId, status: "ACTIVE" }),
    ).toMatchObject({
      ok: false,
      code: "NO_CHANGE",
    });
    expect(await h.auditStore.list({ kind: "MUTATION" })).toHaveLength(1); // only the open event
  });

  it("partnership Active/Break/Finish exists only from implementation; BREAK/FINISH need a reason", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const pre = seed(h, "SALES_PROCESS");
    expect(
      await h.lifecycle.setPartnershipStatus(token, { cycleId: pre.cycleId, status: "ACTIVE" }),
    ).toMatchObject({
      ok: false,
      code: "STATUS_NOT_ALLOWED_IN_STAGE",
    });

    const c = seed(h, "PARTNERSHIP_IMPLEMENTATION", { cycleNumber: 2 });
    expect(
      await h.lifecycle.setPartnershipStatus(token, { cycleId: c.cycleId, status: "BREAK" }),
    ).toMatchObject({
      ok: false,
      code: "REASON_REQUIRED",
      httpStatus: 400,
    });
    expect(
      await h.lifecycle.setPartnershipStatus(token, {
        cycleId: c.cycleId,
        status: "BREAK",
        reason: "Partner budget freeze",
      }),
    ).toMatchObject({
      ok: true,
      value: { partnershipStatus: "BREAK", essmStage: "PARTNERSHIP_IMPLEMENTATION" },
    });
    expect((await h.auditStore.list({ kind: "MUTATION" })).at(-1)?.metadata).toMatchObject({
      dimension: "partnershipStatus",
      from: "ACTIVE",
      to: "BREAK",
      reason: "Partner budget freeze",
    });
    expect(
      await h.lifecycle.setPartnershipStatus(token, { cycleId: c.cycleId, status: "ACTIVE" }),
    ).toMatchObject({
      ok: true,
      value: { partnershipStatus: "ACTIVE" },
    });
  });

  it("FINISH is terminal, does not move the stage, and a finished partnership cannot be reopened", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PARTNERSHIP_IMPLEMENTATION");
    const done = await h.lifecycle.setPartnershipStatus(token, {
      cycleId: c.cycleId,
      status: "FINISH",
      reason: "Programme completed as agreed",
    });
    expect(done).toMatchObject({
      ok: true,
      value: { partnershipStatus: "FINISH", essmStage: "PARTNERSHIP_IMPLEMENTATION" },
    });
    for (const status of ["ACTIVE", "BREAK"] as const) {
      expect(
        await h.lifecycle.setPartnershipStatus(token, {
          cycleId: c.cycleId,
          status,
          reason: "Trying to reopen",
        }),
      ).toMatchObject({ ok: false, code: "INVALID_PARTNERSHIP_TRANSITION" });
    }
  });

  it("the re-raise decision is never written by the lifecycle service", async () => {
    const h = await buildLifecycleHarness();
    const token = await h.login("staff@example.invalid");
    const c = seed(h, "PARTNERSHIP_IMPLEMENTATION", { reRaiseDecision: "PLANNING_TO" });
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    await advance(h, token, c);
    await h.lifecycle.setPartnershipStatus(token, {
      cycleId: c.cycleId,
      status: "FINISH",
      reason: "Completed",
    });
    expect(h.repo.cycles.get(c.cycleId)?.reRaiseDecision).toBe("PLANNING_TO");
    expect(
      await h.lifecycle.setSalesStatus(token, {
        cycleId: c.cycleId,
        status: "INACTIVE",
        reRaiseDecision: "YES",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("viewers and anonymous callers cannot change any dimension", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "PARTNERSHIP_IMPLEMENTATION");
    const viewer = await h.login("viewer@example.invalid");
    for (const token of [viewer, undefined]) {
      expect(
        (await h.lifecycle.setSalesStatus(token, { cycleId: c.cycleId, status: "INACTIVE" })).ok,
      ).toBe(false);
      expect(
        (await h.lifecycle.setApproachMethod(token, { cycleId: c.cycleId, method: "PASSIVE" })).ok,
      ).toBe(false);
      expect(
        (
          await h.lifecycle.setPartnershipStatus(token, {
            cycleId: c.cycleId,
            status: "BREAK",
            reason: "attempt",
          })
        ).ok,
      ).toBe(false);
    }
    expect(h.repo.cycles.get(c.cycleId)).toMatchObject({
      salesStatus: "ACTIVE",
      approachMethod: "ACTIVE",
      partnershipStatus: "ACTIVE",
    });
  });
});

describe("reads", () => {
  it("viewers may read a cycle, list a partner's cycles and preview blockers; anonymous may not", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "SALES_PROCESS");
    h.repo.facts.set(c.cycleId, { ...satisfiedFacts(), meetingCount: 0 });
    const viewer = await h.login("viewer@example.invalid");
    expect(await h.lifecycle.getCycle(viewer, c.cycleId)).toMatchObject({
      ok: true,
      value: { cycleId: c.cycleId },
    });
    expect(await h.lifecycle.listCycles(viewer, h.partnerId)).toMatchObject({ ok: true });
    expect(await h.lifecycle.previewAdvance(viewer, c.cycleId)).toMatchObject({
      ok: true,
      value: {
        from: "SALES_PROCESS",
        to: "CLOSE_DEAL",
        unmet: ["NO_MEETING_RECORDED"],
        waivable: ["NO_MEETING_RECORDED"],
      },
    });
    expect(await h.lifecycle.getCycle(undefined, c.cycleId)).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
    expect(await h.lifecycle.getCycle(viewer, crypto.randomUUID())).toMatchObject({
      ok: false,
      code: "CYCLE_NOT_FOUND",
    });
    expect(await h.lifecycle.getCycle(viewer, "nope")).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });

  it("previews make no change and write no audit event", async () => {
    const h = await buildLifecycleHarness();
    const c = seed(h, "PROSPECTING");
    h.repo.facts.set(c.cycleId, satisfiedFacts());
    await h.lifecycle.previewAdvance(await h.login("staff@example.invalid"), c.cycleId);
    expect(h.repo.cycles.get(c.cycleId)?.essmStage).toBe("PROSPECTING");
    expect(await h.auditStore.list({})).toHaveLength(0);
  });
});
