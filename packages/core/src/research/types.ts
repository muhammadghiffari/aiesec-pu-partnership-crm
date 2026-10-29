/**
 * Research jobs, quotas and candidate drafts (FR-300..308, FR-950).
 *
 * Invariants:
 * - The worker produces DRAFT candidates only. It has no session, no outreach/messaging
 *   dependency and no way to create partners, cycles, research scores or approvals.
 * - A candidate becomes a Partner + first cycle only when a human accepts it.
 * - Every candidate carries at least one http(s) source URL; unsupported claims are stored
 *   separately and shown as unverified.
 */

export const JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_ERROR_CODES = [
  "PROVIDER_TIMEOUT",
  "PROVIDER_ERROR",
  "RATE_LIMITED",
  "SCHEMA_INVALID",
  "NO_VALID_CANDIDATES",
  "CRITERIA_UNAVAILABLE",
  "AI_DISABLED",
  "UNEXPECTED_ERROR",
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

/** Errors that will not succeed on retry. Everything else retries until max attempts. */
export const NON_RETRYABLE: ReadonlySet<JobErrorCode> = new Set<JobErrorCode>([
  "CRITERIA_UNAVAILABLE",
  "AI_DISABLED",
]);

export interface CriteriaSnapshot {
  criteriaId: string;
  industryCategoryId: string | null;
  projectSupport: string;
  criteriaText: string;
  minFitScore: number;
  version: number;
  active: boolean;
}

export interface ResearchJob {
  jobId: string;
  criteriaId: string;
  requestedBy: string;
  idempotencyKey: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  runAfter: Date;
  lockedBy: string | null;
  lockedUntil: Date | null;
  lastErrorCode: JobErrorCode | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface CandidateDraft {
  name: string;
  websiteDomain: string | null;
  fitScore: number;
  fitRationale: string;
  insightSummary: string;
  sourceUrls: string[];
  unverifiedClaims: string[];
}

export interface ProspectCandidate extends CandidateDraft {
  candidateId: string;
  jobId: string;
  possibleDuplicatePartnerId: string | null;
  reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  acceptedPartnerId: string | null;
  acceptedCycleId: string | null;
  createdAt: Date;
}

/** Storage port. Implementations must make each method atomic as documented. */
export interface ResearchRepository {
  getCriteria(criteriaId: string): Promise<CriteriaSnapshot | null>;
  maxCriteriaVersion(industryCategoryId: string | null, projectSupport: string): Promise<number>;
  insertCriteria(criteria: CriteriaSnapshot): Promise<void>;
  deactivateOtherVersions(keep: CriteriaSnapshot): Promise<void>;

  findJobByKey(requestedBy: string, idempotencyKey: string): Promise<ResearchJob | null>;
  getJob(jobId: string): Promise<ResearchJob | null>;
  /** Jobs created by the user in [from, to), excluding CANCELLED. */
  countJobsCreated(userId: string, from: Date, to: Date): Promise<number>;
  insertJob(job: ResearchJob): Promise<void>;
  cancelQueuedJob(jobId: string, at: Date): Promise<boolean>;

  getQuota(userId: string): Promise<number | null>;
  userExists(userId: string): Promise<boolean>;
  upsertQuota(userId: string, dailyLimit: number, updatedBy: string, at: Date): Promise<void>;

  /**
   * Atomically claim ONE runnable job: QUEUED with run_after <= now, or RUNNING whose lease
   * expired (crashed worker). Increments `attempt`, sets the lease. Concurrent callers must
   * never receive the same job (SELECT ... FOR UPDATE SKIP LOCKED in SQL).
   */
  claimNext(workerId: string, now: Date, leaseMs: number): Promise<ResearchJob | null>;
  /**
   * Atomically store candidates (ignoring duplicates by job + normalized name, so a retry
   * after a partial crash cannot double insert) and mark the job SUCCEEDED. Returns false when
   * the lease is no longer held by `workerId` (zombie worker) and then writes NOTHING.
   */
  completeJob(
    jobId: string,
    workerId: string,
    candidates: ProspectCandidate[],
    at: Date,
  ): Promise<boolean>;
  /** Record a failed attempt: requeue at `retryAt`, or mark FAILED/DEAD. False if lease lost. */
  failAttempt(
    jobId: string,
    workerId: string,
    outcome: {
      status: "QUEUED" | "FAILED" | "DEAD";
      errorCode: JobErrorCode;
      retryAt: Date | null;
    },
    at: Date,
  ): Promise<boolean>;

  findPartnerMatch(name: string, websiteDomain: string | null): Promise<string | null>;
  listPendingCandidates(limit: number): Promise<ProspectCandidate[]>;
  getCandidate(candidateId: string): Promise<ProspectCandidate | null>;
  /** Only succeeds while the candidate is still PENDING. */
  markCandidate(
    candidateId: string,
    update: Pick<
      ProspectCandidate,
      | "reviewStatus"
      | "reviewedBy"
      | "reviewedAt"
      | "reviewReason"
      | "acceptedPartnerId"
      | "acceptedCycleId"
    >,
  ): Promise<boolean>;
}

/** Creates the Partner + first cycle + ProspectingRecord when a human accepts a candidate. */
export interface PartnerIntake {
  createFromCandidate(input: {
    candidate: ProspectCandidate;
    criteria: CriteriaSnapshot;
    industryCategoryId: string;
    /** When set, attach to this existing partner instead of creating a new one. */
    existingPartnerId: string | null;
    acceptedBy: string;
  }): Promise<{ partnerId: string; cycleId: string }>;
}

/** Raw, untrusted output from the model adapter (M2-03). Validated before use. */
export interface ResearchProvider {
  research(criteria: CriteriaSnapshot, options: { signal: AbortSignal }): Promise<unknown>;
}

/**
 * Thrown by `insertJob` when (requested_by, idempotency_key) already exists, for example a
 * PostgreSQL unique_violation (23505) from a concurrent request. The service then returns the
 * winning job instead of failing.
 */
export class DuplicateJobError extends Error {
  constructor() {
    super("research job idempotency key already used");
    this.name = "DuplicateJobError";
  }
}

export class ResearchProviderError extends Error {
  constructor(readonly code: JobErrorCode) {
    super(`research provider failed: ${code}`);
    this.name = "ResearchProviderError";
  }
}
