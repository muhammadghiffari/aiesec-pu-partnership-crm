/** Integrity tests for migration 0009: version lifecycle and immutability of history. */

import { beforeAll, describe, expect, it } from "vitest";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  type Row,
  uniq,
  update,
} from "./test-support";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

const card = (name: string, version: number, extra: Row = {}) =>
  insert(f.db, "rate_cards", {
    name,
    version,
    effective_from: "2026-01-01",
    owner_id: f.leadA.user_id,
    ...extra,
  });
const item = (c: Row, extra: Row = {}) =>
  insert(f.db, "rate_card_items", {
    rate_card_id: c.rate_card_id,
    category: "BRANDING",
    benefit_name: uniq("Benefit"),
    monetized_unit_value: 100000,
    unit: "slot",
    ...extra,
  });
const setStatus = (c: Row, status: string, extra: Row = {}) =>
  update(f.db, "rate_cards", "rate_card_id", c.rate_card_id, { status, ...extra });

async function activeCard(name = uniq("Card"), extra: Row = {}): Promise<Row> {
  const c = await card(name, 1, extra);
  await item(c);
  return setStatus(c, "ACTIVE");
}

describe("version lifecycle", () => {
  it("a version starts as DRAFT and versions are consecutive per name", async () => {
    const name = uniq("Life");
    await expectDbError(card(name, 1, { status: "ACTIVE" }), "starts as DRAFT");
    await expectDbError(card(name, 2), "consecutive");
    await card(name, 1);
    await expectDbError(card(name, 3), "consecutive");
  });

  it("DRAFT -> ACTIVE needs items; a draft cannot be retired directly", async () => {
    const c = await card(uniq("Empty"), 1);
    await expectDbError(setStatus(c, "ACTIVE"), "without items");
    await item(c);
    await expectDbError(
      setStatus(c, "RETIRED", { effective_to: "2026-12-31" }),
      "must be activated",
    );
    expect((await setStatus(c, "ACTIVE")).status).toBe("ACTIVE");
  });

  it("name and version of a draft cannot be changed", async () => {
    const c = await card(uniq("Fixed"), 1);
    await expectDbError(
      update(f.db, "rate_cards", "rate_card_id", c.rate_card_id, { version: 2 }),
      "fixed",
    );
    await expectDbError(
      update(f.db, "rate_cards", "rate_card_id", c.rate_card_id, { name: "Renamed" }),
      "fixed",
    );
  });

  it("ACTIVE is frozen: only retirement with an end date is possible, and retired is final", async () => {
    const c = await activeCard();
    for (const set of [
      { currency: "USD" },
      { effective_from: "2026-02-01" },
      { owner_id: f.leadB.user_id },
      { effective_to: "2026-12-31" },
      { status: "DRAFT" },
    ]) {
      await expectDbError(
        update(f.db, "rate_cards", "rate_card_id", c.rate_card_id, set),
        "immutable",
      );
    }
    await expectDbError(setStatus(c, "RETIRED"), "needs an end date");
    await expectDbError(
      setStatus(c, "RETIRED", { effective_to: "2025-12-31" }),
      /end date|rate_cards_period/,
    );
    const retired = await setStatus(c, "RETIRED", { effective_to: "2026-12-31" });
    expect(retired.status).toBe("RETIRED");
    for (const set of [{ status: "ACTIVE" }, { effective_to: "2027-12-31" }, { currency: "USD" }]) {
      await expectDbError(
        update(f.db, "rate_cards", "rate_card_id", c.rate_card_id, set),
        "immutable",
      );
    }
  });

  it("only drafts can be deleted", async () => {
    const a = await activeCard();
    await expectDbError(
      f.db.query("DELETE FROM rate_cards WHERE rate_card_id = $1", [a.rate_card_id]),
      "only a draft",
    );
    const d = await card(uniq("Gone"), 1);
    await f.db.query("DELETE FROM rate_cards WHERE rate_card_id = $1", [d.rate_card_id]);
  });

  it("at most one DRAFT and one ACTIVE version per catalog name", async () => {
    const name = uniq("Single");
    const v1 = await card(name, 1);
    await item(v1);
    await setStatus(v1, "ACTIVE");
    const v2 = await card(name, 2, { effective_from: "2027-01-01" });
    await expectDbError(
      card(name, 3, { effective_from: "2028-01-01" }),
      "rate_cards_one_draft_key",
    );
    await item(v2);
    await expectDbError(setStatus(v2, "ACTIVE"), /overlap|rate_cards_one_active_key/);
  });

  it("activating the next version works once the previous one is retired with a non-overlapping window", async () => {
    const name = uniq("Chain");
    const v1 = await card(name, 1);
    await item(v1);
    await setStatus(v1, "ACTIVE");
    await setStatus(v1, "RETIRED", { effective_to: "2026-12-31" });
    const v2 = await card(name, 2, { effective_from: "2027-01-01" });
    await item(v2);
    expect((await setStatus(v2, "ACTIVE")).status).toBe("ACTIVE");
  });

  it("overlapping effective windows are refused", async () => {
    const name = uniq("Overlap");
    const v1 = await card(name, 1);
    await item(v1);
    await setStatus(v1, "ACTIVE");
    await setStatus(v1, "RETIRED", { effective_to: "2026-12-31" });
    const v2 = await card(name, 2, { effective_from: "2026-06-01" });
    await item(v2);
    await expectDbError(setStatus(v2, "ACTIVE"), "overlap");
  });
});

