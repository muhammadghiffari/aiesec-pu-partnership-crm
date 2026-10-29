import type { DenialCode } from "../auth/types";
import type {
  ApproachMethod,
  EssmStage,
  GateCode,
  PartnershipStatus,
  ReRaiseDecision,
  SalesStatus,
  SalesType,
  StageFacts,
} from "./rules";

export interface CycleRecord {
  cycleId: string;
  partnerId: string;
  cycleNumber: number;
  previousCycleId: string | null;
  salesType: SalesType;
  salesStatus: SalesStatus;
  approachMethod: ApproachMethod;
  essmStage: EssmStage;
  partnershipStatus: PartnershipStatus | null;
  /** Owned by M5-03; the lifecycle service never writes it. */
  reRaiseDecision: ReRaiseDecision | null;
  projectSupport: string;
  openedAt: Date;
  closedAt: Date | null;
}

export type CyclePatch = Partial<
  Pick<CycleRecord, "essmStage" | "salesStatus" | "approachMethod" | "partnershipStatus">
>;

/**
 * Storage port. Implementations (packages/db, M1 follow-up) MUST participate in the same
 * transaction as the `AuditedTransaction` they are used with, so a domain write and its audit
 * event commit or roll back together.
 */
export interface LifecycleRepository {
  partnerExists(partnerId: string): Promise<boolean>;
  listCyclesForPartner(partnerId: string): Promise<CycleRecord[]>;
  getCycle(cycleId: string): Promise<CycleRecord | null>;
  getFacts(cycleId: string): Promise<StageFacts>;
  insertCycle(cycle: CycleRecord): Promise<void>;
  /**
   * Optimistic update: applies `patch` only if the stored cycle still has `expectedStage`.
   * Returns false when no row matched (concurrent change).
   */
  updateCycle(cycleId: string, expectedStage: EssmStage, patch: CyclePatch): Promise<boolean>;
}

export const LIFECYCLE_ERROR_CODES = [
  "VALIDATION_FAILED",
  "PARTNER_NOT_FOUND",
  "CYCLE_NOT_FOUND",
  "HAS_EXISTING_CYCLE",
  "CYCLE_CLOSED",
  "STALE_STAGE",
  "TERMINAL_STAGE",
  "GATES_UNMET",
  "WAIVER_NOT_ALLOWED",
  "WAIVER_NOT_NEEDED",
  "WAIVER_STALE",
  "STATUS_NOT_ALLOWED_IN_STAGE",
  "INVALID_PARTNERSHIP_TRANSITION",
  "REASON_REQUIRED",
  "NO_CHANGE",
] as const;
export type LifecycleErrorCode = (typeof LIFECYCLE_ERROR_CODES)[number];

export class LifecycleError extends Error {
  constructor(
    readonly code: LifecycleErrorCode,
    readonly gates?: readonly GateCode[],
  ) {
    super(`lifecycle: ${code}`);
    this.name = "LifecycleError";
  }
}

export type LifecycleFailure = {
  ok: false;
  code: LifecycleErrorCode | DenialCode;
  httpStatus: 400 | 401 | 403 | 404 | 409 | 422;
  /** Unmet prerequisites, when `code` is GATES_UNMET. */
  gates?: readonly GateCode[];
  /** Subset of `gates` that a CRM Lead may waive with a reason. */
  waivableGates?: readonly GateCode[];
};

export type LifecycleResult<T> = { ok: true; value: T } | LifecycleFailure;

const STATUS: Record<LifecycleErrorCode, LifecycleFailure["httpStatus"]> = {
  VALIDATION_FAILED: 400,
  PARTNER_NOT_FOUND: 404,
  CYCLE_NOT_FOUND: 404,
  HAS_EXISTING_CYCLE: 409,
  CYCLE_CLOSED: 409,
  STALE_STAGE: 409,
  TERMINAL_STAGE: 409,
  GATES_UNMET: 422,
  WAIVER_NOT_ALLOWED: 422,
  WAIVER_NOT_NEEDED: 400,
  WAIVER_STALE: 409,
  STATUS_NOT_ALLOWED_IN_STAGE: 409,
  INVALID_PARTNERSHIP_TRANSITION: 409,
  REASON_REQUIRED: 400,
  NO_CHANGE: 409,
};

export function httpStatusFor(code: LifecycleErrorCode): LifecycleFailure["httpStatus"] {
  return STATUS[code];
}
