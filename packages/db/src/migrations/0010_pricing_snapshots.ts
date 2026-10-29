import type { Migration } from "./types";

/**
 * M3-02: packages, proposal lines and pricing snapshots.
 *
 * Because ACTIVE/RETIRED rate card versions are immutable (migration 0009), a proposal line
 * that references a catalog item and records its version is already a durable snapshot. This
 * migration makes the database PROVE that the snapshot equals the catalog, and freezes a
 * proposal once it leaves DRAFT:
 *
 * - lines may only reference items of a frozen (ACTIVE/RETIRED) version, never a DRAFT;
 * - name, unit and version snapshots must equal the catalog row; the catalog unit value at
 *   proposal time is stored next to the agreed value, so a negotiated override is visible;
 * - the line total follows the single rounding rule (docs/DECISIONS.md Q-33): quantity (3 dp)
 *   x agreed unit value, rounded half up to whole rupiah, in integer arithmetic;
 * - `source` says whether a line comes from the selected package or was added as custom, and a
 *   PACKAGE line must be a benefit of the proposal's package from the same version;
 * - a proposal is created as DRAFT; leaving DRAFT needs at least one line and a stored total that
 *   equals package price + custom lines (package lines are included in the package price and
 *   never added again); all lines share the proposal currency and one catalog version;
 * - a proposal that is no longer a DRAFT cannot change its lines, mode, package, value or
 *   currency.
 *
 * Backfill: `source` defaults to 'CUSTOM' and the catalog snapshot to NULL for rows that exist
 * before this migration (none in the initial schema). Rollback drops everything added here.
 */
