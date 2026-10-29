/**
 * Integrity tests for migration 0010: proposal lines are proven snapshots of a frozen catalog
 * version, totals follow one rounding rule shared with the application, and sent proposals are
 * immutable.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { lineTotal, toThousandths } from "../../core/src/pricing/calc";
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

/** Build a frozen catalog: items + a package including some, then activate. */
async function frozenCatalog(
  values: Record<string, number> = { logo: 500000, post: 250000, booth: 1000000 },
) {
  const name = uniq("Pricing Card");
  const card = await insert(f.db, "rate_cards", {
    name,
    version: 1,
    effective_from: "2026-01-01",
    owner_id: f.leadA.user_id,
  });
  const mk = (benefit: string, value: number, unit: string) =>
    insert(f.db, "rate_card_items", {
      rate_card_id: card.rate_card_id,
      category: "BRANDING",
      benefit_name: benefit,
      monetized_unit_value: value,
      unit,
    });
  const logo = await mk("Logo", values.logo ?? 0, "slot");
  const post = await mk("Post", values.post ?? 0, "post");
  const booth = await mk("Booth", values.booth ?? 0, "booth");
  const pkg = await insert(f.db, "rate_card_packages", {
    rate_card_id: card.rate_card_id,
    package_name: "Community",
    listed_price: 600000,
  });
  await insert(f.db, "rate_card_package_benefits", {
    package_id: pkg.package_id,
    rate_card_item_id: logo.rate_card_item_id,
    rate_card_id: card.rate_card_id,
    included_qty: 1,
  });
  const active = await update(f.db, "rate_cards", "rate_card_id", card.rate_card_id, {
    status: "ACTIVE",
  });
  return { card: active, logo, post, booth, pkg };
}

const proposal = (extra: Row = {}) =>
  insert(f.db, "proposals", {
    cycle_id: f.cycle.cycle_id,
    pricing_mode: "CUSTOM",
    calculated_value: 0,
    ...extra,
  });
const line = (p: Row, item: Row, extra: Row = {}) =>
  insert(f.db, "proposal_benefits", {
    proposal_id: p.proposal_id,
    rate_card_item_id: item.rate_card_item_id,
    quantity: 2,
    agreed_unit_value: item.monetized_unit_value,
    line_total_value: Number(item.monetized_unit_value) * 2,
    contribution_type: "FINANCIAL",
    benefit_name_snapshot: item.benefit_name,
    unit_snapshot: item.unit,
    rate_card_version_snapshot: 1,
    catalog_unit_value_snapshot: item.monetized_unit_value,
    ...extra,
  });

describe("lines are proven snapshots of a frozen catalog version", () => {
  it("accepts a line that equals the catalog", async () => {
    const c = await frozenCatalog();
    const l = await line(await proposal(), c.booth);
    expect(l).toMatchObject({
      source: "CUSTOM",
      line_total_value: 2000000,
      catalog_unit_value_snapshot: 1000000,
    });
  });

  it("rejects a line that points at a DRAFT catalog version", async () => {
    const draft = await insert(f.db, "rate_cards", {
      name: uniq("Draft"),
      version: 1,
      effective_from: "2026-01-01",
      owner_id: f.leadA.user_id,
    });
    const item = await insert(f.db, "rate_card_items", {
      rate_card_id: draft.rate_card_id,
      category: "BRANDING",
      benefit_name: "Draft item",
      monetized_unit_value: 1,
      unit: "slot",
    });
    await expectDbError(line(await proposal(), item), "not a draft");
  });

  it("rejects a snapshot whose name, unit, version or catalog value differs from the catalog", async () => {
    const c = await frozenCatalog();
    const p = await proposal();
    await expectDbError(
      line(p, c.booth, { benefit_name_snapshot: "Cheaper name" }),
      "snapshot does not match",
    );
    await expectDbError(line(p, c.booth, { unit_snapshot: "stand" }), "snapshot does not match");
    await expectDbError(
      line(p, c.booth, { rate_card_version_snapshot: 7 }),
      "snapshot does not match",
    );
    await expectDbError(
      line(p, c.booth, { catalog_unit_value_snapshot: 1 }),
      "catalog value snapshot",
    );
  });

  it("allows a negotiated agreed value different from the catalog value, and keeps both", async () => {
    const c = await frozenCatalog();
    const l = await line(await proposal(), c.booth, {
      agreed_unit_value: 800000,
      line_total_value: 1600000,
    });
    expect([l.catalog_unit_value_snapshot, l.agreed_unit_value]).toEqual([1000000, 800000]);
  });

  it("all lines of a proposal come from one catalog version", async () => {
    const a = await frozenCatalog();
    const b = await frozenCatalog();
    const p = await proposal();
    await line(p, a.booth);
    await expectDbError(line(p, b.booth), "same rate card version");
  });

  it("a proposal and its catalog must share a currency", async () => {
    const c = await frozenCatalog();
    await expectDbError(line(await proposal({ currency: "USD" }), c.booth), "currencies differ");
  });
});