describe("everything under a version is editable only while it is a DRAFT", () => {
  it("items: add, edit and delete work in a draft", async () => {
    const c = await card(uniq("Draft"), 1);
    const i = await item(c);
    await update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
      monetized_unit_value: 120000,
    });
    await f.db.query("DELETE FROM rate_card_items WHERE rate_card_item_id = $1", [
      i.rate_card_item_id,
    ]);
  });

  it("items of an ACTIVE or RETIRED version cannot be added, edited, moved or deleted", async () => {
    const c = await activeCard();
    const { rows } = await f.db.query<Row>(
      "SELECT rate_card_item_id FROM rate_card_items WHERE rate_card_id = $1",
      [c.rate_card_id],
    );
    const itemId = (rows[0] as Row).rate_card_item_id;
    const attempt = async () => {
      await expectDbError(item(c), "historic rate card versions are immutable");
      await expectDbError(
        update(f.db, "rate_card_items", "rate_card_item_id", itemId, { monetized_unit_value: 1 }),
        "historic rate card versions",
      );
      await expectDbError(
        update(f.db, "rate_card_items", "rate_card_item_id", itemId, { active: false }),
        "historic rate card versions",
      );
      await expectDbError(
        f.db.query("DELETE FROM rate_card_items WHERE rate_card_item_id = $1", [itemId]),
        "historic rate card versions",
      );
    };
    await attempt();
    await setStatus(c, "RETIRED", { effective_to: "2026-12-31" });
    await attempt();
  });

  it("an item cannot be moved from a draft into another version", async () => {
    const a = await card(uniq("From"), 1);
    const b = await card(uniq("To"), 1);
    const i = await item(a);
    await expectDbError(
      update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
        rate_card_id: b.rate_card_id,
      }),
      /cannot move|rate_card_items_id_card/,
    );
  });

  it("packages and package benefits follow the same rule", async () => {
    const c = await card(uniq("Pkg"), 1);
    const i = await item(c);
    const pkg = await insert(f.db, "rate_card_packages", {
      rate_card_id: c.rate_card_id,
      package_name: uniq("Community"),
      listed_price: 500000,
    });
    const link = await insert(f.db, "rate_card_package_benefits", {
      package_id: pkg.package_id,
      rate_card_item_id: i.rate_card_item_id,
      rate_card_id: c.rate_card_id,
      included_qty: 2,
    });
    await setStatus(c, "ACTIVE");
    await expectDbError(
      update(f.db, "rate_card_packages", "package_id", pkg.package_id, { listed_price: 1 }),
      "historic rate card versions",
    );
    await expectDbError(
      insert(f.db, "rate_card_packages", {
        rate_card_id: c.rate_card_id,
        package_name: uniq("New"),
        listed_price: 1,
      }),
      "historic rate card versions",
    );
    await expectDbError(
      update(f.db, "rate_card_package_benefits", "package_benefit_id", link.package_benefit_id, {
        included_qty: 9,
      }),
      "historic rate card versions",
    );
    await expectDbError(
      f.db.query("DELETE FROM rate_card_package_benefits WHERE package_benefit_id = $1", [
        link.package_benefit_id,
      ]),
      "historic rate card versions",
    );
  });
});