export const migration0010: Migration = {
  version: 10,
  name: "pricing_snapshots",
  up: `
ALTER TABLE proposal_benefits
  ADD COLUMN source text NOT NULL DEFAULT 'CUSTOM' CHECK (source IN ('PACKAGE','CUSTOM')),
  ADD COLUMN catalog_unit_value_snapshot bigint CHECK (catalog_unit_value_snapshot >= 0),
  -- Single rounding rule (Q-33): round half up to whole rupiah, integer arithmetic only.
  ADD CONSTRAINT proposal_benefits_line_total_rule CHECK (
    line_total_value = (((quantity * 1000)::bigint * agreed_unit_value) + 500) / 1000
  );

CREATE FUNCTION proposal_benefits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prop proposals%ROWTYPE;
  item rate_card_items%ROWTYPE;
  card rate_cards%ROWTYPE;
  target uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.proposal_id; ELSE target := NEW.proposal_id; END IF;
  SELECT * INTO prop FROM proposals WHERE proposal_id = target;
  IF prop.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'proposal lines are frozen once the proposal leaves DRAFT' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  SELECT * INTO item FROM rate_card_items WHERE rate_card_item_id = NEW.rate_card_item_id;
  SELECT * INTO card FROM rate_cards WHERE rate_card_id = item.rate_card_id;
  IF card.status = 'DRAFT' THEN
    RAISE EXCEPTION 'proposal lines must use an ACTIVE or RETIRED rate card version, not a draft' USING ERRCODE = 'check_violation';
  END IF;
  IF card.currency <> prop.currency THEN
    RAISE EXCEPTION 'proposal and rate card currencies differ' USING ERRCODE = 'check_violation';
  END IF;
  -- One proposal prices from ONE catalog version.
  IF EXISTS (
    SELECT 1 FROM proposal_benefits o JOIN rate_card_items oi ON oi.rate_card_item_id = o.rate_card_item_id
     WHERE o.proposal_id = NEW.proposal_id AND o.proposal_benefit_id <> NEW.proposal_benefit_id
       AND oi.rate_card_id <> item.rate_card_id
  ) THEN
    RAISE EXCEPTION 'all lines of a proposal must come from the same rate card version' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.benefit_name_snapshot <> item.benefit_name OR NEW.unit_snapshot <> item.unit
     OR NEW.rate_card_version_snapshot <> card.version THEN
    RAISE EXCEPTION 'proposal line snapshot does not match the catalog' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.catalog_unit_value_snapshot IS NOT NULL AND NEW.catalog_unit_value_snapshot <> item.monetized_unit_value THEN
    RAISE EXCEPTION 'proposal line catalog value snapshot does not match the catalog' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source = 'PACKAGE' THEN
    IF prop.package_id IS NULL OR prop.pricing_mode = 'CUSTOM' THEN
      RAISE EXCEPTION 'a PACKAGE line needs a proposal with a package' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM rate_card_package_benefits b
       WHERE b.package_id = prop.package_id AND b.rate_card_item_id = NEW.rate_card_item_id
    ) THEN
      RAISE EXCEPTION 'a PACKAGE line must be a benefit of the proposal''s package' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF prop.pricing_mode = 'PACKAGE' THEN
    RAISE EXCEPTION 'a package proposal has package lines only' USING ERRCODE = 'check_violation';
  ELSIF prop.package_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM rate_card_package_benefits b
     WHERE b.package_id = prop.package_id AND b.rate_card_item_id = NEW.rate_card_item_id
  ) THEN
    RAISE EXCEPTION 'benefit is already included by the package: it would be counted twice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proposal_benefits_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON proposal_benefits
  FOR EACH ROW EXECUTE FUNCTION proposal_benefits_guard();

CREATE FUNCTION proposals_freeze_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pkg_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a sent proposal cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'a proposal is created as DRAFT; lines are added before it is sent' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status <> 'DRAFT' THEN
    IF NOT EXISTS (SELECT 1 FROM proposal_benefits WHERE proposal_id = NEW.proposal_id) THEN
      RAISE EXCEPTION 'a proposal needs at least one line before it is sent' USING ERRCODE = 'check_violation';
    END IF;
    -- The stored total must be exactly package price + custom lines (package lines are included
    -- in the package price and never added again).
    IF NEW.calculated_value <> coalesce((SELECT listed_price FROM rate_card_packages WHERE package_id = NEW.package_id), 0)
         + coalesce((SELECT sum(line_total_value) FROM proposal_benefits WHERE proposal_id = NEW.proposal_id AND source = 'CUSTOM'), 0) THEN
      RAISE EXCEPTION 'proposal total does not equal package price plus custom lines' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.package_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.package_id IS DISTINCT FROM OLD.package_id) THEN
    SELECT c.status INTO pkg_status FROM rate_card_packages p JOIN rate_cards c ON c.rate_card_id = p.rate_card_id
     WHERE p.package_id = NEW.package_id;
    IF pkg_status = 'DRAFT' THEN
      RAISE EXCEPTION 'a proposal cannot use a package of a draft rate card version' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' THEN
    IF NEW.pricing_mode IS DISTINCT FROM OLD.pricing_mode OR NEW.package_id IS DISTINCT FROM OLD.package_id
       OR NEW.calculated_value IS DISTINCT FROM OLD.calculated_value OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
       OR NEW.content_url IS DISTINCT FROM OLD.content_url THEN
      RAISE EXCEPTION 'a sent proposal is immutable; create a new proposal' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('ACCEPTED','REJECTED','SUPERSEDED') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'a closed proposal cannot change status' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER proposals_freeze_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON proposals
  FOR EACH ROW EXECUTE FUNCTION proposals_freeze_guard();
`,
  down: `
DROP TRIGGER proposals_freeze_guard_trg ON proposals;
DROP FUNCTION proposals_freeze_guard();
DROP TRIGGER proposal_benefits_guard_trg ON proposal_benefits;
DROP FUNCTION proposal_benefits_guard();
ALTER TABLE proposal_benefits
  DROP CONSTRAINT proposal_benefits_line_total_rule,
  DROP COLUMN catalog_unit_value_snapshot,
  DROP COLUMN source;
`,
};
