/**
 * Test-only harness for research tests: in-memory repository implementing the documented
 * port semantics (atomic claim with lease, zombie-safe completion), a fake intake, a scripted
 * provider and the audit harness. Synthetic data only. Not exported from the package index.
 */

import { buildAuditHarness } from "../audit/test-support";
import { createResearchService } from "./service";
import {
  type CriteriaSnapshot,
  DuplicateJobError,
  type JobErrorCode,
  type PartnerIntake,
  type ProspectCandidate,
  type ResearchJob,
  type ResearchProvider,
  type ResearchRepository,
} from "./types";
import { createResearchWorker } from "./worker";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export class InMemoryResearchRepo implements ResearchRepository {
  criteria = new Map<string, CriteriaSnapshot>();
  jobs = new Map<string, ResearchJob>();
  quotas = new Map<string, number>();
  candidates = new Map<string, ProspectCandidate>();
  users = new Set<string>();
  /** normalized partner name or domain -> partner id */
  partnersByKey = new Map<string, string>();

  snapshot() {
    return {
      criteria: new Map([...this.criteria].map(([k, v]) => [k, { ...v }])),
      jobs: new Map([...this.jobs].map(([k, v]) => [k, { ...v }])),
      quotas: new Map(this.quotas),
      candidates: new Map([...this.candidates].map(([k, v]) => [k, { ...v }])),
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<InMemoryResearchRepo["snapshot"]>;
    this.criteria = new Map([...snap.criteria].map(([k, v]) => [k, { ...v }]));
    this.jobs = new Map([...snap.jobs].map(([k, v]) => [k, { ...v }]));
    this.quotas = new Map(snap.quotas);
    this.candidates = new Map([...snap.candidates].map(([k, v]) => [k, { ...v }]));
  }

  async getCriteria(id: string) {
    const c = this.criteria.get(id);
    return c ? { ...c } : null;
  }
  async maxCriteriaVersion(industry: string | null, support: string) {
    return Math.max(
      0,
      ...[...this.criteria.values()]
        .filter((c) => c.industryCategoryId === industry && c.projectSupport === support)
        .map((c) => c.version),
    );
  }
  async insertCriteria(c: CriteriaSnapshot) {
    this.criteria.set(c.criteriaId, { ...c });
  }
  async deactivateOtherVersions(keep: CriteriaSnapshot) {
    for (const [id, c] of this.criteria) {
      if (
        id !== keep.criteriaId &&
        c.industryCategoryId === keep.industryCategoryId &&
        c.projectSupport === keep.projectSupport
      ) {
        this.criteria.set(id, { ...c, active: false });
      }
    }
  }

  async findJobByKey(userId: string, key: string) {
    const j = [...this.jobs.values()].find(
      (x) => x.requestedBy === userId && x.idempotencyKey === key,
    );
    return j ? { ...j } : null;
  }
  async getJob(id: string) {
    const j = this.jobs.get(id);
    return j ? { ...j } : null;
  }
  async countJobsCreated(userId: string, from: Date, to: Date) {
    return [...this.jobs.values()].filter(
      (j) =>
        j.requestedBy === userId &&
        j.status !== "CANCELLED" &&
        j.createdAt >= from &&
        j.createdAt < to,
    ).length;
  }
  async insertJob(job: ResearchJob) {
    const dup = [...this.jobs.values()].some(
      (x) => x.requestedBy === job.requestedBy && x.idempotencyKey === job.idempotencyKey,
    );
    if (dup) throw new DuplicateJobError();
    this.jobs.set(job.jobId, { ...job });
  }
  async cancelQueuedJob(id: string, at: Date) {
    const j = this.jobs.get(id);
    if (j?.status !== "QUEUED") return false;
    this.jobs.set(id, { ...j, status: "CANCELLED", finishedAt: at });
    return true;
  }

  async getQuota(userId: string) {
    return this.quotas.get(userId) ?? null;
  }
  async userExists(userId: string) {
    return this.users.has(userId);
  }
  async upsertQuota(userId: string, limit: number) {
    this.quotas.set(userId, limit);
  }

  async claimNext(workerId: string, now: Date, leaseMs: number) {
    const runnable = [...this.jobs.values()]
      .filter(
        (j) =>
          (j.status === "QUEUED" && j.runAfter <= now) ||
          (j.status === "RUNNING" && j.lockedUntil !== null && j.lockedUntil <= now),
      )
      .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime());
    for (const j of runnable) {
      // A crashed worker already used its last attempt: bury the job instead of exceeding the bound.
      if (j.attempt >= j.maxAttempts) {
        this.jobs.set(j.jobId, {
          ...j,
          status: "DEAD",
          lockedBy: null,
          lockedUntil: null,
          lastErrorCode: "UNEXPECTED_ERROR",
          finishedAt: now,
        });
        continue;
      }
      const claimed: ResearchJob = {
        ...j,
        status: "RUNNING",
        attempt: j.attempt + 1,
        lockedBy: workerId,
        lockedUntil: new Date(now.getTime() + leaseMs),
      };
      this.jobs.set(j.jobId, claimed);
      return { ...claimed };
    }
    return null;
  }
  async completeJob(jobId: string, workerId: string, candidates: ProspectCandidate[], at: Date) {
    const j = this.jobs.get(jobId);
    if (j?.status !== "RUNNING" || j.lockedBy !== workerId) return false;
    const names = new Set(
      [...this.candidates.values()].filter((c) => c.jobId === jobId).map((c) => norm(c.name)),
    );
    for (const c of candidates) {
      if (names.has(norm(c.name))) continue; // retry after partial crash: ignore duplicates
      names.add(norm(c.name));
      this.candidates.set(c.candidateId, { ...c });
    }
    this.jobs.set(jobId, {
      ...j,
      status: "SUCCEEDED",
      lockedBy: null,
      lockedUntil: null,
      lastErrorCode: null,
      finishedAt: at,
    });
    return true;
  }
  async failAttempt(
    jobId: string,
    workerId: string,
    outcome: {
      status: "QUEUED" | "FAILED" | "DEAD";
      errorCode: JobErrorCode;
      retryAt: Date | null;
    },
    at: Date,
  ) {
    const j = this.jobs.get(jobId);
    if (j?.status !== "RUNNING" || j.lockedBy !== workerId) return false;
    this.jobs.set(jobId, {
      ...j,
      status: outcome.status,
      lockedBy: null,
      lockedUntil: null,
      lastErrorCode: outcome.errorCode,
      runAfter: outcome.retryAt ?? j.runAfter,
      finishedAt: outcome.status === "QUEUED" ? null : at,
    });
    return true;
  }

  async findPartnerMatch(name: string, domain: string | null) {
    return (
      (domain ? this.partnersByKey.get(domain) : undefined) ??
      this.partnersByKey.get(norm(name)) ??
      null
    );
  }
  async listPendingCandidates(limit: number) {
    return [...this.candidates.values()]
      .filter((c) => c.reviewStatus === "PENDING")
      .slice(0, limit);
  }
  async getCandidate(id: string) {
    const c = this.candidates.get(id);
    return c ? { ...c } : null;
  }
  async markCandidate(
    id: string,
    update: Pick<
      ProspectCandidate,
      | "reviewStatus"
      | "reviewedBy"
      | "reviewedAt"
      | "reviewReason"
      | "acceptedPartnerId"
      | "acceptedCycleId"
    >,
  ) {
    const c = this.candidates.get(id);
    if (c?.reviewStatus !== "PENDING") return false;
    this.candidates.set(id, { ...c, ...update });
    return true;
  }
}

