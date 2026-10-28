import type { Migration } from "./types";

/**
 * Class Diagram classes: OutreachMessage, RateCard, RateCardItem, RateCardPackage,
 * RateCardPackageBenefit, Proposal, ProposalBenefit, Meeting, MoM, MeetingAttendee, LoA
 * (+ BenefitCategory lookup).
 *
 * Defence in depth: gates that PRD/DATA_MODEL say must not rely on UI or services alone are
 * also enforced here (approval invalidation, DNC, verified recipient, LoA separation of duties).
 * The domain services in @crm/core remain the primary enforcement and own the error messages.
 */
export const migration0002: Migration = {
  version: 2,
  name: "sales_close_deal",
  up: `
CREATE TABLE benefit_categories (
  code   text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  label  text NOT NULL UNIQUE CHECK (length(btrim(label)) > 0),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE rate_cards (
  rate_card_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(btrim(name)) > 0),
  version        integer NOT NULL CHECK (version >= 1),
  currency       char(3) NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  effective_from date NOT NULL,
  effective_to   date,
  owner_id       uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  CONSTRAINT rate_cards_name_version_key UNIQUE (name, version),
  CONSTRAINT rate_cards_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
-- At most one ACTIVE version per catalog name.
CREATE UNIQUE INDEX rate_cards_one_active_key ON rate_cards (name) WHERE status = 'ACTIVE';

CREATE TABLE rate_card_items (
  rate_card_item_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id         uuid NOT NULL REFERENCES rate_cards (rate_card_id) ON DELETE RESTRICT,
  category             text NOT NULL REFERENCES benefit_categories (code) ON DELETE RESTRICT,
  benefit_name         text NOT NULL CHECK (length(btrim(benefit_name)) > 0),
  monetized_unit_value bigint NOT NULL CHECK (monetized_unit_value >= 0),
  unit                 text NOT NULL CHECK (length(btrim(unit)) > 0),
  active               boolean NOT NULL DEFAULT true,
  CONSTRAINT rate_card_items_unique_benefit UNIQUE (rate_card_id, category, benefit_name),
  CONSTRAINT rate_card_items_id_card_key UNIQUE (rate_card_item_id, rate_card_id)
);

CREATE TABLE rate_card_packages (
  package_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id  uuid NOT NULL REFERENCES rate_cards (rate_card_id) ON DELETE RESTRICT,
  package_name  text NOT NULL CHECK (length(btrim(package_name)) > 0),
  listed_price  bigint NOT NULL CHECK (listed_price >= 0),
  slot_limits   text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  CONSTRAINT rate_card_packages_unique_name UNIQUE (rate_card_id, package_name),
  CONSTRAINT rate_card_packages_id_card_key UNIQUE (package_id, rate_card_id)
);

CREATE TABLE rate_card_package_benefits (
  package_benefit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         uuid NOT NULL,
  rate_card_item_id  uuid NOT NULL,
  rate_card_id       uuid NOT NULL,
  included_qty       integer NOT NULL CHECK (included_qty > 0),
  slot_limit         integer CHECK (slot_limit > 0),
  CONSTRAINT package_benefits_unique UNIQUE (package_id, rate_card_item_id),
  -- Package and benefit must belong to the SAME rate card version.
  CONSTRAINT package_benefits_package_fk FOREIGN KEY (package_id, rate_card_id)
    REFERENCES rate_card_packages (package_id, rate_card_id) ON DELETE RESTRICT,
  CONSTRAINT package_benefits_item_fk FOREIGN KEY (rate_card_item_id, rate_card_id)
    REFERENCES rate_card_items (rate_card_item_id, rate_card_id) ON DELETE RESTRICT
);

CREATE TABLE outreach_messages (
  message_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  contact_id            uuid NOT NULL REFERENCES contacts (contact_id) ON DELETE RESTRICT,
  draft_content         text NOT NULL CHECK (length(btrim(draft_content)) > 0),
  channel               text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','LINKEDIN')),
  status                text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','APPROVED','SENT','REPLIED','CANCELLED')),
  follow_up_attempt     smallint NOT NULL DEFAULT 0 CHECK (follow_up_attempt BETWEEN 0 AND 3),
  approved_by           uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  approved_at           timestamptz,
  -- SHA-256 over exact text + recipient + channel, computed by @crm/core (M2-04).
  approved_content_hash char(64) CHECK (approved_content_hash ~ '^[0-9a-f]{64}$'),
  sent_at               timestamptz,
  CONSTRAINT outreach_approval_complete CHECK (
    (status IN ('APPROVED','SENT','REPLIED'))
      = (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_content_hash IS NOT NULL)
    OR status = 'CANCELLED'
  ),
  -- Approval metadata is all-or-nothing: no half-recorded approval on any status.
  CONSTRAINT outreach_approval_all_or_none CHECK (
    (approved_by IS NULL) = (approved_at IS NULL) AND (approved_at IS NULL) = (approved_content_hash IS NULL)
  ),
  CONSTRAINT outreach_sent_has_timestamp CHECK (status NOT IN ('SENT','REPLIED') OR sent_at IS NOT NULL)
);
CREATE INDEX outreach_cycle_idx ON outreach_messages (cycle_id);
CREATE INDEX outreach_contact_idx ON outreach_messages (contact_id);

CREATE FUNCTION outreach_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c contacts%ROWTYPE;
  cycle_partner uuid;
  content_changed boolean := false;
  gate_applies boolean;
BEGIN
  SELECT * INTO c FROM contacts WHERE contact_id = NEW.contact_id;
  SELECT partner_id INTO cycle_partner FROM partnership_cycles WHERE cycle_id = NEW.cycle_id;
  IF c.partner_id IS DISTINCT FROM cycle_partner THEN
    RAISE EXCEPTION 'outreach contact does not belong to the cycle''s partner' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    content_changed := NEW.draft_content IS DISTINCT FROM OLD.draft_content
                    OR NEW.channel IS DISTINCT FROM OLD.channel
                    OR NEW.contact_id IS DISTINCT FROM OLD.contact_id;
    IF OLD.status IN ('SENT','REPLIED')
       AND (content_changed OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
            OR NEW.approved_content_hash IS DISTINCT FROM OLD.approved_content_hash) THEN
      RAISE EXCEPTION 'sent outreach content, recipient and channel are immutable' USING ERRCODE = 'check_violation';
    END IF;
    -- Any content/recipient/channel edit invalidates an existing approval (PRD section 6).
    IF OLD.status = 'APPROVED' AND content_changed AND NEW.status = 'APPROVED' THEN
      NEW.status := 'DRAFT';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.approved_content_hash := NULL;
    END IF;
  END IF;

  gate_applies := TG_OP = 'INSERT' OR content_changed
               OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('DRAFT','APPROVED','SENT'));
  IF gate_applies AND NEW.status <> 'CANCELLED' THEN
    IF c.do_not_contact THEN
      RAISE EXCEPTION 'contact is marked do-not-contact' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('APPROVED','SENT') AND c.verification_status <> 'VERIFIED' THEN
      RAISE EXCEPTION 'recipient must be verified before approval or send' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outreach_messages_guard_trg BEFORE INSERT OR UPDATE ON outreach_messages
  FOR EACH ROW EXECUTE FUNCTION outreach_messages_guard();

CREATE TABLE proposals (
  proposal_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id         uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  package_id       uuid REFERENCES rate_card_packages (package_id) ON DELETE RESTRICT,
  pricing_mode     text NOT NULL CHECK (pricing_mode IN ('PACKAGE','CUSTOM','HYBRID')),
  -- Calculated forecast snapshot (integer rupiah). NOT cash received (see revenue_records).
  calculated_value bigint NOT NULL CHECK (calculated_value >= 0),
  currency         char(3) NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  content_url      text CHECK (crm_url_ok(content_url)),
  status           text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','SUPERSEDED')),
  sent_at          timestamptz,
  CONSTRAINT proposals_id_cycle_key UNIQUE (proposal_id, cycle_id),
  CONSTRAINT proposals_mode_package CHECK (
    (pricing_mode = 'CUSTOM' AND package_id IS NULL) OR (pricing_mode IN ('PACKAGE','HYBRID') AND package_id IS NOT NULL)
  ),
  CONSTRAINT proposals_sent_has_timestamp CHECK (status NOT IN ('SENT','ACCEPTED','REJECTED') OR sent_at IS NOT NULL)
);
CREATE INDEX proposals_cycle_idx ON proposals (cycle_id);

CREATE TABLE proposal_benefits (
  proposal_benefit_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id                uuid NOT NULL REFERENCES proposals (proposal_id) ON DELETE RESTRICT,
  rate_card_item_id          uuid NOT NULL REFERENCES rate_card_items (rate_card_item_id) ON DELETE RESTRICT,
  quantity                   numeric(12,3) NOT NULL CHECK (quantity > 0),
  agreed_unit_value          bigint NOT NULL CHECK (agreed_unit_value >= 0),
  -- Stored snapshot of the calculator result (rounding rule owned by M3-02).
  line_total_value           bigint NOT NULL CHECK (line_total_value >= 0),
  contribution_type          text NOT NULL CHECK (contribution_type IN
                               ('FINANCIAL','IN_KIND','VOUCHER','SERVICE','CONTENT_EXCHANGE','HYBRID')),
  benefit_name_snapshot      text NOT NULL CHECK (length(btrim(benefit_name_snapshot)) > 0),
  unit_snapshot              text NOT NULL CHECK (length(btrim(unit_snapshot)) > 0),
  rate_card_version_snapshot integer NOT NULL CHECK (rate_card_version_snapshot >= 1),
  -- A benefit counts once per proposal: prevents package/custom double counting.
  CONSTRAINT proposal_benefits_once_per_proposal UNIQUE (proposal_id, rate_card_item_id)
);

CREATE TABLE meetings (
  meeting_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     uuid NOT NULL REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  scheduled_at timestamptz NOT NULL,
  meeting_no   integer NOT NULL CHECK (meeting_no >= 1),
  meeting_type text NOT NULL CHECK (meeting_type IN ('DISCOVERY','PROPOSAL','NEGOTIATION','FOLLOW_UP')),
  outcome      text,
  CONSTRAINT meetings_cycle_no_key UNIQUE (cycle_id, meeting_no)
);

CREATE TABLE mom (
  mom_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid NOT NULL UNIQUE REFERENCES meetings (meeting_id) ON DELETE RESTRICT,
  summary      text NOT NULL,
  action_items text NOT NULL DEFAULT '',
  decision     text NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PROCEED','FOLLOW_UP','DECLINED','PENDING')),
  document_url text CHECK (crm_url_ok(document_url)),
  status       text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINAL'))
);

CREATE TABLE meeting_attendees (
  attendance_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        uuid NOT NULL REFERENCES meetings (meeting_id) ON DELETE RESTRICT,
  participant_name  text NOT NULL CHECK (length(btrim(participant_name)) > 0),
  title_or_function text,
  present           boolean NOT NULL DEFAULT true,
  participant_type  text NOT NULL CHECK (participant_type IN ('AIESEC','PARTNER'))
);
CREATE INDEX meeting_attendees_meeting_idx ON meeting_attendees (meeting_id);

CREATE TABLE loas (
  loa_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      uuid NOT NULL,
  cycle_id         uuid NOT NULL,
  template_kind    text NOT NULL CHECK (template_kind IN ('MONETARY_VALUED','NON_MONETARY')),
  terms            text NOT NULL CHECK (length(btrim(terms)) > 0),
  status           text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','SIGNED','CANCELLED')),
  submitted_by     uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  approved_by      uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  approved_at      timestamptz,
  partner_signed_at timestamptz,
  aiesec_signed_at  timestamptz,
  document_url     text CHECK (crm_url_ok(document_url)),
  loa_year         smallint CHECK (loa_year BETWEEN 2000 AND 2100),
  loa_sequence     integer CHECK (loa_sequence >= 1),
  loa_number       text UNIQUE,
  CONSTRAINT loas_id_cycle_key UNIQUE (loa_id, cycle_id),
  -- Class Diagram draws PartnershipCycle 1 -> * LoA directly, in addition to Proposal 1 -> * LoA.
  CONSTRAINT loas_cycle_fk FOREIGN KEY (cycle_id) REFERENCES partnership_cycles (cycle_id) ON DELETE RESTRICT,
  CONSTRAINT loas_proposal_same_cycle FOREIGN KEY (proposal_id, cycle_id)
    REFERENCES proposals (proposal_id, cycle_id) ON DELETE RESTRICT,
  -- D-009: the submitter can never be the approver, independent of role.
  CONSTRAINT loas_no_self_approval CHECK (approved_by IS NULL OR approved_by <> submitted_by),
  CONSTRAINT loas_approval_pair CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CONSTRAINT loas_approved_states CHECK (status NOT IN ('APPROVED','SIGNED') OR approved_by IS NOT NULL),
  CONSTRAINT loas_signed_complete CHECK (
    status <> 'SIGNED'
    OR (partner_signed_at IS NOT NULL AND aiesec_signed_at IS NOT NULL AND document_url IS NOT NULL)
  ),
  CONSTRAINT loas_number_parts CHECK (
    (loa_year IS NULL) = (loa_sequence IS NULL) AND (loa_number IS NULL OR loa_year IS NOT NULL)
  ),
  CONSTRAINT loas_year_sequence_key UNIQUE (loa_year, loa_sequence)
);
CREATE INDEX loas_cycle_idx ON loas (cycle_id);

CREATE FUNCTION loas_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  approver users%ROWTYPE;
BEGIN
  IF NEW.approved_by IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    SELECT * INTO approver FROM users WHERE user_id = NEW.approved_by;
    IF approver.access_role <> 'CRM_LEAD' OR NOT approver.is_active THEN
      RAISE EXCEPTION 'LoA approver must be an active CRM Lead' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SIGNED' THEN
    IF NEW.status <> 'SIGNED' OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
       OR NEW.document_url IS DISTINCT FROM OLD.document_url OR NEW.loa_number IS DISTINCT FROM OLD.loa_number THEN
      RAISE EXCEPTION 'a signed LoA is immutable' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER loas_guard_trg BEFORE INSERT OR UPDATE ON loas
  FOR EACH ROW EXECUTE FUNCTION loas_guard();
`,
  down: `
DROP TABLE loas;
DROP FUNCTION loas_guard();
DROP TABLE meeting_attendees;
DROP TABLE mom;
DROP TABLE meetings;
DROP TABLE proposal_benefits;
DROP TABLE proposals;
DROP TABLE outreach_messages;
DROP FUNCTION outreach_messages_guard();
DROP TABLE rate_card_package_benefits;
DROP TABLE rate_card_packages;
DROP TABLE rate_card_items;
DROP TABLE rate_cards;
DROP TABLE benefit_categories;
`,
};
