import type { Migration } from "./types";

/**
 * Class Diagram classes: User, IndustryCategory, Partner, Contact, PartnershipCycle,
 * TargetCriteria, MarketResearch, ProspectingRecord (+ ProjectSupportType lookup).
 *
 * Enumerations are `text` + CHECK (not CREATE TYPE): a value can be added by a normal
 * migration and removed without the ALTER TYPE restrictions.
 * Timestamps are timestamptz (UTC). IDR money is bigint rupiah (see docs/DATA_MODEL.md).
 */
export const migration0001: Migration = {
  version: 1,
  name: "core_domain",
  up: `
CREATE FUNCTION crm_url_ok(u text) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT u ~ '^https?://[^[:space:]]+$' $$;

CREATE FUNCTION crm_urls_ok(urls text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$
    SELECT array_position(urls, NULL) IS NULL
       AND coalesce(bool_and(x ~ '^https?://[^[:space:]]+$'), true)
    FROM unnest(urls) AS x
  $$;

CREATE TABLE users (
  user_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  name                text NOT NULL CHECK (length(btrim(name)) > 0),
  access_role         text NOT NULL CHECK (access_role IN ('CRM_LEAD','BD_STAFF','VIEWER')),
  is_active           boolean NOT NULL DEFAULT true,
  organizational_title text,
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE industry_categories (
  category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name        text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE project_support_types (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  label       text NOT NULL UNIQUE CHECK (length(btrim(label)) > 0),
  description text,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE partners (
  partner_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(btrim(name)) > 0),
  normalized_name      text GENERATED ALWAYS AS (lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))) STORED,
  industry_category_id uuid NOT NULL REFERENCES industry_categories (category_id) ON DELETE RESTRICT,
  official_email       text CHECK (official_email = lower(btrim(official_email))),
  website_domain       text CHECK (website_domain ~ '^[a-z0-9.-]+\\.[a-z]{2,}$'),
  source               text NOT NULL CHECK (length(btrim(source)) > 0),
  source_url           text CHECK (crm_url_ok(source_url)),
  source_tier          text NOT NULL DEFAULT 'UNVERIFIED'
                         CHECK (source_tier IN ('OFFICIAL','REFERRAL','RESEARCH','UNVERIFIED')),
  created_at           timestamptz NOT NULL DEFAULT now()
);
-- Deliberately NOT unique: duplicates are surfaced for human review, never silently merged.
CREATE INDEX partners_normalized_name_idx ON partners (normalized_name);
CREATE INDEX partners_website_domain_idx ON partners (website_domain) WHERE website_domain IS NOT NULL;
CREATE INDEX partners_industry_idx ON partners (industry_category_id);

CREATE TABLE contacts (
  contact_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES partners (partner_id) ON DELETE RESTRICT,
  name                text NOT NULL CHECK (length(btrim(name)) > 0),
  title               text,
  email               text CHECK (email = lower(btrim(email))),
  phone               text,
  whatsapp_number     text,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
                        CHECK (verification_status IN ('UNVERIFIED','PENDING','VERIFIED','FAILED')),
  source_url          text CHECK (crm_url_ok(source_url)),
  source_tier         text NOT NULL DEFAULT 'UNVERIFIED'
                        CHECK (source_tier IN ('OFFICIAL','REFERRAL','RESEARCH','UNVERIFIED')),
  lawful_basis_note   text NOT NULL CHECK (length(btrim(lawful_basis_note)) >= 3),
  verified_at         timestamptz,
  verified_by         uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  do_not_contact      boolean NOT NULL DEFAULT false,
  dnc_reason          text,
  dnc_set_at          timestamptz,
  dnc_set_by          uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT contacts_verified_requires_evidence CHECK (
    verification_status <> 'VERIFIED'
    OR (verified_at IS NOT NULL AND verified_by IS NOT NULL
        AND (email IS NOT NULL OR phone IS NOT NULL OR whatsapp_number IS NOT NULL))
  ),
  CONSTRAINT contacts_dnc_requires_reason CHECK (
    NOT do_not_contact
    OR (length(btrim(coalesce(dnc_reason, ''))) >= 3 AND dnc_set_at IS NOT NULL AND dnc_set_by IS NOT NULL)
  )
);
CREATE INDEX contacts_partner_idx ON contacts (partner_id);
CREATE UNIQUE INDEX contacts_partner_email_key ON contacts (partner_id, email) WHERE email IS NOT NULL;

CREATE TABLE partnership_cycles (
  cycle_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid NOT NULL REFERENCES partners (partner_id) ON DELETE RESTRICT,
  cycle_number         integer NOT NULL CHECK (cycle_number >= 1),
  previous_cycle_id    uuid,
  sales_type           text NOT NULL CHECK (sales_type IN ('NEW','RE_RAISE')),
  sales_status         text NOT NULL CHECK (sales_status IN ('ACTIVE','INACTIVE')),
  approach_method      text NOT NULL CHECK (approach_method IN ('ACTIVE','PASSIVE')),
  essm_stage           text NOT NULL CHECK (essm_stage IN
                         ('PROSPECTING','SALES_PROCESS','CLOSE_DEAL','PARTNERSHIP_IMPLEMENTATION','POST_SURVEY')),
  partnership_status   text CHECK (partnership_status IN ('ACTIVE','BREAK','FINISH')),
  re_raise_decision    text CHECK (re_raise_decision IN ('YES','NO','PLANNING_TO')),
  re_raise_review_date date,
  project_support      text NOT NULL REFERENCES project_support_types (code) ON DELETE RESTRICT,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz,
  CONSTRAINT cycles_partner_number_key UNIQUE (partner_id, cycle_number),
  CONSTRAINT cycles_id_partner_key UNIQUE (cycle_id, partner_id),
  -- A re-raise link must point at an earlier cycle of the SAME partner (history is preserved).
  CONSTRAINT cycles_previous_same_partner FOREIGN KEY (previous_cycle_id, partner_id)
    REFERENCES partnership_cycles (cycle_id, partner_id) ON DELETE RESTRICT,
  CONSTRAINT cycles_previous_not_self CHECK (previous_cycle_id IS NULL OR previous_cycle_id <> cycle_id),
  CONSTRAINT cycles_previous_only_after_first CHECK (previous_cycle_id IS NULL OR cycle_number > 1),
  CONSTRAINT cycles_closed_after_opened CHECK (closed_at IS NULL OR closed_at >= opened_at),
  CONSTRAINT cycles_planning_to_needs_review_date CHECK (
    re_raise_decision IS DISTINCT FROM 'PLANNING_TO' OR re_raise_review_date IS NOT NULL
  )
);
CREATE INDEX cycles_stage_idx ON partnership_cycles (essm_stage);

CREATE TABLE target_criteria (
  criteria_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_category_id uuid REFERENCES industry_categories (category_id) ON DELETE RESTRICT,
  project_support      text NOT NULL REFERENCES project_support_types (code) ON DELETE RESTRICT,
  criteria_text        text NOT NULL CHECK (length(btrim(criteria_text)) > 0),
  min_fit_score        numeric(5,2) NOT NULL DEFAULT 0 CHECK (min_fit_score >= 0),
  version              integer NOT NULL CHECK (version >= 1),
  active               boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX target_criteria_version_key ON target_criteria (
  coalesce(industry_category_id, '00000000-0000-0000-0000-000000000000'::uuid), project_support, version
);

CREATE TABLE market_research (
  research_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id            uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  values_score        smallint NOT NULL CHECK (values_score BETWEEN 1 AND 5),
  vision_score        smallint NOT NULL CHECK (vision_score BETWEEN 1 AND 5),
  current_focus_score smallint NOT NULL CHECK (current_focus_score BETWEEN 1 AND 5),
  program_score       smallint NOT NULL CHECK (program_score BETWEEN 1 AND 5),
  proceed_decision    boolean NOT NULL,
  evidence_urls       text[] NOT NULL CHECK (cardinality(evidence_urls) >= 1 AND crm_urls_ok(evidence_urls)),
  -- Separate prospect-prioritisation signal; never an ESSM alignment score.
  ai_fit_score        numeric(5,2) CHECK (ai_fit_score >= 0),
  verified_by         uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  research_date       date NOT NULL
);
CREATE INDEX market_research_cycle_idx ON market_research (cycle_id);

CREATE TABLE prospecting_records (
  record_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  criteria_id     uuid NOT NULL REFERENCES target_criteria (criteria_id) ON DELETE RESTRICT,
  fit_score       numeric(5,2) NOT NULL CHECK (fit_score >= 0),
  fit_rationale   text NOT NULL CHECK (length(btrim(fit_rationale)) > 0),
  insight_summary text NOT NULL CHECK (length(btrim(insight_summary)) > 0),
  source_urls     text[] NOT NULL CHECK (cardinality(source_urls) >= 1 AND crm_urls_ok(source_urls)),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prospecting_records_cycle_idx ON prospecting_records (cycle_id);
CREATE INDEX prospecting_records_criteria_idx ON prospecting_records (criteria_id);
`,
  down: `
DROP TABLE prospecting_records;
DROP TABLE market_research;
DROP TABLE target_criteria;
DROP TABLE partnership_cycles;
DROP TABLE contacts;
DROP TABLE partners;
DROP TABLE project_support_types;
DROP TABLE industry_categories;
DROP TABLE users;
DROP FUNCTION crm_urls_ok(text[]);
DROP FUNCTION crm_url_ok(text);
`,
};