describe("single rounding rule shared with the application", () => {
  const cases: [string, number, number][] = [
    ["2", 1000000, 2000000],
    ["1.500", 333, 500],
    ["0.001", 1, 0],
    ["0.500", 1, 1],
    ["0.499", 1, 0],
    ["3.333", 100, 333],
    ["3.335", 100, 334],
    ["2.500", 400000, 1000000],
    ["10", 999999999999, 9999999999990],
  ];

  it.each(cases)("quantity %s x %s", async (qty, unit, expected) => {
    const c = await frozenCatalog();
    const p = await proposal();
    const ok = await line(p, c.booth, {
      quantity: qty,
      agreed_unit_value: unit,
      line_total_value: expected,
      catalog_unit_value_snapshot: c.booth.monetized_unit_value,
    });
    expect(Number(ok.line_total_value)).toBe(expected);
  });

  it("the application refuses (OVERFLOW) products beyond the exactly-representable range instead of rounding silently", () => {
    expect(() => lineTotal(10_000_000, 999_999_999_999)).toThrow(/OVERFLOW/);
  });

  it("rejects a total that is off by one rupiah either way", async () => {
    const c = await frozenCatalog();
    const p = await proposal();
    for (const total of [1999999, 2000001, 0]) {
      await expectDbError(
        line(p, c.booth, { line_total_value: total }),
        "proposal_benefits_line_total_rule",
      );
    }
  });

  it("the database and the application agree on every value in a sweep", async () => {
    const c = await frozenCatalog();
    let checked = 0;
    for (let q = 1; q <= 3000; q += 97) {
      for (const unit of [1, 7, 333, 12345, 999999]) {
        const thousandths = q;
        const qty = (thousandths / 1000).toFixed(3);
        expect(toThousandths(qty)).toBe(thousandths);
        const expected = lineTotal(thousandths, unit);
        const { rows } = await f.db.query<{ t: string }>(
          "SELECT ((( ($1::numeric * 1000)::bigint * $2::bigint) + 500) / 1000)::text AS t",
          [qty, unit],
        );
        expect(Number((rows[0] as { t: string }).t), `qty ${qty} x ${unit}`).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(c.card.status).toBe("ACTIVE");
  });
});

describe("package and custom lines never double count", () => {
  it("a PACKAGE line must be a benefit of the proposal's package from the same version", async () => {
    const c = await frozenCatalog();
    const p = await proposal({
      pricing_mode: "HYBRID",
      package_id: c.pkg.package_id,
      calculated_value: 600000,
    });
    await line(p, c.logo, { source: "PACKAGE", quantity: 1, line_total_value: 500000 });
    await expectDbError(line(p, c.post, { source: "PACKAGE" }), "benefit of the proposal");
  });

  it("a custom line for a benefit the package already includes is refused", async () => {
    const c = await frozenCatalog();
    const p = await proposal({
      pricing_mode: "HYBRID",
      package_id: c.pkg.package_id,
      calculated_value: 600000,
    });
    await expectDbError(line(p, c.logo), "counted twice");
    await line(p, c.booth); // a benefit outside the package is fine
  });

  it("a PACKAGE-mode proposal takes package lines only; a CUSTOM-mode proposal takes no package lines", async () => {
    const c = await frozenCatalog();
    const pkgMode = await proposal({
      pricing_mode: "PACKAGE",
      package_id: c.pkg.package_id,
      calculated_value: 600000,
    });
    await expectDbError(line(pkgMode, c.booth), "package proposal has package lines only");
    const customMode = await proposal();
    await expectDbError(
      line(customMode, c.logo, { source: "PACKAGE" }),
      "needs a proposal with a package",
    );
  });

  it("a proposal cannot use a package of a draft catalog version", async () => {
    const draft = await insert(f.db, "rate_cards", {
      name: uniq("D"),
      version: 1,
      effective_from: "2026-01-01",
      owner_id: f.leadA.user_id,
    });
    const pkg = await insert(f.db, "rate_card_packages", {
      rate_card_id: draft.rate_card_id,
      package_name: "P",
      listed_price: 1,
    });
    await expectDbError(
      proposal({ pricing_mode: "PACKAGE", package_id: pkg.package_id, calculated_value: 1 }),
      "draft rate card version",
    );
  });
});

describe("sending freezes a proposal", () => {
  async function ready() {
    const c = await frozenCatalog();
    const p = await proposal({
      pricing_mode: "HYBRID",
      package_id: c.pkg.package_id,
      calculated_value: 600000 + 2000000,
    });
    await line(p, c.logo, { source: "PACKAGE", quantity: 1, line_total_value: 500000 });
    await line(p, c.booth);
    return { c, p };
  }
  const send = (p: Row, extra: Row = {}) =>
    update(f.db, "proposals", "proposal_id", p.proposal_id, {
      status: "SENT",
      sent_at: "2026-10-29T05:00:00Z",
      ...extra,
    });

  it("a proposal is created as DRAFT and needs a line before it can be sent", async () => {
    await expectDbError(
      proposal({ status: "SENT", sent_at: "2026-10-29T05:00:00Z" }),
      "created as DRAFT",
    );
    await expectDbError(send(await proposal()), "at least one line");
  });

  it("the stored total must equal package price plus custom lines (package lines are not added again)", async () => {
    const { c, p } = await ready();
    const wrong = await proposal({
      pricing_mode: "HYBRID",
      package_id: c.pkg.package_id,
      calculated_value: 600000 + 500000 + 2000000,
    });
    await line(wrong, c.logo, { source: "PACKAGE", quantity: 1, line_total_value: 500000 });
    await line(wrong, c.booth);
    await expectDbError(send(wrong), "does not equal package price plus custom lines");
    expect((await send(p)).status).toBe("SENT");
  });

  it("after sending nothing can change: lines, header, value, package, currency, link", async () => {
    const { c, p } = await ready();
    await send(p, { content_url: "https://docs.example.invalid/p1" });
    const lineId = (
      await f.db.query<Row>(
        "SELECT proposal_benefit_id FROM proposal_benefits WHERE proposal_id = $1 LIMIT 1",
        [p.proposal_id],
      )
    ).rows[0]?.proposal_benefit_id;
    await expectDbError(
      update(f.db, "proposal_benefits", "proposal_benefit_id", lineId, {
        quantity: 9,
        line_total_value: 9000000,
      }),
      "frozen",
    );
    await expectDbError(
      f.db.query("DELETE FROM proposal_benefits WHERE proposal_benefit_id = $1", [lineId]),
      "frozen",
    );
    await expectDbError(line(p, c.post), "frozen");
    for (const set of [
      { calculated_value: 1 },
      { pricing_mode: "CUSTOM", package_id: null },
      { currency: "USD" },
      { content_url: "https://other.example.invalid/x" },
      { sent_at: "2026-10-30T00:00:00Z" },
    ]) {
      await expectDbError(
        update(f.db, "proposals", "proposal_id", p.proposal_id, set),
        "immutable",
      );
    }
    await expectDbError(
      f.db.query("DELETE FROM proposals WHERE proposal_id = $1", [p.proposal_id]),
      "cannot be deleted",
    );
  });

  it("a sent proposal can be marked accepted or rejected, but a closed one cannot change again", async () => {
    const { p } = await ready();
    await send(p);
    expect(
      (await update(f.db, "proposals", "proposal_id", p.proposal_id, { status: "ACCEPTED" }))
        .status,
    ).toBe("ACCEPTED");
    await expectDbError(
      update(f.db, "proposals", "proposal_id", p.proposal_id, { status: "REJECTED" }),
      "closed proposal",
    );
  });

  it("a draft can still be edited and deleted", async () => {
    const c = await frozenCatalog();
    const p = await proposal();
    const l = await line(p, c.booth);
    await update(f.db, "proposal_benefits", "proposal_benefit_id", l.proposal_benefit_id, {
      quantity: 3,
      line_total_value: 3000000,
    });
    await update(f.db, "proposals", "proposal_id", p.proposal_id, { calculated_value: 3000000 });
    await f.db.query("DELETE FROM proposal_benefits WHERE proposal_benefit_id = $1", [
      l.proposal_benefit_id,
    ]);
    await f.db.query("DELETE FROM proposals WHERE proposal_id = $1", [p.proposal_id]);
  });
});

describe("history", () => {
  it("a sent proposal keeps its numbers after its catalog version is retired and replaced", async () => {
    const c = await frozenCatalog();
    const p = await proposal({ calculated_value: 2000000 });
    const l = await line(p, c.booth);
    await update(f.db, "proposals", "proposal_id", p.proposal_id, {
      status: "SENT",
      sent_at: "2026-10-29T05:00:00Z",
    });

    await update(f.db, "rate_cards", "rate_card_id", c.card.rate_card_id, {
      status: "RETIRED",
      effective_to: "2026-12-31",
    });
    const v2 = await insert(f.db, "rate_cards", {
      name: c.card.name,
      version: 2,
      effective_from: "2027-01-01",
      owner_id: f.leadA.user_id,
    });
    await insert(f.db, "rate_card_items", {
      rate_card_id: v2.rate_card_id,
      category: "BRANDING",
      benefit_name: "Booth",
      monetized_unit_value: 5000000,
      unit: "booth",
    });
    await update(f.db, "rate_cards", "rate_card_id", v2.rate_card_id, { status: "ACTIVE" });

    const { rows } = await f.db.query<Row>(
      "SELECT calculated_value, (SELECT line_total_value FROM proposal_benefits WHERE proposal_benefit_id = $1) AS line_total FROM proposals WHERE proposal_id = $2",
      [l.proposal_benefit_id, p.proposal_id],
    );
    expect(rows[0]).toEqual({ calculated_value: 2000000, line_total: 2000000 });
  });

  it("proposals and actual revenue are separate: no foreign key between them", async () => {
    const { rows } = await f.db.query(
      `SELECT 1 FROM pg_constraint WHERE contype = 'f' AND (
         (conrelid = 'revenue_records'::regclass AND confrelid IN ('proposals'::regclass, 'proposal_benefits'::regclass))
      OR (conrelid IN ('proposals'::regclass, 'proposal_benefits'::regclass) AND confrelid = 'revenue_records'::regclass))`,
    );
    expect(rows).toHaveLength(0);
  });
});
