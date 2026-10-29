import { describe, expect, it } from "vitest";
import {
  canChangeApproachMethod,
  canChangePartnershipStatus,
  canChangeSalesStatus,
  canMovePartnershipStatus,
  checkTransition,
  EMPTY_FACTS,
  ESSM_STAGES,
  type EssmStage,
  GATE_CODES,
  type GateCode,
  isWaivable,
  nextStage,
  PARTNERSHIP_STATUSES,
  type StageFacts,
  unmetGates,
  WAIVABLE_GATES,
} from "./rules";
import { satisfiedFacts } from "./test-support";

describe("canonical five stages", () => {
  it("are exactly the five ESSM stages, in order, with no sub-activity or legacy values", () => {
    expect([...ESSM_STAGES]).toEqual([
      "PROSPECTING",
      "SALES_PROCESS",
      "CLOSE_DEAL",
      "PARTNERSHIP_IMPLEMENTATION",
      "POST_SURVEY",
    ]);
  });

  it("nextStage walks forward and ends at POST_SURVEY", () => {
    expect(ESSM_STAGES.map(nextStage)).toEqual([
      "SALES_PROCESS",
      "CLOSE_DEAL",
      "PARTNERSHIP_IMPLEMENTATION",
      "POST_SURVEY",
      null,
    ]);
  });
});

describe("transition matrix (5 x 5)", () => {
  const allowed = new Set([
    "PROSPECTING>SALES_PROCESS",
    "SALES_PROCESS>CLOSE_DEAL",
    "CLOSE_DEAL>PARTNERSHIP_IMPLEMENTATION",
    "PARTNERSHIP_IMPLEMENTATION>POST_SURVEY",
  ]);

  for (const from of ESSM_STAGES) {
    for (const to of ESSM_STAGES) {
      const key = `${from}>${to}`;
      const fi = ESSM_STAGES.indexOf(from);
      const ti = ESSM_STAGES.indexOf(to);
      const reason = from === to ? "SAME_STAGE" : ti < fi ? "BACKWARD" : "SKIPS_STAGE";
      it(`${key} is ${allowed.has(key) ? "allowed" : `forbidden (${reason})`}`, () => {
        const result = checkTransition(from, to);
        expect(result.allowed).toBe(allowed.has(key));
        if (!result.allowed) expect(result.reason).toBe(reason);
      });
    }
  }

  it("allows exactly 4 of the 25 pairs", () => {
    let count = 0;
    for (const a of ESSM_STAGES)
      for (const b of ESSM_STAGES) if (checkTransition(a, b).allowed) count++;
    expect(count).toBe(4);
  });

  it.each([
    ["OUTREACHING", "SALES_PROCESS"],
    ["PROSPECTING", "MEETING"],
    ["PROSPECTING", "CONTRACT_SIGNED"],
    ["B2B", "B2C"],
    ["", ""],
    ["prospecting", "sales_process"],
  ])("rejects unknown or sub-activity stage %s -> %s", (from, to) => {
    expect(checkTransition(from, to)).toEqual({ allowed: false, reason: "UNKNOWN_STAGE" });
  });
});

