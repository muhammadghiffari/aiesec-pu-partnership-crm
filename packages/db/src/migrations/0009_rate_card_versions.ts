import type { Migration } from "./types";

/**
 * M3-01: versioned Rate Card guarantees.
 *
 * Editing happens only in a DRAFT version. Activating a version freezes it; activating the
 * next version retires it. ACTIVE and RETIRED versions (and everything under them: items,
 * packages, package benefits) are immutable, so history can never be rewritten, even by a
 * direct SQL edit. Proposals already snapshot their own name/unit/value (M1-01), so changing
 * a draft never affects an existing proposal.
 *
 * Q-01 (docs/DECISIONS.md): the ESSM Rate Card assessment formula is unconfirmed, so derived
 * monetize_quality / monetize_value must stay NULL. A later migration drops this constraint
 * when the formula is confirmed against the live workbook.
 *
 * Backfill: existing rows get value_status 'PROPOSED' (never silently 'CONFIRMED').
 * Rollback drops everything added here.
 */
export const migration0009: Migration = {
  version: 9,
  name: "rate_card_versions",
  up: `
ALTER TABLE rate_card_items
  ADD COLUMN value_status text NOT NULL DEFAULT 'PROPOSED' CHECK (value_status IN ('PROPOSED','CONFIRMED')),
  ADD COLUMN confirmed_by uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  ADD COLUMN confirmed_at timestamptz,
  -- Confirmer, time and CONFIRMED status all agree: no half-recorded confirmation.
  ADD CONSTRAINT rate_card_items_confirmed_complete CHECK (
    (confirmed_by IS NULL) = (confirmed_at IS NULL)
    AND (value_status = 'CONFIRMED') = (confirmed_by IS NOT NULL)
  );

-- One editable draft per catalog name.
CREATE UNIQUE INDEX rate_cards_one_draft_key ON rate_cards (name) WHERE status = 'DRAFT';

ALTER TABLE rate_card_assessments
  ADD CONSTRAINT rate_card_assessments_formula_unconfirmed CHECK (monetize_quality IS NULL AND monetize_value IS NULL);

CREATE FUNCTION rate_cards_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'only a draft rate card version can be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a rate card version starts as DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.version <> coalesce((SELECT max(version) FROM rate_cards WHERE name = NEW.name), 0) + 1 THEN
      RAISE EXCEPTION 'rate card versions are consecutive per name' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'RETIRED' THEN
      RAISE EXCEPTION 'a draft must be activated before it can be retired' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'name and version of a rate card are fixed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'ACTIVE' AND EXISTS (
      SELECT 1 FROM rate_cards o
       WHERE o.name = NEW.name AND o.rate_card_id <> NEW.rate_card_id AND o.status IN ('ACTIVE','RETIRED')
         AND daterange(o.effective_from, coalesce(o.effective_to, 'infinity'::date), '[]')
             && daterange(NEW.effective_from, coalesce(NEW.effective_to, 'infinity'::date), '[]')
    ) THEN
      RAISE EXCEPTION 'effective dates overlap another active or retired version' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM rate_card_items WHERE rate_card_id = NEW.rate_card_id) THEN
      RAISE EXCEPTION 'cannot activate a rate card without items' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'ACTIVE' THEN
    -- Frozen: the only change allowed is retirement, which may set the end date.
    IF NEW.status <> 'RETIRED' THEN
      RAISE EXCEPTION 'an active rate card version is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'an active rate card version is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.effective_to IS NULL OR NEW.effective_to < NEW.effective_from THEN
      RAISE EXCEPTION 'retirement needs an end date on or after the start date' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'a retired rate card version is immutable' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER rate_cards_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON rate_cards
  FOR EACH ROW EXECUTE FUNCTION rate_cards_guard();

-- Everything under a version is editable only while that version is a DRAFT.
CREATE FUNCTION rate_card_children_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  card_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.rate_card_id; ELSE target := NEW.rate_card_id; END IF;
  SELECT status INTO card_status FROM rate_cards WHERE rate_card_id = target;
  IF card_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'historic rate card versions are immutable: create a new draft version' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.rate_card_id IS DISTINCT FROM OLD.rate_card_id THEN
    RAISE EXCEPTION 'an item cannot move between rate card versions' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rate_card_items_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON rate_card_items
  FOR EACH ROW EXECUTE FUNCTION rate_card_children_guard();
CREATE TRIGGER rate_card_packages_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON rate_card_packages
  FOR EACH ROW EXECUTE FUNCTION rate_card_children_guard();
CREATE TRIGGER rate_card_package_benefits_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON rate_card_package_benefits
  FOR EACH ROW EXECUTE FUNCTION rate_card_children_guard();
`,
  down: `
DROP TRIGGER rate_card_package_benefits_guard_trg ON rate_card_package_benefits;
DROP TRIGGER rate_card_packages_guard_trg ON rate_card_packages;
DROP TRIGGER rate_card_items_guard_trg ON rate_card_items;
DROP FUNCTION rate_card_children_guard();
DROP TRIGGER rate_cards_guard_trg ON rate_cards;
DROP FUNCTION rate_cards_guard();
ALTER TABLE rate_card_assessments DROP CONSTRAINT rate_card_assessments_formula_unconfirmed;
DROP INDEX rate_cards_one_draft_key;
ALTER TABLE rate_card_items
  DROP CONSTRAINT rate_card_items_confirmed_complete,
  DROP COLUMN confirmed_at,
  DROP COLUMN confirmed_by,
  DROP COLUMN value_status;
`,
};
