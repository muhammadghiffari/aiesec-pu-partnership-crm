import type { Migration } from "./types";

/**
 * M2-01: research job queue, per-staff quotas and AI/research candidate DRAFTS.
 *
 * Candidates are not partners: a prospect only becomes a Partner + first PartnershipCycle +
 * ProspectingRecord when a human accepts it. Nothing here can send communications, and the
 * worker role needs INSERT/UPDATE on research_jobs and INSERT on prospect_candidates only
 * (never on market_research: human scores and Proceed stay human, docs/MIGRATIONS.md).
 */
export const migration0006: Migration = {
  version: 6,
  name: "research_jobs",
  up: `
-- Criteria versions are immutable snapshots: a job always runs against the exact text it was
-- queued with. Only the active flag may change; a new version is a new row.
CREATE FUNCTION target_criteria_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.criteria_id IS DISTINCT FROM OLD.criteria_id
     OR NEW.industry_category_id IS DISTINCT FROM OLD.industry_category_id
     OR NEW.project_support IS DISTINCT FROM OLD.project_support
     OR NEW.criteria_text IS DISTINCT FROM OLD.criteria_text
     OR NEW.min_fit_score IS DISTINCT FROM OLD.min_fit_score
     OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'criteria versions are immutable snapshots; create a new version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER target_criteria_snapshot_guard_trg BEFORE UPDATE ON target_criteria
  FOR EACH ROW EXECUTE FUNCTION target_criteria_snapshot_guard();

CREATE TABLE research_jobs (
  job_id          uuid PRIMARY KEY,
  criteria_id     uuid NOT NULL REFERENCES target_criteria (criteria_id) ON DELETE RESTRICT,
  requested_by    uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_.:-]{8,100}$'),
  status          text NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD','CANCELLED')),
  attempt         smallint NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts    smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  run_after       timestamptz NOT NULL,
  locked_by       text CHECK (locked_by ~ '^[A-Za-z0-9_.:-]{1,60}$'),
  locked_until    timestamptz,
  last_error_code text CHECK (last_error_code ~ '^[A-Z][A-Z_]{2,40}$'),
  created_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  CONSTRAINT research_jobs_idempotent UNIQUE (requested_by, idempotency_key),
  CONSTRAINT research_jobs_attempt_bound CHECK (attempt <= max_attempts),
  CONSTRAINT research_jobs_lease_pair CHECK ((locked_by IS NULL) = (locked_until IS NULL)),
  CONSTRAINT research_jobs_running_has_lease CHECK ((status = 'RUNNING') = (locked_by IS NOT NULL)),
  CONSTRAINT research_jobs_terminal_finished CHECK (
    (status IN ('SUCCEEDED','FAILED','DEAD','CANCELLED')) = (finished_at IS NOT NULL)
  ),
  CONSTRAINT research_jobs_failure_has_code CHECK (status NOT IN ('FAILED','DEAD') OR last_error_code IS NOT NULL)
);
CREATE INDEX research_jobs_claim_idx ON research_jobs (run_after) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX research_jobs_user_day_idx ON research_jobs (requested_by, created_at);

CREATE TABLE research_quotas (
  user_id     uuid PRIMARY KEY REFERENCES users (user_id) ON DELETE RESTRICT,
  daily_limit integer NOT NULL CHECK (daily_limit BETWEEN 0 AND 1000),
  updated_by  uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  updated_at  timestamptz NOT NULL
);

CREATE TABLE prospect_candidates (
  candidate_id                  uuid PRIMARY KEY,
  job_id                        uuid NOT NULL REFERENCES research_jobs (job_id) ON DELETE RESTRICT,
  name                          text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  website_domain                text CHECK (website_domain ~ '^[a-z0-9.-]+\\.[a-z]{2,}$'),
  fit_score                     numeric(5,2) NOT NULL CHECK (fit_score >= 0),
  fit_rationale                 text NOT NULL CHECK (length(btrim(fit_rationale)) > 0),
  insight_summary               text NOT NULL CHECK (length(btrim(insight_summary)) > 0),
  -- Claims the model could not support with a source; shown to reviewers as UNVERIFIED.
  unverified_claims             text[] NOT NULL DEFAULT '{}' CHECK (cardinality(unverified_claims) <= 20),
  source_urls                   text[] NOT NULL CHECK (cardinality(source_urls) BETWEEN 1 AND 10 AND crm_urls_ok(source_urls)),
  possible_duplicate_partner_id uuid REFERENCES partners (partner_id) ON DELETE RESTRICT,
  review_status                 text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','ACCEPTED','REJECTED')),
  reviewed_by                   uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  reviewed_at                   timestamptz,
  review_reason                 text,
  accepted_partner_id           uuid REFERENCES partners (partner_id) ON DELETE RESTRICT,
  accepted_cycle_id             uuid REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  created_at                    timestamptz NOT NULL,
  CONSTRAINT candidates_pending_untouched CHECK (
    review_status <> 'PENDING'
    OR (reviewed_by IS NULL AND reviewed_at IS NULL AND accepted_partner_id IS NULL AND accepted_cycle_id IS NULL)
  ),
  CONSTRAINT candidates_accepted_complete CHECK (
    review_status <> 'ACCEPTED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND accepted_partner_id IS NOT NULL AND accepted_cycle_id IS NOT NULL)
  ),
  CONSTRAINT candidates_rejected_has_reason CHECK (
    review_status <> 'REJECTED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(btrim(coalesce(review_reason, ''))) >= 3
        AND accepted_partner_id IS NULL AND accepted_cycle_id IS NULL)
  )
);
CREATE UNIQUE INDEX prospect_candidates_job_name_key ON prospect_candidates (job_id, lower(btrim(name)));
CREATE INDEX prospect_candidates_pending_idx ON prospect_candidates (review_status) WHERE review_status = 'PENDING';
`,
  down: `
DROP TRIGGER target_criteria_snapshot_guard_trg ON target_criteria;
DROP FUNCTION target_criteria_snapshot_guard();
DROP TABLE prospect_candidates;
DROP TABLE research_quotas;
DROP TABLE research_jobs;
`,
};
