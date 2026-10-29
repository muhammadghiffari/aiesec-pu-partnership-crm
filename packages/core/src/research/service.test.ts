import { describe, expect, it } from "vitest";
import { buildResearchHarness, goodCandidate } from "./test-support";
import { jakartaDayRange } from "./time";
import { DuplicateJobError, type ProspectCandidate, type ResearchJob } from "./types";

type H = Awaited<ReturnType<typeof buildResearchHarness>>;

const KEY = "run-2026-10-29-a";

async function queued(h: H, email = "staff@example.invalid", key = KEY) {
  const criteria = await h.newCriteria();
  const token = await h.login(email);
  const r = await h.research.enqueueJob(token, {
    criteriaId: criteria.criteriaId,
    idempotencyKey: key,
  });
  if (!r.ok) throw new Error(`enqueue failed: ${r.code}`);
  return { criteria, token, job: r.value.job };
}

function pendingCandidate(h: H, overrides: Partial<ProspectCandidate> = {}): ProspectCandidate {
  const c: ProspectCandidate = {
    candidateId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
    name: "Synthetic Education Org",
    websiteDomain: "syntheticedu.example.invalid",
    fitScore: 80,
    fitRationale: "Matches criteria.",
    insightSummary: "Runs youth programmes.",
    sourceUrls: ["https://example.invalid/profile"],
    unverifiedClaims: [],
    possibleDuplicatePartnerId: null,
    reviewStatus: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
    acceptedPartnerId: null,
    acceptedCycleId: null,
    createdAt: new Date("2026-10-29T03:00:00Z"),
    ...overrides,
  };
  h.repo.candidates.set(c.candidateId, c);
  return c;
}

/** A candidate wired to a real job + criteria so accept can resolve its criteria snapshot. */
async function candidateWithJob(h: H, overrides: Partial<ProspectCandidate> = {}) {
  const { job } = await queued(h);
  return pendingCandidate(h, { jobId: job.jobId, ...overrides });
}

describe("Asia/Jakarta quota day", () => {
  it("rolls over at 00:00 WIB (17:00 UTC), not at UTC midnight", () => {
    const before = jakartaDayRange(new Date("2026-10-29T16:59:59Z")); // 23:59:59 WIB
    const after = jakartaDayRange(new Date("2026-10-29T17:00:00Z")); // 00:00:00 WIB next day
    expect(before.from.toISOString()).toBe("2026-10-28T17:00:00.000Z");
    expect(before.to.toISOString()).toBe("2026-10-29T17:00:00.000Z");
    expect(after.from.toISOString()).toBe("2026-10-29T17:00:00.000Z");
    expect(jakartaDayRange(new Date("2026-10-29T00:00:00Z")).from.toISOString()).toBe(
      "2026-10-28T17:00:00.000Z",
    );
  });
});