describe("value confirmation and the unresolved formula", () => {
  it("values default to PROPOSED; CONFIRMED needs who and when together", async () => {
    const c = await card(uniq("Conf"), 1);
    const i = await item(c);
    expect(i.value_status).toBe("PROPOSED");
    await expectDbError(
      update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
        value_status: "CONFIRMED",
      }),
      "rate_card_items_confirmed_complete",
    );
    await expectDbError(
      update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
        confirmed_by: f.leadA.user_id,
      }),
      "rate_card_items_confirmed_complete",
    );
    const ok = await update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
      value_status: "CONFIRMED",
      confirmed_by: f.leadA.user_id,
      confirmed_at: "2026-10-29T03:00:00Z",
    });
    expect(ok.value_status).toBe("CONFIRMED");
    await expectDbError(
      update(f.db, "rate_card_items", "rate_card_item_id", i.rate_card_item_id, {
        value_status: "OFFICIAL",
      }),
      /value_status|rate_card_items_confirmed_complete/,
    );
  });

  it("derived assessment values must stay NULL until the ESSM formula is confirmed (Q-01)", async () => {
    const p = await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 1,
    });
    const line = await insert(f.db, "proposal_benefits", {
      proposal_id: p.proposal_id,
      rate_card_item_id: f.item.rate_card_item_id,
      quantity: 1,
      agreed_unit_value: 1,
      line_total_value: 1,
      contribution_type: "SERVICE",
      benefit_name_snapshot: "Logo placement",
      unit_snapshot: "slot",
      rate_card_version_snapshot: 1,
    });
    const scores = {
      proposal_benefit_id: line.proposal_benefit_id,
      retention_rate_score: 3,
      event_size_score: 3,
      event_scale_score: 3,
      partnership_quality_score: 3,
      partnership_duration_score: 3,
      sdg_alignment_score: 3,
      leadership_value_alignment_score: 3,
      partnership_retained_score: 3,
      historical_score: 3,
      communication_score: 3,
    };
    await expectDbError(
      insert(f.db, "rate_card_assessments", { ...scores, monetize_quality: 3.0 }),
      "rate_card_assessments_formula_unconfirmed",
    );
    await expectDbError(
      insert(f.db, "rate_card_assessments", { ...scores, monetize_value: 1.0 }),
      "rate_card_assessments_formula_unconfirmed",
    );
    const ok = await insert(f.db, "rate_card_assessments", scores);
    expect([ok.monetize_quality, ok.monetize_value]).toEqual([null, null]);
  });
});

describe("history in practice", () => {
  it("a proposal line keeps its snapshot while the catalog moves to a new version with a different value", async () => {
    const p = await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 500000,
    });
    const line = await insert(f.db, "proposal_benefits", {
      proposal_id: p.proposal_id,
      rate_card_item_id: f.item.rate_card_item_id,
      quantity: 1,
      agreed_unit_value: 500000,
      line_total_value: 500000,
      contribution_type: "FINANCIAL",
      benefit_name_snapshot: "Logo placement",
      unit_snapshot: "slot",
      rate_card_version_snapshot: 1,
    });
    // Move the fixture catalog (v1) to v2 with a new price.
    await setStatus(f.card, "RETIRED", { effective_to: "2026-12-31" });
    const v2 = await card(String(f.card.name), 2, { effective_from: "2027-01-01" });
    await item(v2, { benefit_name: "Logo placement", monetized_unit_value: 900000 });
    await setStatus(v2, "ACTIVE");

    const { rows } = await f.db.query<Row>(
      "SELECT agreed_unit_value, line_total_value, rate_card_version_snapshot FROM proposal_benefits WHERE proposal_benefit_id = $1",
      [line.proposal_benefit_id],
    );
    expect(rows[0]).toEqual({
      agreed_unit_value: 500000,
      line_total_value: 500000,
      rate_card_version_snapshot: 1,
    });
    const old = await f.db.query<Row>(
      "SELECT monetized_unit_value FROM rate_card_items WHERE rate_card_item_id = $1",
      [f.item.rate_card_item_id],
    );
    expect((old.rows[0] as Row).monetized_unit_value).toBe(500000); // v1 item is exactly as it was
  });
});