describe("prerequisite gates", () => {
  const full = satisfiedFacts();
  const with_ = (patch: Partial<StageFacts>): StageFacts => ({ ...full, ...patch });
  const research = (patch: Partial<NonNullable<StageFacts["marketResearch"]>>) =>
    with_({
      marketResearch: {
        ...(full.marketResearch as NonNullable<StageFacts["marketResearch"]>),
        ...patch,
      },
    });
  const loa = (patch: Partial<NonNullable<StageFacts["loa"]>>) =>
    with_({ loa: { ...(full.loa as NonNullable<StageFacts["loa"]>), ...patch } });
  const project = (patch: Partial<NonNullable<StageFacts["project"]>>) =>
    with_({ project: { ...(full.project as NonNullable<StageFacts["project"]>), ...patch } });

  it("no gates are unmet when everything is satisfied; the terminal stage has none", () => {
    for (const stage of ESSM_STAGES) expect(unmetGates(stage, full)).toEqual([]);
  });

  it("an empty cycle is blocked at every non-terminal stage", () => {
    for (const stage of ESSM_STAGES.slice(0, 4)) {
      expect(unmetGates(stage, EMPTY_FACTS).length, stage).toBeGreaterThan(0);
    }
  });

  const cases: [string, EssmStage, StageFacts, GateCode[]][] = [
    [
      "no market research",
      "PROSPECTING",
      with_({ marketResearch: null }),
      ["MARKET_RESEARCH_MISSING"],
    ],
    ["score below 1", "PROSPECTING", research({ valuesScore: 0 }), ["ALIGNMENT_SCORES_INVALID"]],
    ["score above 5", "PROSPECTING", research({ programScore: 6 }), ["ALIGNMENT_SCORES_INVALID"]],
    [
      "fractional score",
      "PROSPECTING",
      research({ visionScore: 3.5 }),
      ["ALIGNMENT_SCORES_INVALID"],
    ],
    [
      "NaN score",
      "PROSPECTING",
      research({ currentFocusScore: Number.NaN }),
      ["ALIGNMENT_SCORES_INVALID"],
    ],
    ["Proceed = no", "PROSPECTING", research({ proceedDecision: false }), ["PROCEED_NOT_APPROVED"]],
    ["no evidence", "PROSPECTING", research({ evidenceUrls: [] }), ["EVIDENCE_MISSING"]],
    [
      "non-http evidence",
      "PROSPECTING",
      research({ evidenceUrls: ["javascript:alert(1)"] }),
      ["EVIDENCE_MISSING"],
    ],
    [
      "no human verifier",
      "PROSPECTING",
      research({ verifiedByUserId: null }),
      ["HUMAN_VERIFIER_MISSING"],
    ],
    ["no sent proposal", "SALES_PROCESS", with_({ sentProposalCount: 0 }), ["PROPOSAL_NOT_SENT"]],
    ["no meeting", "SALES_PROCESS", with_({ meetingCount: 0 }), ["NO_MEETING_RECORDED"]],
    [
      "meeting without final MoM",
      "SALES_PROCESS",
      with_({ meetingsWithoutFinalMomCount: 1 }),
      ["MOM_NOT_FINAL"],
    ],
    ["SnD not confirmed", "CLOSE_DEAL", with_({ sndConfirmed: false }), ["SND_NOT_CONFIRMED"]],
    ["no LoA", "CLOSE_DEAL", with_({ loa: null }), ["LOA_MISSING"]],
    [
      "LoA only drafted",
      "CLOSE_DEAL",
      loa({ status: "DRAFT", approvedByUserId: null, partnerSignedAt: null, aiesecSignedAt: null }),
      ["LOA_NOT_APPROVED", "LOA_NOT_FULLY_SIGNED"],
    ],
    [
      "LoA approved but unsigned",
      "CLOSE_DEAL",
      loa({ status: "APPROVED", partnerSignedAt: null, aiesecSignedAt: null }),
      ["LOA_NOT_FULLY_SIGNED"],
    ],
    ["only partner signed", "CLOSE_DEAL", loa({ aiesecSignedAt: null }), ["LOA_NOT_FULLY_SIGNED"]],
    [
      "signed LoA without document link",
      "CLOSE_DEAL",
      loa({ documentUrl: null }),
      ["LOA_DOCUMENT_MISSING"],
    ],
    [
      "LoA approved by its submitter",
      "CLOSE_DEAL",
      loa({ approvedByUserId: "u-staff" }),
      ["LOA_SELF_APPROVED"],
    ],
    ["no project", "PARTNERSHIP_IMPLEMENTATION", with_({ project: null }), ["PROJECT_MISSING"]],
    [
      "project still running",
      "PARTNERSHIP_IMPLEMENTATION",
      project({ status: "RUNNING" }),
      ["PROJECT_NOT_FINISHED"],
    ],
    [
      "finished without report link",
      "PARTNERSHIP_IMPLEMENTATION",
      project({ reportUrl: null }),
      ["REPORT_URL_MISSING"],
    ],
    [
      "report link without submission time",
      "PARTNERSHIP_IMPLEMENTATION",
      project({ reportSubmittedAt: null }),
      ["REPORT_URL_MISSING"],
    ],
  ];

  it.each(cases)("%s blocks leaving %s", (_label, stage, facts, expected) => {
    expect(unmetGates(stage, facts)).toEqual(expected);
  });

  it("every gate code is produced by at least one case (no dead gate)", () => {
    const produced = new Set(cases.flatMap((c) => c[3]));
    for (const code of GATE_CODES) expect(produced.has(code), code).toBe(true);
  });
});

describe("which gates can be waived", () => {
  it("only the soft sales-process gates are waivable", () => {
    expect([...WAIVABLE_GATES].sort()).toEqual([
      "MOM_NOT_FINAL",
      "NO_MEETING_RECORDED",
      "PROPOSAL_NOT_SENT",
    ]);
  });

  it("human research decisions, SnD, the signed LoA and the report link are never waivable", () => {
    const hard: GateCode[] = [
      "MARKET_RESEARCH_MISSING",
      "ALIGNMENT_SCORES_INVALID",
      "PROCEED_NOT_APPROVED",
      "EVIDENCE_MISSING",
      "HUMAN_VERIFIER_MISSING",
      "SND_NOT_CONFIRMED",
      "LOA_MISSING",
      "LOA_NOT_APPROVED",
      "LOA_SELF_APPROVED",
      "LOA_NOT_FULLY_SIGNED",
      "LOA_DOCUMENT_MISSING",
      "PROJECT_MISSING",
      "PROJECT_NOT_FINISHED",
      "REPORT_URL_MISSING",
    ];
    for (const g of hard) expect(isWaivable(g), g).toBe(false);
    expect(hard.length + WAIVABLE_GATES.size).toBe(GATE_CODES.length);
  });
});

describe("separate status dimensions", () => {
  it("sales status: only before implementation", () => {
    expect(ESSM_STAGES.map(canChangeSalesStatus)).toEqual([true, true, true, false, false]);
  });
  it("approach method: only while prospecting or in the sales process", () => {
    expect(ESSM_STAGES.map(canChangeApproachMethod)).toEqual([true, true, false, false, false]);
  });
  it("partnership status: only from implementation onward", () => {
    expect(ESSM_STAGES.map(canChangePartnershipStatus)).toEqual([false, false, false, true, true]);
  });

  it("partnership Active/Break/Finish matrix: FINISH is terminal, BREAK can resume", () => {
    const expected: Record<string, string[]> = {
      ACTIVE: ["BREAK", "FINISH"],
      BREAK: ["ACTIVE", "FINISH"],
      FINISH: [],
    };
    for (const from of PARTNERSHIP_STATUSES) {
      for (const to of PARTNERSHIP_STATUSES) {
        expect(canMovePartnershipStatus(from, to), `${from}>${to}`).toBe(
          expected[from]?.includes(to),
        );
      }
    }
    expect(canMovePartnershipStatus(null, "ACTIVE")).toBe(true);
    expect(canMovePartnershipStatus(null, "BREAK")).toBe(false);
    expect(canMovePartnershipStatus(null, "FINISH")).toBe(false);
  });
});