describe("criteria snapshots", () => {
  it("a CRM Lead creates versioned criteria; a new version deactivates the old one but keeps its text", async () => {
    const h = await buildResearchHarness();
    const token = await h.login("lcvp.pd@example.invalid");
    const input = {
      industryCategoryId: null,
      projectSupport: "BD_PROJECT",
      criteriaText: "Education organisations in Jawa Barat",
      minFitScore: 60,
    };
    const v1 = await h.research.createCriteriaVersion(token, input);
    const v2 = await h.research.createCriteriaVersion(token, {
      ...input,
      criteriaText: "Education and consulting firms",
      minFitScore: 70,
    });
    expect(v1).toMatchObject({ ok: true, value: { version: 1, active: true } });
    expect(v2).toMatchObject({ ok: true, value: { version: 2, active: true, minFitScore: 70 } });
    if (!v1.ok) throw new Error();
    const old = await h.repo.getCriteria(v1.value.criteriaId);
    expect(old).toMatchObject({
      active: false,
      criteriaText: "Education organisations in Jawa Barat",
      minFitScore: 60,
    });
    expect(
      (await h.auditStore.list({ entityType: "target_criteria" })).map((e) => e.metadata.version),
    ).toEqual([1, 2]);
  });

  it("is restricted to CRM Leads and validated", async () => {
    const h = await buildResearchHarness();
    const good = {
      industryCategoryId: null,
      projectSupport: "OTHERS",
      criteriaText: "Valid criteria text here",
      minFitScore: 50,
    };
    expect(
      await h.research.createCriteriaVersion(await h.login("staff@example.invalid"), good),
    ).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
    });
    const lead = await h.login("tlbd@example.invalid");
    for (const bad of [
      { ...good, criteriaText: "short" },
      { ...good, minFitScore: 101 },
      { ...good, minFitScore: -1 },
      { ...good, projectSupport: "b2b" },
      { ...good, active: false },
    ]) {
      expect(await h.research.createCriteriaVersion(lead, bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(h.repo.criteria.size).toBe(0);
  });
});

describe("enqueueJob", () => {
  it("queues a job with the criteria snapshot id, attempt 0, and writes one audit event", async () => {
    const h = await buildResearchHarness();
    const { criteria, job } = await queued(h);
    expect(job).toMatchObject({
      criteriaId: criteria.criteriaId,
      requestedBy: "u-staff",
      status: "QUEUED",
      attempt: 0,
      maxAttempts: 3,
      lockedBy: null,
    });
    const events = await h.auditStore.list({ entityType: "research_job" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: "u-staff",
      entityId: job.jobId,
      metadata: { criteriaVersion: 1, usedToday: 1 },
    });
    expect(JSON.stringify(events)).not.toContain(KEY); // idempotency key is not copied into the log
  });

  it("is idempotent: the same key returns the original job, with no new job, audit event or quota use", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 1 });
    const { criteria, token, job } = await queued(h);
    const again = await h.research.enqueueJob(token, {
      criteriaId: criteria.criteriaId,
      idempotencyKey: KEY,
    });
    expect(again).toMatchObject({
      ok: true,
      value: { duplicate: true, job: { jobId: job.jobId } },
    });
    expect(h.repo.jobs.size).toBe(1);
    expect(await h.auditStore.list({ entityType: "research_job" })).toHaveLength(1);
    // Even with a quota of 1 already used, the replay still succeeds.
    expect(await h.research.getQuotaStatus(token)).toMatchObject({
      ok: true,
      value: { used: 1, remaining: 0 },
    });
  });

  it("returns the original job for a replay even after the job finished", async () => {
    const h = await buildResearchHarness();
    const { criteria, token, job } = await queued(h);
    h.repo.jobs.set(job.jobId, { ...job, status: "SUCCEEDED", finishedAt: new Date() });
    const again = await h.research.enqueueJob(token, {
      criteriaId: criteria.criteriaId,
      idempotencyKey: KEY,
    });
    expect(again).toMatchObject({
      ok: true,
      value: { duplicate: true, job: { status: "SUCCEEDED" } },
    });
  });

  it("rejects the same key with different criteria", async () => {
    const h = await buildResearchHarness();
    const { token } = await queued(h);
    const other = await h.newCriteria();
    expect(
      await h.research.enqueueJob(token, { criteriaId: other.criteriaId, idempotencyKey: KEY }),
    ).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
    });
  });

  it("keys are scoped per user", async () => {
    const h = await buildResearchHarness();
    const { criteria, job } = await queued(h);
    const lead = await h.login("tlbd@example.invalid");
    const r = await h.research.enqueueJob(lead, {
      criteriaId: criteria.criteriaId,
      idempotencyKey: KEY,
    });
    expect(r).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(r.ok && r.value.job.jobId).not.toBe(job.jobId);
  });

  it("recovers from a concurrent insert race by returning the winning job", async () => {
    const h = await buildResearchHarness();
    const criteria = await h.newCriteria();
    const token = await h.login("staff@example.invalid");
    // Another request commits the same key between our existence check and our insert: the
    // database raises a unique violation for us, and the winner is durable after our rollback.
    let winner: ResearchJob | null = null;
    const restore = h.repo.restore.bind(h.repo);
    h.repo.restore = (snapshot) => {
      restore(snapshot);
      if (winner) h.repo.jobs.set(winner.jobId, winner);
    };
    h.repo.insertJob = async (job) => {
      winner = { ...job, jobId: crypto.randomUUID() };
      throw new DuplicateJobError();
    };
    const r = await h.research.enqueueJob(token, {
      criteriaId: criteria.criteriaId,
      idempotencyKey: KEY,
    });
    expect(r).toMatchObject({ ok: true, value: { duplicate: true } });
    expect(r.ok && r.value.job.jobId).toBe((winner as ResearchJob | null)?.jobId);
    expect(h.repo.jobs.size).toBe(1);
    expect(await h.auditStore.list({ entityType: "research_job" })).toHaveLength(0); // loser wrote nothing
  });

  it("rejects unknown and inactive criteria, and malformed keys", async () => {
    const h = await buildResearchHarness();
    const token = await h.login("staff@example.invalid");
    const v1 = await h.newCriteria();
    await h.newCriteria(); // v2 deactivates v1
    expect(
      await h.research.enqueueJob(token, { criteriaId: v1.criteriaId, idempotencyKey: KEY }),
    ).toMatchObject({
      ok: false,
      code: "CRITERIA_INACTIVE",
    });
    expect(
      await h.research.enqueueJob(token, { criteriaId: crypto.randomUUID(), idempotencyKey: KEY }),
    ).toMatchObject({ ok: false, code: "CRITERIA_NOT_FOUND", httpStatus: 404 });
    for (const bad of ["short", "has space in it", "a@b.example.invalid", "x".repeat(101), ""]) {
      expect(
        await h.research.enqueueJob(token, { criteriaId: v1.criteriaId, idempotencyKey: bad }),
      ).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(h.repo.jobs.size).toBe(0);
  });

  it("denies viewers and anonymous callers without queuing", async () => {
    const h = await buildResearchHarness();
    const criteria = await h.newCriteria();
    const input = { criteriaId: criteria.criteriaId, idempotencyKey: KEY };
    expect(
      await h.research.enqueueJob(await h.login("viewer@example.invalid"), input),
    ).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
    });
    expect(await h.research.enqueueJob(undefined, input)).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
    expect(h.repo.jobs.size).toBe(0);
  });

  it("queues nothing when the audit write fails", async () => {
    const h = await buildResearchHarness({ failAudit: true });
    const criteriaId = crypto.randomUUID();
    h.repo.criteria.set(criteriaId, {
      criteriaId,
      industryCategoryId: null,
      projectSupport: "OTHERS",
      criteriaText: "x".repeat(20),
      minFitScore: 0,
      version: 1,
      active: true,
    });
    const token = await h.login("staff@example.invalid");
    await expect(h.research.enqueueJob(token, { criteriaId, idempotencyKey: KEY })).rejects.toThrow(
      /audit write failed/,
    );
    expect(h.repo.jobs.size).toBe(0);
  });
});