/** Intake fake: records calls; can be made to fail to prove accept rolls back. */
export class FakeIntake implements PartnerIntake {
  calls: Parameters<PartnerIntake["createFromCandidate"]>[0][] = [];
  failWith: Error | null = null;
  partners = new Set<string>();
  cycles = new Set<string>();
  snapshot() {
    return {
      partners: new Set(this.partners),
      cycles: new Set(this.cycles),
      calls: [...this.calls],
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<FakeIntake["snapshot"]>;
    this.partners = new Set(snap.partners);
    this.cycles = new Set(snap.cycles);
    this.calls = [...snap.calls];
  }
  async createFromCandidate(input: Parameters<PartnerIntake["createFromCandidate"]>[0]) {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;
    const partnerId = input.existingPartnerId ?? crypto.randomUUID();
    const cycleId = crypto.randomUUID();
    this.partners.add(partnerId);
    this.cycles.add(cycleId);
    return { partnerId, cycleId };
  }
}

/** Scripted provider: each call returns the next queued behaviour. */
export class ScriptedProvider implements ResearchProvider {
  script: (() => unknown | Promise<unknown>)[] = [];
  calls = 0;
  lastCriteria: CriteriaSnapshot | null = null;
  async research(criteria: CriteriaSnapshot, _options: { signal: AbortSignal }) {
    this.calls++;
    this.lastCriteria = criteria;
    const next = this.script.shift();
    if (!next) throw new Error("no scripted response");
    return next();
  }
}

export const goodCandidate = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  websiteDomain: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.invalid`,
  fitScore: 82,
  fitRationale: "Matches the stated education focus.",
  insightSummary: "Runs youth leadership programmes in Jawa Barat.",
  sourceUrls: ["https://example.invalid/profile"],
  ...extra,
});

export async function buildResearchHarness(
  options: { failAudit?: boolean; defaultDailyQuota?: number; aiEnabled?: boolean } = {},
) {
  const repo = new InMemoryResearchRepo();
  const intake = new FakeIntake();
  const provider = new ScriptedProvider();
  const h = await buildAuditHarness({
    failAudit: options.failAudit,
    extraDomain: {
      snapshot: () => ({ repo: repo.snapshot(), intake: intake.snapshot() }),
      restore: (s) => {
        const snap = s as { repo: unknown; intake: unknown };
        repo.restore(snap.repo);
        intake.restore(snap.intake);
      },
    },
  });
  for (const u of h.users.users.values()) repo.users.add(u.userId);

  const research = createResearchService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    repository: repo,
    intake,
    clock: h.clock,
    defaultDailyQuota: options.defaultDailyQuota,
  });
  let aiEnabled = options.aiEnabled ?? true;
  const makeWorker = (workerId: string, extra: { timeoutMs?: number; leaseMs?: number } = {}) =>
    createResearchWorker({
      repository: repo,
      provider,
      aiEnabled: () => aiEnabled,
      workerId,
      clock: h.clock,
      ...extra,
    });
  const worker = makeWorker("worker-a");

  /** Creates an active criteria version through the real service, as a CRM Lead. */
  async function newCriteria(minFitScore = 60) {
    const token = await h.login("tlbd@example.invalid");
    const r = await research.createCriteriaVersion(token, {
      industryCategoryId: null,
      projectSupport: "BD_PROJECT",
      criteriaText: "Education organisations running youth programmes in Jawa Barat",
      minFitScore,
    });
    if (!r.ok) throw new Error(`criteria failed: ${r.code}`);
    return r.value;
  }

  return {
    ...h,
    repo,
    intake,
    provider,
    research,
    worker,
    makeWorker,
    newCriteria,
    setAiEnabled: (v: boolean) => {
      aiEnabled = v;
    },
  };
}
