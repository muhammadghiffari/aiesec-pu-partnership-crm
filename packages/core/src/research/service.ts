/**
 * Research workflow service (FR-300..308). Human-facing operations only: criteria versions,
 * queueing jobs, quotas, cancelling, and reviewing candidate drafts. The worker lives in
 * worker.ts and shares no session or send capability with this module.
 *
 * Every operation is Zod-validated, authorized server-side through the M0-05 guard, and every
 * mutation is audited atomically through the M0-06 service.
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { authorize } from "../auth/policy";
import { type Clock, type Principal, systemClock } from "../auth/types";
import { jakartaDayRange } from "./time";
import {
  type CriteriaSnapshot,
  DuplicateJobError,
  type PartnerIntake,
  type ProspectCandidate,
  type ResearchJob,
  type ResearchRepository,
} from "./types";

export const RESEARCH_ERROR_CODES = [
  "VALIDATION_FAILED",
  "CRITERIA_NOT_FOUND",
  "CRITERIA_INACTIVE",
  "QUOTA_EXCEEDED",
  "IDEMPOTENCY_CONFLICT",
  "JOB_NOT_FOUND",
  "JOB_NOT_CANCELLABLE",
  "USER_NOT_FOUND",
  "CANDIDATE_NOT_FOUND",
  "CANDIDATE_ALREADY_REVIEWED",
  "DUPLICATE_DECISION_REQUIRED",
  "DUPLICATE_RACE",
  "FORBIDDEN",
] as const;
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];

const HTTP: Record<ResearchErrorCode, number> = {
  VALIDATION_FAILED: 400,
  CRITERIA_NOT_FOUND: 404,
  CRITERIA_INACTIVE: 409,
  QUOTA_EXCEEDED: 429,
  IDEMPOTENCY_CONFLICT: 409,
  JOB_NOT_FOUND: 404,
  JOB_NOT_CANCELLABLE: 409,
  USER_NOT_FOUND: 404,
  CANDIDATE_NOT_FOUND: 404,
  CANDIDATE_ALREADY_REVIEWED: 409,
  DUPLICATE_DECISION_REQUIRED: 422,
  DUPLICATE_RACE: 409,
  FORBIDDEN: 403,
};

export class ResearchError extends Error {
  constructor(readonly code: ResearchErrorCode) {
    super(`research: ${code}`);
    this.name = "ResearchError";
  }
}

export type ResearchFailure = {
  ok: false;
  code: ResearchErrorCode | string;
  httpStatus: number;
};
export type ResearchResult<T> = { ok: true; value: T } | ResearchFailure;

const uuid = z.uuid();
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_.:-]{8,100}$/);

export const createCriteriaSchema = z.strictObject({
  industryCategoryId: uuid.nullable(),
  projectSupport: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  criteriaText: z.string().trim().min(10).max(4000),
  minFitScore: z.number().finite().min(0).max(100),
});
export const enqueueSchema = z.strictObject({ criteriaId: uuid, idempotencyKey });
/** Opaque identifier: existence is enforced by the repository / foreign key, not by shape. */
const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const setQuotaSchema = z.strictObject({
  userId: opaqueId,
  dailyLimit: z.number().int().min(0).max(1000),
});
export const acceptSchema = z.strictObject({
  candidateId: uuid,
  industryCategoryId: uuid,
  /** Required when the candidate was flagged as a possible duplicate of an existing partner. */
  duplicateDecision: z.enum(["CREATE_NEW", "USE_EXISTING"]).optional(),
});
export const rejectSchema = z.strictObject({
  candidateId: uuid,
  reason: z.string().trim().min(3).max(300),
});

export interface ResearchServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  repository: ResearchRepository;
  intake: PartnerIntake;
  clock?: Clock;
  newId?: () => string;
  /** Default per-staff jobs per Asia/Jakarta day when no override exists. */
  defaultDailyQuota?: number;
}