describe("per-staff quotas", () => {
  it("caps jobs per Jakarta day and reports the cap", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 2 });
    const criteria = await h.newCriteria();
    const token = await h.login("staff@example.invalid");
    const enqueue = (n: number) =>
      h.research.enqueueJob(token, {
        criteriaId: criteria.criteriaId,
        idempotencyKey: `run-key-${n}-xx`,
      });
    expect((await enqueue(1)).ok).toBe(true);
    expect((await enqueue(2)).ok).toBe(true);
    expect(await enqueue(3)).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED", httpStatus: 429 });
    expect(h.repo.jobs.size).toBe(2);
    expect(await h.research.getQuotaStatus(token)).toMatchObject({
      ok: true,
      value: { limit: 2, used: 2, remaining: 0 },
    });
  });

  it("is per user: one staff member reaching the cap does not block another", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 1 });
    const criteria = await h.newCriteria();
    const a = await h.login("staff@example.invalid");
    const b = await h.login("lcvp.pd@example.invalid");
    expect(
      (
        await h.research.enqueueJob(a, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-a-000001",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await h.research.enqueueJob(a, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-a-000002",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await h.research.enqueueJob(b, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-b-000001",
        })
      ).ok,
    ).toBe(true);
  });

  it("resets after midnight WIB and not at UTC midnight", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 1 });
    const criteria = await h.newCriteria();
    const token = await h.login("staff@example.invalid");
    // Harness clock starts 2026-10-29T03:00Z = 10:00 WIB.
    expect(
      (
        await h.research.enqueueJob(token, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-day-0001",
        })
      ).ok,
    ).toBe(true);
    h.clock.advance(14 * 60 * 60 * 1000 - 1000); // 16:59:59 UTC = 23:59:59 WIB
    const t2 = await h.login("staff@example.invalid");
    expect(
      await h.research.enqueueJob(t2, {
        criteriaId: criteria.criteriaId,
        idempotencyKey: "key-day-0002",
      }),
    ).toMatchObject({
      ok: false,
      code: "QUOTA_EXCEEDED",
    });
    h.clock.advance(1000); // 00:00:00 WIB next day
    const t3 = await h.login("staff@example.invalid");
    expect(
      (
        await h.research.enqueueJob(t3, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-day-0003",
        })
      ).ok,
    ).toBe(true);
  });

  it("cancelled jobs free their slot; failed jobs still count (no retry-abuse)", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 1 });
    const { criteria, token, job } = await queued(h);
    expect(
      await h.research.enqueueJob(token, {
        criteriaId: criteria.criteriaId,
        idempotencyKey: "key-slot-0002",
      }),
    ).toMatchObject({
      ok: false,
      code: "QUOTA_EXCEEDED",
    });
    expect((await h.research.cancelJob(token, job.jobId)).ok).toBe(true);
    expect(
      (
        await h.research.enqueueJob(token, {
          criteriaId: criteria.criteriaId,
          idempotencyKey: "key-slot-0002",
        })
      ).ok,
    ).toBe(true);
    const second = [...h.repo.jobs.values()].find((j) => j.idempotencyKey === "key-slot-0002");
    if (second)
      h.repo.jobs.set(second.jobId, {
        ...second,
        status: "DEAD",
        lastErrorCode: "PROVIDER_ERROR",
        finishedAt: new Date(),
      });
    expect(
      await h.research.enqueueJob(token, {
        criteriaId: criteria.criteriaId,
        idempotencyKey: "key-slot-0003",
      }),
    ).toMatchObject({
      ok: false,
      code: "QUOTA_EXCEEDED",
    });
  });

  it("a CRM Lead sets quotas (audited); staff cannot; 0 disables research for that user", async () => {
    const h = await buildResearchHarness({ defaultDailyQuota: 5 });
    const criteria = await h.newCriteria();
    const staffToken = await h.login("staff@example.invalid");
    expect(
      await h.research.setQuota(staffToken, { userId: "u-staff", dailyLimit: 100 }),
    ).toMatchObject({
      ok: false,
      code: "ACTION_NOT_PERMITTED",
    });
    expect(h.repo.quotas.size).toBe(0);

    const lead = await h.login("tlbd@example.invalid");
    expect(await h.research.setQuota(lead, { userId: "u-staff", dailyLimit: 0 })).toMatchObject({
      ok: true,
    });
    expect(
      await h.research.enqueueJob(staffToken, {
        criteriaId: criteria.criteriaId,
        idempotencyKey: "key-zero-0001",
      }),
    ).toMatchObject({
      ok: false,
      code: "QUOTA_EXCEEDED",
    });
    expect((await h.auditStore.list({ entityType: "research_quota" }))[0]).toMatchObject({
      actorUserId: "u-tlbd",
      entityId: "u-staff",
      metadata: { previousLimit: 5, newLimit: 0 },
    });
  });

  it("validates quota input and the target user", async () => {
    const h = await buildResearchHarness();
    const lead = await h.login("tlbd@example.invalid");
    h.repo.users.add("11111111-1111-4111-8111-111111111111");
    for (const bad of [
      { userId: "11111111-1111-4111-8111-111111111111", dailyLimit: -1 },
      { userId: "11111111-1111-4111-8111-111111111111", dailyLimit: 1001 },
      { userId: "11111111-1111-4111-8111-111111111111", dailyLimit: 2.5 },
      { userId: "bad id with spaces!", dailyLimit: 5 },
    ]) {
      expect(await h.research.setQuota(lead, bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(
      await h.research.setQuota(lead, { userId: crypto.randomUUID(), dailyLimit: 5 }),
    ).toMatchObject({ ok: false, code: "USER_NOT_FOUND" });
  });
});

describe("cancelJob", () => {
  it("the owner can cancel a queued job; running or finished jobs cannot be cancelled", async () => {
    const h = await buildResearchHarness();
    const { token, job } = await queued(h);
    expect(await h.research.cancelJob(token, job.jobId)).toMatchObject({
      ok: true,
      value: { status: "CANCELLED" },
    });
    expect(await h.research.cancelJob(token, job.jobId)).toMatchObject({
      ok: false,
      code: "JOB_NOT_CANCELLABLE",
    });
    const { job: running } = await queued(h, "staff@example.invalid", "key-run-000001");
    h.repo.jobs.set(running.jobId, {
      ...running,
      status: "RUNNING",
      lockedBy: "w",
      lockedUntil: new Date(),
    });
    expect(await h.research.cancelJob(token, running.jobId)).toMatchObject({
      ok: false,
      code: "JOB_NOT_CANCELLABLE",
    });
  });

  it("another staff member sees 'not found' (no oracle); a CRM Lead can cancel", async () => {
    const h = await buildResearchHarness();
    const { job } = await queued(h);
    const other = await h.login("viewer@example.invalid");
    expect(await h.research.cancelJob(other, job.jobId)).toMatchObject({ ok: false });
    const lead = await h.login("lcvp.pd@example.invalid");
    expect(await h.research.cancelJob(lead, job.jobId)).toMatchObject({
      ok: true,
      value: { status: "CANCELLED" },
    });
  });

  it("a different non-lead staff user cannot cancel someone else's job", async () => {
    const h = await buildResearchHarness();
    const { job } = await queued(h, "tlbd@example.invalid");
    const staff = await h.login("staff@example.invalid");
    expect(await h.research.cancelJob(staff, job.jobId)).toMatchObject({
      ok: false,
      code: "JOB_NOT_FOUND",
    });
    expect(h.repo.jobs.get(job.jobId)?.status).toBe("QUEUED");
  });
});

describe("human review of candidate drafts", () => {
  const industry = "22222222-2222-4222-8222-222222222222";

  it("accepting creates the partner and first cycle through the intake, never any research scores", async () => {
    const h = await buildResearchHarness();
    const c = await candidateWithJob(h);
    const staff = await h.login("staff@example.invalid");
    const r = await h.research.acceptCandidate(staff, {
      candidateId: c.candidateId,
      industryCategoryId: industry,
    });
    expect(r.ok).toBe(true);
    expect(h.intake.calls).toHaveLength(1);
    const call = h.intake.calls[0];
    expect(call).toMatchObject({
      industryCategoryId: industry,
      existingPartnerId: null,
      acceptedBy: "u-staff",
    });
    // The intake contract carries no alignment scores or Proceed: those stay human (M1-05).
    expect(Object.keys(call ?? {}).sort()).toEqual([
      "acceptedBy",
      "candidate",
      "criteria",
      "existingPartnerId",
      "industryCategoryId",
    ]);
    expect(h.repo.candidates.get(c.candidateId)).toMatchObject({
      reviewStatus: "ACCEPTED",
      reviewedBy: "u-staff",
    });
    expect(
      (await h.auditStore.list({ entityType: "prospect_candidate" }))[0]?.metadata,
    ).toMatchObject({ duplicateDecision: "NONE" });
  });

  it("a flagged possible duplicate requires an explicit decision and is never merged silently", async () => {
    const h = await buildResearchHarness();
    const existing = crypto.randomUUID();
    const c = await candidateWithJob(h, { possibleDuplicatePartnerId: existing });
    const staff = await h.login("staff@example.invalid");
    expect(
      await h.research.acceptCandidate(staff, {
        candidateId: c.candidateId,
        industryCategoryId: industry,
      }),
    ).toMatchObject({
      ok: false,
      code: "DUPLICATE_DECISION_REQUIRED",
      httpStatus: 422,
    });
    expect(h.intake.calls).toHaveLength(0);
    const use = await h.research.acceptCandidate(staff, {
      candidateId: c.candidateId,
      industryCategoryId: industry,
      duplicateDecision: "USE_EXISTING",
    });
    expect(use).toMatchObject({ ok: true, value: { partnerId: existing } });
    expect(h.intake.calls[0]?.existingPartnerId).toBe(existing);
  });

  it("CREATE_NEW overrides a duplicate flag; USE_EXISTING without a flagged partner is invalid", async () => {
    const h = await buildResearchHarness();
    const flagged = await candidateWithJob(h, { possibleDuplicatePartnerId: crypto.randomUUID() });
    const unflagged = pendingCandidate(h, { jobId: flagged.jobId, name: "Another Org" });
    const staff = await h.login("staff@example.invalid");
    expect(
      (
        await h.research.acceptCandidate(staff, {
          candidateId: flagged.candidateId,
          industryCategoryId: industry,
          duplicateDecision: "CREATE_NEW",
        })
      ).ok,
    ).toBe(true);
    expect(
      await h.research.acceptCandidate(staff, {
        candidateId: unflagged.candidateId,
        industryCategoryId: industry,
        duplicateDecision: "USE_EXISTING",
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("rejecting requires a reason and records who and why", async () => {
    const h = await buildResearchHarness();
    const c = await candidateWithJob(h);
    const staff = await h.login("staff@example.invalid");
    expect(
      await h.research.rejectCandidate(staff, { candidateId: c.candidateId, reason: "x" }),
    ).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
    expect(
      await h.research.rejectCandidate(staff, {
        candidateId: c.candidateId,
        reason: "Not an education organisation",
      }),
    ).toMatchObject({ ok: true });
    expect(h.repo.candidates.get(c.candidateId)).toMatchObject({
      reviewStatus: "REJECTED",
      reviewReason: "Not an education organisation",
      reviewedBy: "u-staff",
    });
    expect(h.intake.calls).toHaveLength(0);
  });

  it("a candidate can be reviewed only once", async () => {
    const h = await buildResearchHarness();
    const c = await candidateWithJob(h);
    const staff = await h.login("staff@example.invalid");
    await h.research.rejectCandidate(staff, {
      candidateId: c.candidateId,
      reason: "Not relevant to criteria",
    });
    expect(
      await h.research.acceptCandidate(staff, {
        candidateId: c.candidateId,
        industryCategoryId: industry,
      }),
    ).toMatchObject({
      ok: false,
      code: "CANDIDATE_ALREADY_REVIEWED",
    });
    expect(
      await h.research.rejectCandidate(staff, {
        candidateId: c.candidateId,
        reason: "Second rejection",
      }),
    ).toMatchObject({
      ok: false,
      code: "CANDIDATE_ALREADY_REVIEWED",
    });
    expect(h.intake.calls).toHaveLength(0);
  });

  it("accept is atomic: an intake failure leaves the candidate pending and writes no audit event", async () => {
    const h = await buildResearchHarness();
    const c = await candidateWithJob(h);
    const staff = await h.login("staff@example.invalid");
    const before = (await h.auditStore.list({ entityType: "prospect_candidate" })).length;
    h.intake.failWith = new Error("db unavailable");
    await expect(
      h.research.acceptCandidate(staff, {
        candidateId: c.candidateId,
        industryCategoryId: industry,
      }),
    ).rejects.toThrow("db unavailable");
    expect(h.repo.candidates.get(c.candidateId)?.reviewStatus).toBe("PENDING");
    expect(h.intake.partners.size).toBe(0);
    expect((await h.auditStore.list({ entityType: "prospect_candidate" })).length).toBe(before);
  });

  it("viewers cannot list, accept or reject; anonymous callers are refused", async () => {
    const h = await buildResearchHarness();
    const c = await candidateWithJob(h);
    const viewer = await h.login("viewer@example.invalid");
    for (const token of [viewer, undefined]) {
      expect((await h.research.listPendingCandidates(token)).ok).toBe(false);
      expect(
        (
          await h.research.acceptCandidate(token, {
            candidateId: c.candidateId,
            industryCategoryId: industry,
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await h.research.rejectCandidate(token, {
            candidateId: c.candidateId,
            reason: "attempt to reject",
          })
        ).ok,
      ).toBe(false);
    }
    expect(h.repo.candidates.get(c.candidateId)?.reviewStatus).toBe("PENDING");
    expect(h.intake.calls).toHaveLength(0);
  });

  it("lists pending candidates for staff", async () => {
    const h = await buildResearchHarness();
    pendingCandidate(h);
    pendingCandidate(h, { name: "Reviewed Org", reviewStatus: "REJECTED" });
    const r = await h.research.listPendingCandidates(await h.login("staff@example.invalid"));
    expect(r.ok && r.value.map((x) => x.name)).toEqual(["Synthetic Education Org"]);
  });

  it("goodCandidate fixture is itself valid (guards the other tests)", () => {
    expect(goodCandidate("Sample Org")).toMatchObject({
      name: "Sample Org",
      sourceUrls: ["https://example.invalid/profile"],
    });
  });
});
