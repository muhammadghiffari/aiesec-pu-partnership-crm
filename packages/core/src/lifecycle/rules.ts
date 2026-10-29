/**
 * Pure ESSM lifecycle rules (FR-200, PRD §2, ARCHITECTURE invariants 1-5). No I/O.
 *
 * Five canonical top-level stages only. Sales status, approach method, partnership status and
 * the re-raise decision are separate dimensions; none of them is a stage and none changes the
 * stage. Transitions are strictly forward, one step at a time. History is never rewritten: a
 * re-raise creates a NEW cycle (M5-03), it does not move an old cycle backwards.
 */

export const ESSM_STAGES = [
  "PROSPECTING",
  "SALES_PROCESS",
  "CLOSE_DEAL",
  "PARTNERSHIP_IMPLEMENTATION",
  "POST_SURVEY",
] as const;
export type EssmStage = (typeof ESSM_STAGES)[number];

export const SALES_TYPES = ["NEW", "RE_RAISE"] as const;
export const SALES_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const APPROACH_METHODS = ["ACTIVE", "PASSIVE"] as const;
export const PARTNERSHIP_STATUSES = ["ACTIVE", "BREAK", "FINISH"] as const;
export const RE_RAISE_DECISIONS = ["YES", "NO", "PLANNING_TO"] as const;

export type SalesType = (typeof SALES_TYPES)[number];
export type SalesStatus = (typeof SALES_STATUSES)[number];
export type ApproachMethod = (typeof APPROACH_METHODS)[number];
export type PartnershipStatus = (typeof PARTNERSHIP_STATUSES)[number];
export type ReRaiseDecision = (typeof RE_RAISE_DECISIONS)[number];

export function isEssmStage(value: unknown): value is EssmStage {
  return typeof value === "string" && (ESSM_STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: EssmStage): number {
  return ESSM_STAGES.indexOf(stage);
}

/** The only stage a cycle may advance to from `stage`, or null for the last stage. */
export function nextStage(stage: EssmStage): EssmStage | null {
  return ESSM_STAGES[stageIndex(stage) + 1] ?? null;
}

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: "SAME_STAGE" | "BACKWARD" | "SKIPS_STAGE" | "UNKNOWN_STAGE" };

/** Structural transition matrix (before prerequisites). Exactly 4 of the 25 pairs are allowed. */
export function checkTransition(from: string, to: string): TransitionCheck {
  if (!isEssmStage(from) || !isEssmStage(to)) return { allowed: false, reason: "UNKNOWN_STAGE" };
  if (from === to) return { allowed: false, reason: "SAME_STAGE" };
  if (stageIndex(to) < stageIndex(from)) return { allowed: false, reason: "BACKWARD" };
  if (stageIndex(to) > stageIndex(from) + 1) return { allowed: false, reason: "SKIPS_STAGE" };
  return { allowed: true };
}

// ---------------------------------------------------------------------------------------------
// Prerequisite facts and gates
// ---------------------------------------------------------------------------------------------

/** Latest human-entered Market Research for the cycle (never AI-derived). */
export interface MarketResearchFacts {
  valuesScore: number;
  visionScore: number;
  currentFocusScore: number;
  programScore: number;
  proceedDecision: boolean;
  evidenceUrls: readonly string[];
  verifiedByUserId: string | null;
}

export interface LoaFacts {
  status: string;
  submittedByUserId: string;
  approvedByUserId: string | null;
  partnerSignedAt: Date | null;
  aiesecSignedAt: Date | null;
  documentUrl: string | null;
}

export interface ProjectFacts {
  status: string;
  reportUrl: string | null;
  reportSubmittedAt: Date | null;
}

/** Facts loaded by the repository layer for one cycle. Core never queries storage. */
export interface StageFacts {
  marketResearch: MarketResearchFacts | null;
  sentProposalCount: number;
  meetingCount: number;
  meetingsWithoutFinalMomCount: number;
  /** Structured Supply & Demand confirmed by a human with method, date and evidence (M3-04). */
  sndConfirmed: boolean;
  loa: LoaFacts | null;
  project: ProjectFacts | null;
}

export const EMPTY_FACTS: StageFacts = {
  marketResearch: null,
  sentProposalCount: 0,
  meetingCount: 0,
  meetingsWithoutFinalMomCount: 0,
  sndConfirmed: false,
  loa: null,
  project: null,
};

export const GATE_CODES = [
  "MARKET_RESEARCH_MISSING",
  "ALIGNMENT_SCORES_INVALID",
  "PROCEED_NOT_APPROVED",
  "EVIDENCE_MISSING",
  "HUMAN_VERIFIER_MISSING",
  "PROPOSAL_NOT_SENT",
  "NO_MEETING_RECORDED",
  "MOM_NOT_FINAL",
  "SND_NOT_CONFIRMED",
  "LOA_MISSING",
  "LOA_NOT_APPROVED",
  "LOA_SELF_APPROVED",
  "LOA_NOT_FULLY_SIGNED",
  "LOA_DOCUMENT_MISSING",
  "PROJECT_MISSING",
  "PROJECT_NOT_FINISHED",
  "REPORT_URL_MISSING",
] as const;
export type GateCode = (typeof GATE_CODES)[number];