export function createResearchService(deps: ResearchServiceDeps) {
  const { repository: repo, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const defaultQuota = deps.defaultDailyQuota ?? 10;
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (e) => audit.recordDenial(e),
  };

  const fail = (code: ResearchErrorCode): ResearchFailure => ({
    ok: false,
    code,
    httpStatus: HTTP[code],
  });
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): ResearchResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as ResearchFailure));

  async function settle<T>(run: () => Promise<ResearchResult<T>>): Promise<ResearchResult<T>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ResearchError) return fail(error.code);
      throw error;
    }
  }

  function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | ResearchFailure {
    const r = schema.safeParse(input);
    return r.success ? { ok: true, data: r.data } : fail("VALIDATION_FAILED");
  }

  // -------------------------------------------------------------------------------------------
  // Criteria (CRM Lead): each edit is a NEW immutable version; earlier versions stay readable.
  // -------------------------------------------------------------------------------------------

  async function createCriteriaVersion(token: string | undefined | null, input: unknown) {
    const v = parse(createCriteriaSchema, input);
    if (!v.ok) return v;
    return settle<CriteriaSnapshot>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "config.manage", kind: "MUTATION", entityType: "target_criteria" },
          async () => {
            const version =
              (await repo.maxCriteriaVersion(v.data.industryCategoryId, v.data.projectSupport)) + 1;
            const criteria: CriteriaSnapshot = {
              criteriaId: newId(),
              industryCategoryId: v.data.industryCategoryId,
              projectSupport: v.data.projectSupport,
              criteriaText: v.data.criteriaText,
              minFitScore: v.data.minFitScore,
              version,
              active: true,
            };
            await repo.insertCriteria(criteria);
            await repo.deactivateOtherVersions(criteria);
            return {
              value: criteria,
              entityId: criteria.criteriaId,
              metadata: {
                version,
                projectSupport: criteria.projectSupport,
                minFitScore: criteria.minFitScore,
              },
            };
          },
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Jobs and quotas
  // -------------------------------------------------------------------------------------------

  async function quotaFor(userId: string): Promise<number> {
    return (await repo.getQuota(userId)) ?? defaultQuota;
  }

  async function enqueueJob(token: string | undefined | null, input: unknown) {
    const v = parse(enqueueSchema, input);
    if (!v.ok) return v;
    const { criteriaId, idempotencyKey: key } = v.data;

    return settle<{ job: ResearchJob; duplicate: boolean }>(async () => {
      // Authorized read first: an idempotent replay returns the original job and must neither
      // consume quota nor write another audit event.
      const existing = await runAuthorized(guardDeps, token, "research.work", {}, async (p) => {
        const found = await repo.findJobByKey(p.userId, key);
        if (found && found.criteriaId !== criteriaId)
          throw new ResearchError("IDEMPOTENCY_CONFLICT");
        return found;
      });
      if (!existing.ok) return existing as ResearchFailure;
      if (existing.value) return { ok: true, value: { job: existing.value, duplicate: true } };

      try {
        return unwrap(
          await audit.audited(
            token,
            { action: "research.work", kind: "MUTATION", entityType: "research_job" },
            async (principal: Principal) => {
              const raced = await repo.findJobByKey(principal.userId, key);
              if (raced) throw new ResearchError("DUPLICATE_RACE");

              const criteria = await repo.getCriteria(criteriaId);
              if (!criteria) throw new ResearchError("CRITERIA_NOT_FOUND");
              if (!criteria.active) throw new ResearchError("CRITERIA_INACTIVE");

              const now = clock.now();
              const { from, to } = jakartaDayRange(now);
              const used = await repo.countJobsCreated(principal.userId, from, to);
              if (used >= (await quotaFor(principal.userId)))
                throw new ResearchError("QUOTA_EXCEEDED");

              const job: ResearchJob = {
                jobId: newId(),
                criteriaId,
                requestedBy: principal.userId,
                idempotencyKey: key,
                status: "QUEUED",
                attempt: 0,
                maxAttempts: 3,
                runAfter: now,
                lockedBy: null,
                lockedUntil: null,
                lastErrorCode: null,
                createdAt: now,
                finishedAt: null,
              };
              try {
                await repo.insertJob(job);
              } catch (error) {
                if (error instanceof DuplicateJobError) throw new ResearchError("DUPLICATE_RACE");
                throw error;
              }
              return {
                value: { job, duplicate: false },
                entityId: job.jobId,
                metadata: { criteriaVersion: criteria.version, usedToday: used + 1 },
              };
            },
          ),
        );
      } catch (error) {
        if (error instanceof ResearchError && error.code === "DUPLICATE_RACE") {
          const winner = await runAuthorized(guardDeps, token, "research.work", {}, (p) =>
            repo.findJobByKey(p.userId, key),
          );
          if (winner.ok && winner.value)
            return { ok: true, value: { job: winner.value, duplicate: true } };
        }
        throw error;
      }
    });
  }

  async function setQuota(token: string | undefined | null, input: unknown) {
    const v = parse(setQuotaSchema, input);
    if (!v.ok) return v;
    return settle<{ userId: string; dailyLimit: number }>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "quota.manage", kind: "MUTATION", entityType: "research_quota" },
          async (principal: Principal) => {
            if (!(await repo.userExists(v.data.userId))) throw new ResearchError("USER_NOT_FOUND");
            const previous = await quotaFor(v.data.userId);
            await repo.upsertQuota(v.data.userId, v.data.dailyLimit, principal.userId, clock.now());
            return {
              value: { userId: v.data.userId, dailyLimit: v.data.dailyLimit },
              entityId: v.data.userId,
              metadata: { previousLimit: previous, newLimit: v.data.dailyLimit },
            };
          },
        ),
      ),
    );
  }

  async function getQuotaStatus(token: string | undefined | null) {
    return settle<{ limit: number; used: number; remaining: number }>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "research.work", {}, async (p) => {
          const { from, to } = jakartaDayRange(clock.now());
          const used = await repo.countJobsCreated(p.userId, from, to);
          const limit = await quotaFor(p.userId);
          return { limit, used, remaining: Math.max(0, limit - used) };
        }),
      ),
    );
  }

  async function cancelJob(token: string | undefined | null, jobId: unknown) {
    const v = parse(uuid, jobId);
    if (!v.ok) return v;
    return settle<ResearchJob>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "research.work", kind: "MUTATION", entityType: "research_job" },
          async (principal: Principal) => {
            const job = await repo.getJob(v.data);
            // Owners and AI-control leads only; everyone else sees "not found" (no oracle).
            const allowed =
              job &&
              (job.requestedBy === principal.userId || authorize(principal, "ai.control").ok);
            if (!job || !allowed) throw new ResearchError("JOB_NOT_FOUND");
            if (job.status !== "QUEUED") throw new ResearchError("JOB_NOT_CANCELLABLE");
            if (!(await repo.cancelQueuedJob(job.jobId, clock.now()))) {
              throw new ResearchError("JOB_NOT_CANCELLABLE");
            }
            return {
              value: (await repo.getJob(job.jobId)) as ResearchJob,
              entityId: job.jobId,
              metadata: { previousStatus: job.status },
            };
          },
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Human review of candidate drafts
  // -------------------------------------------------------------------------------------------

  async function listPendingCandidates(token: string | undefined | null) {
    return settle<ProspectCandidate[]>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "research.work", {}, () =>
          repo.listPendingCandidates(100),
        ),
      ),
    );
  }

  async function acceptCandidate(token: string | undefined | null, input: unknown) {
    const v = parse(acceptSchema, input);
    if (!v.ok) return v;
    return settle<{ partnerId: string; cycleId: string }>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "research.work", kind: "MUTATION", entityType: "prospect_candidate" },
          async (principal: Principal) => {
            // Creating a partner and a cycle needs those capabilities too.
            for (const action of ["partner.write", "cycle.write"] as const) {
              if (!authorize(principal, action).ok) throw new ResearchError("FORBIDDEN");
            }
            const candidate = await repo.getCandidate(v.data.candidateId);
            if (!candidate) throw new ResearchError("CANDIDATE_NOT_FOUND");
            if (candidate.reviewStatus !== "PENDING")
              throw new ResearchError("CANDIDATE_ALREADY_REVIEWED");
            const criteriaJob = await repo.getJob(candidate.jobId);
            const criteria = criteriaJob ? await repo.getCriteria(criteriaJob.criteriaId) : null;
            if (!criteria) throw new ResearchError("CRITERIA_NOT_FOUND");

            // A flagged duplicate is never merged silently: the human chooses explicitly.
            if (candidate.possibleDuplicatePartnerId && !v.data.duplicateDecision) {
              throw new ResearchError("DUPLICATE_DECISION_REQUIRED");
            }
            const existingPartnerId =
              v.data.duplicateDecision === "USE_EXISTING"
                ? candidate.possibleDuplicatePartnerId
                : null;
            if (v.data.duplicateDecision === "USE_EXISTING" && !existingPartnerId) {
              throw new ResearchError("VALIDATION_FAILED");
            }

            const created = await deps.intake.createFromCandidate({
              candidate,
              criteria,
              industryCategoryId: v.data.industryCategoryId,
              existingPartnerId,
              acceptedBy: principal.userId,
            });
            const marked = await repo.markCandidate(candidate.candidateId, {
              reviewStatus: "ACCEPTED",
              reviewedBy: principal.userId,
              reviewedAt: clock.now(),
              reviewReason: null,
              acceptedPartnerId: created.partnerId,
              acceptedCycleId: created.cycleId,
            });
            if (!marked) throw new ResearchError("CANDIDATE_ALREADY_REVIEWED");
            return {
              value: created,
              entityId: candidate.candidateId,
              metadata: {
                partnerId: created.partnerId,
                cycleId: created.cycleId,
                duplicateDecision: v.data.duplicateDecision ?? "NONE",
              },
            };
          },
        ),
      ),
    );
  }

  async function rejectCandidate(token: string | undefined | null, input: unknown) {
    const v = parse(rejectSchema, input);
    if (!v.ok) return v;
    return settle<{ candidateId: string }>(async () =>
      unwrap(
        await audit.audited(
          token,
          { action: "research.work", kind: "MUTATION", entityType: "prospect_candidate" },
          async (principal: Principal) => {
            const candidate = await repo.getCandidate(v.data.candidateId);
            if (!candidate) throw new ResearchError("CANDIDATE_NOT_FOUND");
            if (candidate.reviewStatus !== "PENDING")
              throw new ResearchError("CANDIDATE_ALREADY_REVIEWED");
            const marked = await repo.markCandidate(candidate.candidateId, {
              reviewStatus: "REJECTED",
              reviewedBy: principal.userId,
              reviewedAt: clock.now(),
              reviewReason: v.data.reason,
              acceptedPartnerId: null,
              acceptedCycleId: null,
            });
            if (!marked) throw new ResearchError("CANDIDATE_ALREADY_REVIEWED");
            return {
              value: { candidateId: candidate.candidateId },
              entityId: candidate.candidateId,
              metadata: { reason: v.data.reason },
            };
          },
        ),
      ),
    );
  }

  return {
    createCriteriaVersion,
    enqueueJob,
    setQuota,
    getQuotaStatus,
    cancelJob,
    listPendingCandidates,
    acceptCandidate,
    rejectCandidate,
  };
}

export type ResearchService = ReturnType<typeof createResearchService>;
