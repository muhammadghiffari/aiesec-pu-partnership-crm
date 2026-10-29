/**
 * Integrity tests for migration 0006 (research jobs, quotas, candidate drafts), on real
 * PostgreSQL via PGlite.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  newPartner,
  type Row,
  uniq,
  update,
} from "./test-support";

let f: Fixture;
let criteria: Row;
beforeAll(async () => {
  f = await buildFixture();
  criteria = await insert(f.db, "target_criteria", {
    industry_category_id: f.category.category_id,
    project_support: "OTHERS",
    criteria_text: "Education organisations in Jawa Barat",
    min_fit_score: 60,
    version: 1,
  });
});

const job = (extra: Row = {}): Row => ({
  job_id: crypto.randomUUID(),
  criteria_id: criteria.criteria_id,
  requested_by: f.staff.user_id,
  idempotency_key: uniq("run-key-0000"),
  run_after: "2026-10-29T03:00:00Z",
  created_at: "2026-10-29T03:00:00Z",
  ...extra,
});

const candidate = (jobId: unknown, extra: Row = {}): Row => ({
  candidate_id: crypto.randomUUID(),
  job_id: jobId,
  name: uniq("Synthetic Org"),
  fit_score: 80,
  fit_rationale: "Matches the criteria",
  insight_summary: "Runs youth programmes",
  source_urls: ["https://example.invalid/profile"],
  created_at: "2026-10-29T03:00:00Z",
  ...extra,
});

describe("criteria snapshot immutability", () => {
  it("rejects editing the text, score, version or scope of a criteria row", async () => {
    for (const set of [
      { criteria_text: "Changed after jobs were queued" },
      { min_fit_score: 1 },
      { version: 99 },
      { project_support: "LV" },
      { industry_category_id: null },
    ]) {
      await expectDbError(
        update(f.db, "target_criteria", "criteria_id", criteria.criteria_id, set),
        /immutable snapshots|foreign key/,
      );
    }
    const { rows } = await f.db.query<Row>(
      "SELECT criteria_text FROM target_criteria WHERE criteria_id = $1",
      [criteria.criteria_id],
    );
    expect(rows[0]?.criteria_text).toBe("Education organisations in Jawa Barat");
  });

  it("still allows deactivating a version; a new version is a new row", async () => {
    const v2 = await insert(f.db, "target_criteria", {
      industry_category_id: f.category.category_id,
      project_support: "OTHERS",
      criteria_text: "Second version of the criteria",
      version: 2,
    });
    await update(f.db, "target_criteria", "criteria_id", criteria.criteria_id, { active: false });
    await update(f.db, "target_criteria", "criteria_id", criteria.criteria_id, { active: true });
    expect(v2.version).toBe(2);
  });
});

describe("research_jobs", () => {
  it("queues a job with defaults and enforces per-user idempotency keys", async () => {
    const base = job();
    const j = await insert(f.db, "research_jobs", base);
    expect(j).toMatchObject({ status: "QUEUED", attempt: 0, max_attempts: 3, locked_by: null });
    await expectDbError(
      insert(f.db, "research_jobs", job({ idempotency_key: base.idempotency_key })),
      "research_jobs_idempotent",
    );
    // The same key for another user is a different job.
    await insert(
      f.db,
      "research_jobs",
      job({ idempotency_key: base.idempotency_key, requested_by: f.leadA.user_id }),
    );
  });

  it("rejects malformed keys, unknown criteria and unknown requesters", async () => {
    await expectDbError(
      insert(f.db, "research_jobs", job({ idempotency_key: "short" })),
      "idempotency_key",
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ idempotency_key: "has spaces in key" })),
      "idempotency_key",
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ criteria_id: crypto.randomUUID() })),
      "foreign key",
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ requested_by: crypto.randomUUID() })),
      "foreign key",
    );
  });

  it("bounds attempts: never above max_attempts, max_attempts 1-5", async () => {
    await expectDbError(
      insert(f.db, "research_jobs", job({ attempt: 4 })),
      "research_jobs_attempt_bound",
    );
    await expectDbError(insert(f.db, "research_jobs", job({ max_attempts: 0 })), "max_attempts");
    await expectDbError(insert(f.db, "research_jobs", job({ max_attempts: 6 })), "max_attempts");
    await insert(f.db, "research_jobs", job({ attempt: 5, max_attempts: 5 }));
  });

  it("a RUNNING job must hold a complete lease, and only a RUNNING job may", async () => {
    const lock = { locked_by: "worker-a", locked_until: "2026-10-29T03:02:00Z" };
    await expectDbError(
      insert(f.db, "research_jobs", job({ status: "RUNNING" })),
      "research_jobs_running_has_lease",
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ status: "RUNNING", locked_by: "worker-a" })),
      /research_jobs_lease_pair|research_jobs_running_has_lease/,
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ ...lock })),
      "research_jobs_running_has_lease",
    );
    await insert(f.db, "research_jobs", job({ status: "RUNNING", attempt: 1, ...lock }));
  });

  it("terminal states carry a finish time; failures carry an error code", async () => {
    await expectDbError(
      insert(f.db, "research_jobs", job({ status: "SUCCEEDED" })),
      "research_jobs_terminal_finished",
    );
    await expectDbError(
      insert(f.db, "research_jobs", job({ finished_at: "2026-10-29T04:00:00Z" })),
      "research_jobs_terminal_finished",
    );
    await insert(
      f.db,
      "research_jobs",
      job({ status: "SUCCEEDED", attempt: 1, finished_at: "2026-10-29T04:00:00Z" }),
    );
    await expectDbError(
      insert(
        f.db,
        "research_jobs",
        job({ status: "DEAD", attempt: 3, finished_at: "2026-10-29T04:00:00Z" }),
      ),
      "research_jobs_failure_has_code",
    );
    await insert(
      f.db,
      "research_jobs",
      job({
        status: "DEAD",
        attempt: 3,
        finished_at: "2026-10-29T04:00:00Z",
        last_error_code: "PROVIDER_ERROR",
      }),
    );
  });

  it("stores only an error CODE (a provider message cannot be stored in that column)", async () => {
    await expectDbError(
      insert(
        f.db,
        "research_jobs",
        job({
          status: "FAILED",
          finished_at: "2026-10-29T04:00:00Z",
          last_error_code: "401 for key sk-abc and prompt text",
        }),
      ),
      "last_error_code",
    );
  });

  it("an unknown status is rejected", async () => {
    await expectDbError(insert(f.db, "research_jobs", job({ status: "PAUSED" })), "status");
  });
});

describe("research_quotas", () => {
  it("one row per user with a bounded daily limit (0 disables research)", async () => {
    await insert(f.db, "research_quotas", {
      user_id: f.staff.user_id,
      daily_limit: 0,
      updated_by: f.leadA.user_id,
      updated_at: "2026-10-29T03:00:00Z",
    });
    await expectDbError(
      insert(f.db, "research_quotas", {
        user_id: f.staff.user_id,
        daily_limit: 5,
        updated_by: f.leadA.user_id,
        updated_at: "2026-10-29T03:00:00Z",
      }),
      /research_quotas_pkey|duplicate key/,
    );
    for (const bad of [-1, 1001]) {
      await expectDbError(
        insert(f.db, "research_quotas", {
          user_id: f.leadB.user_id,
          daily_limit: bad,
          updated_by: f.leadA.user_id,
          updated_at: "2026-10-29T03:00:00Z",
        }),
        "daily_limit",
      );
    }
    await expectDbError(
      insert(f.db, "research_quotas", {
        user_id: f.leadB.user_id,
        daily_limit: 5,
        updated_by: crypto.randomUUID(),
        updated_at: "2026-10-29T03:00:00Z",
      }),
      "foreign key",
    );
  });
});

describe("prospect_candidates are drafts that need sources", () => {
  let j: Row;
  beforeAll(async () => {
    j = await insert(f.db, "research_jobs", job());
  });

  it("stores a pending draft with source URLs and unverified claims separately", async () => {
    const c = await insert(
      f.db,
      "prospect_candidates",
      candidate(j.job_id, { unverified_claims: ["Reportedly 500 staff"] }),
    );
    expect(c).toMatchObject({
      review_status: "PENDING",
      reviewed_by: null,
      accepted_partner_id: null,
    });
    expect(c.unverified_claims).toEqual(["Reportedly 500 staff"]);
  });

  it("requires 1-10 valid http(s) source URLs", async () => {
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, { source_urls: [] })),
      "source_urls",
    );
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, { source_urls: ["javascript:alert(1)"] }),
      ),
      "source_urls",
    );
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, { source_urls: ["https://example.invalid/ok", "not a url"] }),
      ),
      "source_urls",
    );
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, {
          source_urls: Array.from({ length: 11 }, (_, i) => `https://example.invalid/${i}`),
        }),
      ),
      "source_urls",
    );
  });

  it("a retry cannot store the same company twice for one job (case-insensitive)", async () => {
    await insert(f.db, "prospect_candidates", candidate(j.job_id, { name: "Retry Safe Org" }));
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, { name: "retry safe org" })),
      "prospect_candidates_job_name_key",
    );
    const other = await insert(f.db, "research_jobs", job());
    await insert(f.db, "prospect_candidates", candidate(other.job_id, { name: "Retry Safe Org" }));
  });

  it("a pending draft cannot already carry review data or a created partner", async () => {
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, { reviewed_by: f.staff.user_id })),
      "candidates_pending_untouched",
    );
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, { accepted_partner_id: f.partner.partner_id }),
      ),
      "candidates_pending_untouched",
    );
  });

  it("ACCEPTED needs reviewer, time, partner and cycle; REJECTED needs a reason and no partner", async () => {
    const accepted = {
      review_status: "ACCEPTED",
      reviewed_by: f.staff.user_id,
      reviewed_at: "2026-10-29T05:00:00Z",
    };
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, accepted)),
      "candidates_accepted_complete",
    );
    await insert(
      f.db,
      "prospect_candidates",
      candidate(j.job_id, {
        ...accepted,
        accepted_partner_id: f.partner.partner_id,
        accepted_cycle_id: f.cycle.cycle_id,
      }),
    );
    const rejected = {
      review_status: "REJECTED",
      reviewed_by: f.staff.user_id,
      reviewed_at: "2026-10-29T05:00:00Z",
    };
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, rejected)),
      "candidates_rejected_has_reason",
    );
    await expectDbError(
      insert(f.db, "prospect_candidates", candidate(j.job_id, { ...rejected, review_reason: "x" })),
      "candidates_rejected_has_reason",
    );
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, {
          ...rejected,
          review_reason: "Not relevant",
          accepted_partner_id: f.partner.partner_id,
        }),
      ),
      "candidates_rejected_has_reason",
    );
    await insert(
      f.db,
      "prospect_candidates",
      candidate(j.job_id, { ...rejected, review_reason: "Not an education organisation" }),
    );
  });

  it("flags but does not require a possible duplicate partner; the partner must exist", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    const c = await insert(
      f.db,
      "prospect_candidates",
      candidate(j.job_id, { possible_duplicate_partner_id: p.partner_id }),
    );
    expect(c.possible_duplicate_partner_id).toBe(p.partner_id);
    await expectDbError(
      insert(
        f.db,
        "prospect_candidates",
        candidate(j.job_id, { possible_duplicate_partner_id: crypto.randomUUID() }),
      ),
      "foreign key",
    );
  });

  it("a job with candidates cannot be deleted (evidence is preserved)", async () => {
    await expectDbError(
      f.db.query("DELETE FROM research_jobs WHERE job_id = $1", [j.job_id]),
      "foreign key",
    );
  });

  it("has no column that could hold outbound message content or credentials", async () => {
    const { rows } = await f.db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('research_jobs','research_quotas','prospect_candidates')
          AND column_name ~* '(email|phone|whatsapp|message|draft|token|secret|password|prompt|transcript)'`,
    );
    expect(rows).toEqual([]);
  });
});
