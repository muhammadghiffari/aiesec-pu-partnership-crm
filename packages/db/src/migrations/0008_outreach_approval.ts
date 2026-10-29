import { migration0002 } from "./0002_sales_close_deal";
import type { Migration } from "./types";

/**
 * M2-04: bind outreach approval to the exact text, recipient and channel.
 *
 * - outreach_messages gains channel_id (the exact contact_channels row), subject, language and
 *   lint metadata.
 * - crm_outreach_approval_hash() recomputes the same canonical SHA-256 as
 *   packages/core/src/outreach/hash.ts.
 * - The guard trigger now also: clears an approval when subject or channel row change; on
 *   APPROVED/SENT requires a VERIFIED channel row of the same contact and channel type, an
 *   active non-viewer approver, and approved_content_hash equal to the recomputed hash.
 *
 * Backfill: existing rows keep channel_id NULL; they can stay DRAFT but cannot be approved or
 * sent until a channel row is set. Rollback restores the 0002 trigger function verbatim.
 */

const ORIGINAL_GUARD = (() => {
  const start = migration0002.up.indexOf("CREATE FUNCTION outreach_messages_guard()");
  const end = migration0002.up.indexOf("END $$;", start) + "END $$;".length;
  if (start < 0 || end < start) throw new Error("0002 outreach guard not found");
  return migration0002.up
    .slice(start, end)
    .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
})();

export const migration0008: Migration = {
  version: 8,
  name: "outreach_approval",
  up: `
ALTER TABLE outreach_messages
  ADD COLUMN channel_id uuid REFERENCES contact_channels (channel_id) ON DELETE RESTRICT,
  ADD COLUMN subject text CHECK (subject IS NULL OR length(subject) <= 150),
  ADD COLUMN language text NOT NULL DEFAULT 'id' CHECK (language IN ('id','en')),
  ADD COLUMN approved_lint_version smallint CHECK (approved_lint_version >= 1),
  ADD COLUMN draft_source text NOT NULL DEFAULT 'HUMAN' CHECK (draft_source IN ('HUMAN','AI')),
  ADD COLUMN ai_template text CHECK (ai_template ~ '^[a-z][a-z0-9_.]*@[0-9]+$'),
  ADD CONSTRAINT outreach_ai_template_iff_ai CHECK ((draft_source = 'AI') = (ai_template IS NOT NULL)),
  ADD CONSTRAINT outreach_lint_with_approval CHECK ((approved_lint_version IS NULL) = (approved_content_hash IS NULL));
CREATE INDEX outreach_channel_idx ON outreach_messages (channel_id);

CREATE FUNCTION crm_hash_field(name text, value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN value IS NULL THEN name || '=~' || chr(10)
                ELSE name || '=' || octet_length(convert_to(value, 'UTF8')) || ':' || value || chr(10) END
  $$;

CREATE FUNCTION crm_outreach_approval_hash(
  message_id uuid, cycle_id uuid, contact_id uuid, channel_id uuid,
  channel text, address text, subject text, body text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    'outreach-approval/v1' || chr(10) ||
    crm_hash_field('message', message_id::text) ||
    crm_hash_field('cycle', cycle_id::text) ||
    crm_hash_field('contact', contact_id::text) ||
    crm_hash_field('channel_id', channel_id::text) ||
    crm_hash_field('channel', channel) ||
    crm_hash_field('address', address) ||
    crm_hash_field('subject', subject) ||
    crm_hash_field('body', body), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION outreach_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c contacts%ROWTYPE;
  ch contact_channels%ROWTYPE;
  approver users%ROWTYPE;
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
                    OR NEW.subject IS DISTINCT FROM OLD.subject
                    OR NEW.channel IS DISTINCT FROM OLD.channel
                    OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
                    OR NEW.channel_id IS DISTINCT FROM OLD.channel_id;
    IF OLD.status IN ('SENT','REPLIED')
       AND (content_changed OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
            OR NEW.approved_content_hash IS DISTINCT FROM OLD.approved_content_hash
            OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
      RAISE EXCEPTION 'sent outreach content, recipient and channel are immutable' USING ERRCODE = 'check_violation';
    END IF;
    -- Any content/recipient/channel edit invalidates an existing approval (PRD section 6).
    IF OLD.status = 'APPROVED' AND content_changed AND NEW.status = 'APPROVED' THEN
      NEW.status := 'DRAFT';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.approved_content_hash := NULL;
      NEW.approved_lint_version := NULL;
    END IF;
  END IF;

  gate_applies := TG_OP = 'INSERT' OR content_changed
               OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('DRAFT','APPROVED','SENT'))
               OR NEW.approved_content_hash IS DISTINCT FROM OLD.approved_content_hash;
  IF gate_applies AND NEW.status <> 'CANCELLED' THEN
    IF c.do_not_contact THEN
      RAISE EXCEPTION 'contact is marked do-not-contact' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('APPROVED','SENT') THEN
      IF c.verification_status <> 'VERIFIED' THEN
        RAISE EXCEPTION 'recipient must be verified before approval or send' USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO ch FROM contact_channels WHERE channel_id = NEW.channel_id;
      IF ch.channel_id IS NULL OR ch.contact_id <> NEW.contact_id OR ch.channel <> NEW.channel THEN
        RAISE EXCEPTION 'approval requires a channel row of this contact and channel type' USING ERRCODE = 'check_violation';
      END IF;
      IF ch.verification_status <> 'VERIFIED' THEN
        RAISE EXCEPTION 'recipient channel must be verified before approval or send' USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO approver FROM users WHERE user_id = NEW.approved_by;
      IF approver.user_id IS NULL OR NOT approver.is_active OR approver.access_role = 'VIEWER' THEN
        RAISE EXCEPTION 'approver must be an active CRM Lead or BD staff user' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.approved_content_hash IS DISTINCT FROM crm_outreach_approval_hash(
           NEW.message_id, NEW.cycle_id, NEW.contact_id, NEW.channel_id,
           NEW.channel, ch.address, NEW.subject, NEW.draft_content) THEN
        RAISE EXCEPTION 'approved content hash does not match the message' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
`,
  down: `
${ORIGINAL_GUARD}
DROP FUNCTION crm_outreach_approval_hash(uuid, uuid, uuid, uuid, text, text, text, text);
DROP FUNCTION crm_hash_field(text, text);
DROP INDEX outreach_channel_idx;
ALTER TABLE outreach_messages
  DROP CONSTRAINT outreach_lint_with_approval,
  DROP CONSTRAINT outreach_ai_template_iff_ai,
  DROP COLUMN ai_template,
  DROP COLUMN draft_source,
  DROP COLUMN approved_lint_version,
  DROP COLUMN language,
  DROP COLUMN subject,
  DROP COLUMN channel_id;
`,
};
