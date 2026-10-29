import type { Migration } from "./types";

/**
 * Class Diagram classes: RealizationProject, DeliveryRecord, RevenueRecord, PartnerEngagement,
 * PostPartnershipSurvey, MerchandiseItem, MerchandiseBundle, MerchandiseBundleItem,
 * MerchandiseRealization, RateCardAssessment.
 *
 * Separation rules encoded structurally:
 * - Actual partner receipts live ONLY in revenue_records (financial XOR in-kind, proof required).
 *   Proposal values (proposals/proposal_benefits) are forecasts and are never summed into them.
 * - Merchandise sales live ONLY in merchandise_realizations; there is no FK to revenue_records,
 *   so retail revenue cannot be double counted as partner contribution without an explicit,
 *   audited link introduced by a future migration.
 */
export const migration0003: Migration = {
  version: 3,
  name: "implementation_revenue_merch",
  up: `
CREATE TABLE realization_projects (
  project_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loa_id                uuid NOT NULL REFERENCES loas (loa_id) ON DELETE RESTRICT,
  status                text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','RUNNING','FINISHED','CANCELLED')),
  start_date            date NOT NULL,
  end_date              date,
  report_url            text CHECK (crm_url_ok(report_url)),
  report_submitted_at   timestamptz,
  -- Optional seven-working-day Impact Report target; distinct from the mandatory ESSM report link.
  impact_report_due_at  date,
  CONSTRAINT projects_period CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT projects_finished_requires_report CHECK (
    status <> 'FINISHED' OR (report_url IS NOT NULL AND report_submitted_at IS NOT NULL)
  )
);
CREATE INDEX projects_loa_idx ON realization_projects (loa_id);

CREATE FUNCTION realization_projects_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  loa_status text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.loa_id IS DISTINCT FROM OLD.loa_id THEN
    SELECT status INTO loa_status FROM loas WHERE loa_id = NEW.loa_id;
    IF loa_status IS DISTINCT FROM 'SIGNED' THEN
      RAISE EXCEPTION 'a realization project requires a fully signed LoA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER realization_projects_guard_trg BEFORE INSERT OR UPDATE ON realization_projects
  FOR EACH ROW EXECUTE FUNCTION realization_projects_guard();

CREATE TABLE delivery_records (
  delivery_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES realization_projects (project_id) ON DELETE RESTRICT,
  proposal_benefit_id uuid NOT NULL REFERENCES proposal_benefits (proposal_benefit_id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','DELIVERED','CANCELLED')),
  due_at              timestamptz,
  delivered_at        timestamptz,
  proof_url           text CHECK (crm_url_ok(proof_url)),
  CONSTRAINT delivery_one_per_commitment UNIQUE (project_id, proposal_benefit_id),
  CONSTRAINT delivery_delivered_requires_proof CHECK (
    status <> 'DELIVERED' OR (delivered_at IS NOT NULL AND proof_url IS NOT NULL)
  )
);

CREATE FUNCTION delivery_records_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  project_proposal uuid;
  benefit_proposal uuid;
BEGIN
  SELECT l.proposal_id INTO project_proposal
    FROM realization_projects p JOIN loas l ON l.loa_id = p.loa_id WHERE p.project_id = NEW.project_id;
  SELECT proposal_id INTO benefit_proposal FROM proposal_benefits WHERE proposal_benefit_id = NEW.proposal_benefit_id;
  IF project_proposal IS DISTINCT FROM benefit_proposal THEN
    RAISE EXCEPTION 'delivery must reference a benefit of the LoA''s own proposal' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER delivery_records_guard_trg BEFORE INSERT OR UPDATE ON delivery_records
  FOR EACH ROW EXECUTE FUNCTION delivery_records_guard();

CREATE TABLE revenue_records (
  record_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id             uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  loa_id               uuid REFERENCES loas (loa_id) ON DELETE RESTRICT,
  project_id           uuid REFERENCES realization_projects (project_id) ON DELETE RESTRICT,
  revenue_type         text NOT NULL CHECK (revenue_type IN ('FINANCIAL','IN_KIND')),
  month                text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  program              text NOT NULL CHECK (length(btrim(program)) > 0),
  date_received        date NOT NULL,
  financial_amount     bigint CHECK (financial_amount > 0),
  in_kind_value        bigint CHECK (in_kind_value > 0),
  in_kind_type         text CHECK (in_kind_type IN ('ADDED_VALUE','COST_REDUCTION')),
  in_kind_description  text,
  proof_url            text NOT NULL CHECK (crm_url_ok(proof_url)),
  proof_uploaded       boolean NOT NULL DEFAULT false,
  CONSTRAINT revenue_financial_shape CHECK (
    revenue_type <> 'FINANCIAL'
    OR (financial_amount IS NOT NULL AND in_kind_value IS NULL AND in_kind_type IS NULL AND in_kind_description IS NULL)
  ),
  CONSTRAINT revenue_in_kind_shape CHECK (
    revenue_type <> 'IN_KIND'
    OR (financial_amount IS NULL AND in_kind_value IS NOT NULL AND in_kind_type IS NOT NULL
        AND length(btrim(coalesce(in_kind_description, ''))) > 0)
  )
);
CREATE INDEX revenue_cycle_idx ON revenue_records (cycle_id);
CREATE INDEX revenue_month_idx ON revenue_records (month);

CREATE FUNCTION revenue_records_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  loa_cycle uuid;
BEGIN
  IF NEW.loa_id IS NOT NULL THEN
    SELECT cycle_id INTO loa_cycle FROM loas WHERE loa_id = NEW.loa_id;
    IF loa_cycle IS DISTINCT FROM NEW.cycle_id THEN
      RAISE EXCEPTION 'revenue LoA belongs to a different cycle' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF NEW.project_id IS NOT NULL THEN
    SELECT l.cycle_id INTO loa_cycle
      FROM realization_projects p JOIN loas l ON l.loa_id = p.loa_id WHERE p.project_id = NEW.project_id;
    IF loa_cycle IS DISTINCT FROM NEW.cycle_id THEN
      RAISE EXCEPTION 'revenue project belongs to a different cycle' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revenue_records_guard_trg BEFORE INSERT OR UPDATE ON revenue_records
  FOR EACH ROW EXECUTE FUNCTION revenue_records_guard();

CREATE TABLE partner_engagements (
  engagement_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  engagement_type text NOT NULL CHECK (engagement_type IN ('NEWSLETTER','PARTNER_VISIT','EVENT_INVITATION','GREETING_CARD')),
  status          text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','APPROVED','SENT','SKIPPED','CANCELLED')),
  scheduled_for   timestamptz,
  approved_by     uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  sent_by         uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  sent_at         timestamptz,
  content_url     text CHECK (crm_url_ok(content_url)),
  mom_url         text CHECK (crm_url_ok(mom_url)),
  CONSTRAINT engagement_sent_complete CHECK (
    status <> 'SENT' OR (sent_at IS NOT NULL AND sent_by IS NOT NULL AND approved_by IS NOT NULL)
  )
);
CREATE INDEX engagements_cycle_idx ON partner_engagements (cycle_id);

CREATE TABLE post_partnership_surveys (
  survey_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id             uuid NOT NULL UNIQUE REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  official_form_url    text NOT NULL CHECK (crm_url_ok(official_form_url)),
  status               text NOT NULL DEFAULT 'NOT_SENT' CHECK (status IN ('NOT_SENT','SENT','COMPLETION_CONFIRMED')),
  sent_at              timestamptz,
  sent_by              uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  completion_checked_at timestamptz,
  CONSTRAINT survey_sent_complete CHECK (status = 'NOT_SENT' OR (sent_at IS NOT NULL AND sent_by IS NOT NULL)),
  CONSTRAINT survey_completion_checked CHECK (status <> 'COMPLETION_CONFIRMED' OR completion_checked_at IS NOT NULL)
);

CREATE TABLE merchandise_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name       text NOT NULL CHECK (length(btrim(item_name)) > 0),
  vendor_url      text CHECK (crm_url_ok(vendor_url)),
  cogs_per_item   bigint NOT NULL CHECK (cogs_per_item >= 0),
  selling_price   bigint NOT NULL CHECK (selling_price >= 0),
  profit_per_item bigint GENERATED ALWAYS AS (selling_price - cogs_per_item) STORED NOT NULL,
  active          boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX merchandise_items_name_key ON merchandise_items (lower(btrim(item_name)));

CREATE TABLE merchandise_bundles (
  bundle_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_name   text NOT NULL CHECK (length(btrim(bundle_name)) > 0),
  bundling_price bigint NOT NULL CHECK (bundling_price >= 0),
  active        boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX merchandise_bundles_name_key ON merchandise_bundles (lower(btrim(bundle_name)));

CREATE TABLE merchandise_bundle_items (
  bundle_item_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id         uuid NOT NULL REFERENCES merchandise_bundles (bundle_id) ON DELETE RESTRICT,
  item_id           uuid NOT NULL REFERENCES merchandise_items (item_id) ON DELETE RESTRICT,
  quantity_per_bundle integer NOT NULL CHECK (quantity_per_bundle > 0),
  CONSTRAINT bundle_item_unique UNIQUE (bundle_id, item_id)
);

CREATE TABLE merchandise_realizations (
  realization_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            uuid REFERENCES merchandise_items (item_id) ON DELETE RESTRICT,
  bundle_id          uuid REFERENCES merchandise_bundles (bundle_id) ON DELETE RESTRICT,
  quantity_sold      integer NOT NULL CHECK (quantity_sold > 0),
  unit_selling_price bigint NOT NULL CHECK (unit_selling_price >= 0),
  -- Cost snapshot at sale time (for a bundle: sum of component COGS x quantity), so later
  -- COGS edits cannot rewrite historic profit.
  unit_cogs_snapshot bigint NOT NULL CHECK (unit_cogs_snapshot >= 0),
  total_cogs         bigint GENERATED ALWAYS AS (quantity_sold::bigint * unit_cogs_snapshot) STORED NOT NULL,
  total_revenue      bigint GENERATED ALWAYS AS (quantity_sold::bigint * unit_selling_price) STORED NOT NULL,
  total_profit       bigint GENERATED ALWAYS AS (quantity_sold::bigint * (unit_selling_price - unit_cogs_snapshot)) STORED NOT NULL,
  realized_at        date NOT NULL,
  revenue_proof_url  text NOT NULL CHECK (crm_url_ok(revenue_proof_url)),
  CONSTRAINT realization_item_xor_bundle CHECK ((item_id IS NULL) <> (bundle_id IS NULL))
);

CREATE TABLE rate_card_assessments (
  assessment_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_benefit_id            uuid NOT NULL UNIQUE REFERENCES proposal_benefits (proposal_benefit_id) ON DELETE RESTRICT,
  retention_rate_score           smallint NOT NULL CHECK (retention_rate_score BETWEEN 0 AND 5),
  event_size_score               smallint NOT NULL CHECK (event_size_score BETWEEN 0 AND 5),
  event_scale_score              smallint NOT NULL CHECK (event_scale_score BETWEEN 0 AND 5),
  partnership_quality_score      smallint NOT NULL CHECK (partnership_quality_score BETWEEN 0 AND 5),
  partnership_duration_score     smallint NOT NULL CHECK (partnership_duration_score BETWEEN 0 AND 5),
  -- Derived values stay NULL until the ESSM formula is confirmed (docs/DECISIONS.md Q-01).
  monetize_quality               numeric(10,4),
  sdg_alignment_score            smallint NOT NULL CHECK (sdg_alignment_score BETWEEN 0 AND 5),
  leadership_value_alignment_score smallint NOT NULL CHECK (leadership_value_alignment_score BETWEEN 0 AND 5),
  partnership_retained_score     smallint NOT NULL CHECK (partnership_retained_score BETWEEN 0 AND 5),
  historical_score               smallint NOT NULL CHECK (historical_score BETWEEN 0 AND 5),
  communication_score            smallint NOT NULL CHECK (communication_score BETWEEN 0 AND 5),
  monetize_value                 numeric(10,4),
  assessed_at                    timestamptz NOT NULL DEFAULT now()
);
`,
  down: `
DROP TABLE rate_card_assessments;
DROP TABLE merchandise_realizations;
DROP TABLE merchandise_bundle_items;
DROP TABLE merchandise_bundles;
DROP TABLE merchandise_items;
DROP TABLE post_partnership_surveys;
DROP TABLE partner_engagements;
DROP TABLE revenue_records;
DROP FUNCTION revenue_records_guard();
DROP TABLE delivery_records;
DROP FUNCTION delivery_records_guard();
DROP TABLE realization_projects;
DROP FUNCTION realization_projects_guard();
`,
};
