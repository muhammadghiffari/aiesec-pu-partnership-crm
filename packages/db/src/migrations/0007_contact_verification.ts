import type { Migration } from "./types";

/**
 * M2-02: contact verification and enrichment boundary.
 *
 * - contact_candidates: a possible PIC/channel found by an enrichment provider or entered by
 *   hand. NOT a contact. Promoted to contacts + contact_channels only by a human.
 * - contact_channels: one reachable address per row (email, WhatsApp, phone, LinkedIn) with its
 *   own source/provenance and verification. A contact being verified (identity) and a channel
 *   being verified (this exact address reaches that person) are separate facts.
 *
 * The address of a channel is immutable: a changed address is a new, unverified row, so a
 * verification can never silently carry over to a different recipient.
 */
export const migration0007: Migration = {
  version: 7,
  name: "contact_verification",
  up: `
CREATE TABLE contact_channels (
  channel_id          uuid PRIMARY KEY,
  contact_id          uuid NOT NULL REFERENCES contacts (contact_id) ON DELETE RESTRICT,
  channel             text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','PHONE','LINKEDIN')),
  address             text NOT NULL CHECK (length(address) BETWEEN 3 AND 320),
  source_url          text CHECK (crm_url_ok(source_url)),
  source_tier         text NOT NULL CHECK (source_tier IN ('OFFICIAL','REFERRAL','RESEARCH','UNVERIFIED')),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','FAILED')),
  verification_method text CHECK (verification_method IN
                        ('OFFICIAL_WEBSITE','PARTNER_CONFIRMED','DIRECT_REFERRAL','PUBLIC_PROFILE_MATCH')),
  evidence_url        text CHECK (crm_url_ok(evidence_url)),
  verified_by         uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  verified_at         timestamptz,
  created_at          timestamptz NOT NULL,
  CONSTRAINT contact_channels_unique_address UNIQUE (contact_id, channel, address),
  CONSTRAINT contact_channels_email_shape CHECK (
    channel <> 'EMAIL' OR (address = lower(address) AND address ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
  ),
  CONSTRAINT contact_channels_phone_shape CHECK (channel NOT IN ('WHATSAPP','PHONE') OR address ~ '^\\+[1-9][0-9]{7,14}$'),
  CONSTRAINT contact_channels_linkedin_shape CHECK (
    channel <> 'LINKEDIN' OR address ~ '^https://www\\.linkedin\\.com/in/[A-Za-z0-9_-]{3,100}$'
  ),
  CONSTRAINT contact_channels_verified_complete CHECK (
    verification_status <> 'VERIFIED'
    OR (verification_method IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL
        AND (verification_method IN ('PARTNER_CONFIRMED','DIRECT_REFERRAL') OR evidence_url IS NOT NULL))
  ),
  CONSTRAINT contact_channels_unverified_clean CHECK (
    verification_status <> 'UNVERIFIED'
    OR (verification_method IS NULL AND verified_by IS NULL AND verified_at IS NULL)
  )
);
CREATE INDEX contact_channels_contact_idx ON contact_channels (contact_id);

CREATE FUNCTION contact_channels_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.address IS DISTINCT FROM OLD.address OR NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN
    RAISE EXCEPTION 'a channel address is immutable; add a new channel instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contact_channels_guard_trg BEFORE UPDATE ON contact_channels
  FOR EACH ROW EXECUTE FUNCTION contact_channels_guard();

CREATE TABLE contact_candidates (
  candidate_id        uuid PRIMARY KEY,
  partner_id          uuid NOT NULL REFERENCES partners (partner_id) ON DELETE RESTRICT,
  name                text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 200),
  title               text CHECK (length(title) <= 120),
  channel             text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','PHONE','LINKEDIN')),
  address             text NOT NULL CHECK (length(address) BETWEEN 3 AND 320),
  -- Provenance is mandatory: where this candidate was seen, and through which provider.
  source_url          text NOT NULL CHECK (crm_url_ok(source_url)),
  source_tier         text NOT NULL CHECK (source_tier IN ('OFFICIAL','REFERRAL','RESEARCH','UNVERIFIED')),
  provider            text NOT NULL CHECK (provider ~ '^[A-Z][A-Z0-9_]{1,30}$'),
  retrieved_at        timestamptz NOT NULL,
  requested_by        uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  -- Email domain differs from the partner's website domain: a review hint, never a block.
  off_domain          boolean NOT NULL DEFAULT false,
  review_status       text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','ACCEPTED','REJECTED')),
  reviewed_by         uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  reviewed_at         timestamptz,
  review_reason       text,
  accepted_contact_id uuid REFERENCES contacts (contact_id) ON DELETE RESTRICT,
  CONSTRAINT contact_candidates_pending_clean CHECK (
    review_status <> 'PENDING' OR (reviewed_by IS NULL AND reviewed_at IS NULL AND accepted_contact_id IS NULL)
  ),
  CONSTRAINT contact_candidates_accepted_complete CHECK (
    review_status <> 'ACCEPTED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND accepted_contact_id IS NOT NULL)
  ),
  CONSTRAINT contact_candidates_rejected_reason CHECK (
    review_status <> 'REJECTED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND accepted_contact_id IS NULL
        AND length(btrim(coalesce(review_reason, ''))) >= 3)
  )
);
CREATE UNIQUE INDEX contact_candidates_pending_key ON contact_candidates (partner_id, channel, lower(address))
  WHERE review_status = 'PENDING';
`,
  down: `
DROP TABLE contact_candidates;
DROP TABLE contact_channels;
DROP FUNCTION contact_channels_guard();
`,
};