/**
 * Gates a CRM Lead may waive with a recorded reason (SECURITY_PRIVACY #12). Everything else is
 * absolute: human-owned research decisions, SnD, the approved and signed LoA with separation of
 * duties (PRD §7, DB-enforced) and the mandatory ESSM report link. See DECISIONS Q-17.
 */
export const WAIVABLE_GATES: ReadonlySet<GateCode> = new Set<GateCode>([
  "PROPOSAL_NOT_SENT",
  "NO_MEETING_RECORDED",
  "MOM_NOT_FINAL",
]);

export function isWaivable(code: GateCode): boolean {
  return WAIVABLE_GATES.has(code);
}

const isScore = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
const isHttpUrl = (u: string) => /^https?:\/\/[^\s]+$/.test(u);

function prospectingGates(f: StageFacts): GateCode[] {
  const r = f.marketResearch;
  if (!r) return ["MARKET_RESEARCH_MISSING"];
  const unmet: GateCode[] = [];
  if (![r.valuesScore, r.visionScore, r.currentFocusScore, r.programScore].every(isScore)) {
    unmet.push("ALIGNMENT_SCORES_INVALID");
  }
  if (r.proceedDecision !== true) unmet.push("PROCEED_NOT_APPROVED");
  if (r.evidenceUrls.length === 0 || !r.evidenceUrls.every(isHttpUrl))
    unmet.push("EVIDENCE_MISSING");
  if (!r.verifiedByUserId) unmet.push("HUMAN_VERIFIER_MISSING");
  return unmet;
}

function salesGates(f: StageFacts): GateCode[] {
  const unmet: GateCode[] = [];
  if (f.sentProposalCount < 1) unmet.push("PROPOSAL_NOT_SENT");
  if (f.meetingCount < 1) unmet.push("NO_MEETING_RECORDED");
  else if (f.meetingsWithoutFinalMomCount > 0) unmet.push("MOM_NOT_FINAL");
  return unmet;
}

function closeDealGates(f: StageFacts): GateCode[] {
  const unmet: GateCode[] = [];
  if (!f.sndConfirmed) unmet.push("SND_NOT_CONFIRMED");
  const loa = f.loa;
  if (!loa) {
    unmet.push("LOA_MISSING");
    return unmet;
  }
  // Re-check separation of duties here as well as in the DB and LoA service.
  if (loa.approvedByUserId !== null && loa.approvedByUserId === loa.submittedByUserId) {
    unmet.push("LOA_SELF_APPROVED");
  }
  if (loa.approvedByUserId === null || (loa.status !== "APPROVED" && loa.status !== "SIGNED")) {
    unmet.push("LOA_NOT_APPROVED");
  }
  if (loa.status !== "SIGNED" || !loa.partnerSignedAt || !loa.aiesecSignedAt) {
    unmet.push("LOA_NOT_FULLY_SIGNED");
  }
  if (!loa.documentUrl || !isHttpUrl(loa.documentUrl)) unmet.push("LOA_DOCUMENT_MISSING");
  return unmet;
}

function implementationGates(f: StageFacts): GateCode[] {
  const p = f.project;
  if (!p) return ["PROJECT_MISSING"];
  const unmet: GateCode[] = [];
  if (p.status !== "FINISHED") unmet.push("PROJECT_NOT_FINISHED");
  if (!p.reportUrl || !isHttpUrl(p.reportUrl) || !p.reportSubmittedAt)
    unmet.push("REPORT_URL_MISSING");
  return unmet;
}

/** Prerequisites to LEAVE `from` toward its single legal successor. */
export function unmetGates(from: EssmStage, facts: StageFacts): GateCode[] {
  switch (from) {
    case "PROSPECTING":
      return prospectingGates(facts);
    case "SALES_PROCESS":
      return salesGates(facts);
    case "CLOSE_DEAL":
      return closeDealGates(facts);
    case "PARTNERSHIP_IMPLEMENTATION":
      return implementationGates(facts);
    case "POST_SURVEY":
      return []; // terminal stage: no onward transition exists
  }
}

// ---------------------------------------------------------------------------------------------
// Separate status dimensions
// ---------------------------------------------------------------------------------------------

/** Stages in which a pre-experience dimension may still change (stages 1-3). */
const PRE_EXPERIENCE: readonly EssmStage[] = ["PROSPECTING", "SALES_PROCESS", "CLOSE_DEAL"];

export function canChangeSalesStatus(stage: EssmStage): boolean {
  return PRE_EXPERIENCE.includes(stage);
}

/** Approach method records who initiated; it is fixed once the deal is being closed. */
export function canChangeApproachMethod(stage: EssmStage): boolean {
  return stage === "PROSPECTING" || stage === "SALES_PROCESS";
}

/** Established-partnership status exists only from implementation onward. */
export function canChangePartnershipStatus(stage: EssmStage): boolean {
  return stageIndex(stage) >= stageIndex("PARTNERSHIP_IMPLEMENTATION");
}

const PARTNERSHIP_TRANSITIONS: Record<PartnershipStatus, readonly PartnershipStatus[]> = {
  ACTIVE: ["BREAK", "FINISH"],
  BREAK: ["ACTIVE", "FINISH"],
  FINISH: [], // terminal: a renewal is a NEW cycle, never a reopened one
};

export function canMovePartnershipStatus(
  from: PartnershipStatus | null,
  to: PartnershipStatus,
): boolean {
  if (from === null) return to === "ACTIVE";
  return PARTNERSHIP_TRANSITIONS[from].includes(to);
}
