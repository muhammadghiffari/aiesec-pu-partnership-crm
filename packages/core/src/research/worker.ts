/**
 * Research worker (FR-300..308, FR-950, D-010). Bounded batch processing of queued research
 * jobs into DRAFT candidates.
 *
 * What this module cannot do, by construction:
 * - It has no session service, no audit-as-user, no outreach/messaging dependency and no
 *   credentials: its dependencies are the job repository, a research provider port, a clock
 *   and a feature flag. (tests/worker-boundary asserts this.)
 * - It never creates partners, cycles, market-research scores or approvals; it only inserts
 *   `prospect_candidates` rows with review_status PENDING.
 * - Provider output is untrusted data: validated per candidate, never executed or fetched.
 *
 * Failure handling: retryable errors requeue with exponential backoff until `maxAttempts`,
 * then the job is DEAD; non-retryable errors fail immediately. Only error CODES are stored,
 * never provider messages (they may echo prompts or personal data).
 */

import { type Clock, systemClock } from "../auth/types";
import { parseResearchOutput } from "./output";
import {
  type CandidateDraft,
  type JobErrorCode,
  NON_RETRYABLE,
  type ProspectCandidate,
  type ResearchJob,
  type ResearchProvider,
  ResearchProviderError,
  type ResearchRepository,
} from "./types";

export interface ResearchWorkerDeps {
  repository: ResearchRepository;
  provider: ResearchProvider;
  /** Evaluated on every pass; mirrors AI_ENABLED. When false nothing is claimed. */
  aiEnabled: () => boolean;
  workerId: string;
  clock?: Clock;
  newId?: () => string;
  /** Per-attempt provider deadline. Default 45 000 ms (matches LLM_TIMEOUT_MS). */
  timeoutMs?: number;
  /** How long a claim is held before another worker may recover it. Default 120 000 ms. */
  leaseMs?: number;
}

export type WorkerPassResult =
  | { kind: "disabled" }
  | { kind: "idle" }
  | { kind: "lease_lost"; jobId: string }
  | { kind: "succeeded"; jobId: string; stored: number; rejected: number; belowThreshold: number }
  | {
      kind: "failed";
      jobId: string;
      status: "QUEUED" | "FAILED" | "DEAD";
      errorCode: JobErrorCode;
    };

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

/** 30s, 60s, 120s ... capped at 15 minutes. `attempt` is the attempt that just failed (>= 1). */
export function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
}

async function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ResearchProviderError("PROVIDER_TIMEOUT"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createResearchWorker(deps: ResearchWorkerDeps) {
  const { repository: repo } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const timeoutMs = deps.timeoutMs ?? 45_000;
  const leaseMs = deps.leaseMs ?? 120_000;

  async function recordFailure(job: ResearchJob, code: JobErrorCode): Promise<WorkerPassResult> {
    const now = clock.now();
    let status: "QUEUED" | "FAILED" | "DEAD";
    let retryAt: Date | null = null;
    if (NON_RETRYABLE.has(code)) status = "FAILED";
    else if (job.attempt >= job.maxAttempts) status = "DEAD";
    else {
      status = "QUEUED";
      retryAt = new Date(now.getTime() + backoffMs(job.attempt));
    }
    const held = await repo.failAttempt(
      job.jobId,
      deps.workerId,
      { status, errorCode: code, retryAt },
      now,
    );
    return held
      ? { kind: "failed", jobId: job.jobId, status, errorCode: code }
      : { kind: "lease_lost", jobId: job.jobId };
  }

  /** Process at most one job. Safe to call concurrently from several workers. */
  async function runOnce(): Promise<WorkerPassResult> {
    if (!deps.aiEnabled()) return { kind: "disabled" };

    const job = await repo.claimNext(deps.workerId, clock.now(), leaseMs);
    if (!job) return { kind: "idle" };

    const criteria = await repo.getCriteria(job.criteriaId);
    if (!criteria?.active) return recordFailure(job, "CRITERIA_UNAVAILABLE");

    let raw: unknown;
    try {
      raw = await withDeadline((signal) => deps.provider.research(criteria, { signal }), timeoutMs);
    } catch (error) {
      return recordFailure(
        job,
        error instanceof ResearchProviderError ? error.code : "UNEXPECTED_ERROR",
      );
    }

    const parsed = parseResearchOutput(raw, criteria.minFitScore);
    if (!parsed) return recordFailure(job, "SCHEMA_INVALID");
    // Output was non-empty but nothing survived validation (for example no source URLs).
    if (parsed.accepted.length === 0 && parsed.rejectedCount > 0) {
      return recordFailure(job, "NO_VALID_CANDIDATES");
    }

    const now = clock.now();
    const candidates: ProspectCandidate[] = [];
    for (const draft of parsed.accepted as CandidateDraft[]) {
      candidates.push({
        ...draft,
        candidateId: newId(),
        jobId: job.jobId,
        // Flag, never merge: a human decides whether this is the same organization.
        possibleDuplicatePartnerId: await repo.findPartnerMatch(draft.name, draft.websiteDomain),
        reviewStatus: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        acceptedPartnerId: null,
        acceptedCycleId: null,
        createdAt: now,
      });
    }

    const held = await repo.completeJob(job.jobId, deps.workerId, candidates, now);
    if (!held) return { kind: "lease_lost", jobId: job.jobId };
    return {
      kind: "succeeded",
      jobId: job.jobId,
      stored: candidates.length,
      rejected: parsed.rejectedCount,
      belowThreshold: parsed.belowThresholdCount,
    };
  }

  return { runOnce };
}

export type ResearchWorker = ReturnType<typeof createResearchWorker>;
