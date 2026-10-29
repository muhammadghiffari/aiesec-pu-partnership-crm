/**
 * Integrity tests (real PostgreSQL via PGlite): LoA, implementation, revenue, merchandise,
 * survey, audit log and sessions.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  newCycle,
  newPartner,
  type Row,
  uniq,
  update,
} from "./test-support";

let f: Fixture;
let line: Row;
beforeAll(async () => {
  f = await buildFixture();
  line = await insert(f.db, "proposal_benefits", {
    proposal_id: f.proposal.proposal_id,
    rate_card_item_id: f.item.rate_card_item_id,
    quantity: 1,
    agreed_unit_value: 500000,
    line_total_value: 500000,
    contribution_type: "SERVICE",
    benefit_name_snapshot: "Logo placement",
    unit_snapshot: "slot",
    rate_card_version_snapshot: 1,
  });
});

async function draftLoa(extra: Row = {}, cycle: Row = f.cycle, proposal: Row = f.proposal) {
  return insert(f.db, "loas", {
    proposal_id: proposal.proposal_id,
    cycle_id: cycle.cycle_id,
    template_kind: "MONETARY_VALUED",
    terms: "Synthetic terms",
    submitted_by: f.staff.user_id,
    ...extra,
  });
}

async function signedLoa(extra: Row = {}) {
  const loa = await draftLoa(extra);
  return update(f.db, "loas", "loa_id", loa.loa_id, {
    status: "SIGNED",
    approved_by: f.leadA.user_id,
    approved_at: "2026-10-29T03:00:00Z",
    partner_signed_at: "2026-10-30T03:00:00Z",
    aiesec_signed_at: "2026-10-30T04:00:00Z",
    document_url: "https://example.invalid/signed-loa",
  });
}

describe("LoA separation of duties and signing record", () => {
  it("a different CRM Lead may approve; either lead (TL BD or LCVP PD) is accepted equally", async () => {
    for (const lead of [f.leadA, f.leadB]) {
      const loa = await draftLoa();
      const approved = await update(f.db, "loas", "loa_id", loa.loa_id, {
        status: "APPROVED",
        approved_by: lead.user_id,
        approved_at: "2026-10-29T03:00:00Z",
      });
      expect(approved.status).toBe("APPROVED");
    }
  });

  it("the submitter can never approve their own LoA, even as a CRM Lead", async () => {
    const loa = await draftLoa({ submitted_by: f.leadA.user_id });
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, {
        status: "APPROVED",
        approved_by: f.leadA.user_id,
        approved_at: "2026-10-29T03:00:00Z",
      }),
      "loas_no_self_approval",
    );
    // Also rejected on insert.
    await expectDbError(
      draftLoa({
        submitted_by: f.leadB.user_id,
        approved_by: f.leadB.user_id,
        approved_at: "2026-10-29T03:00:00Z",
        status: "APPROVED",
      }),
      "loas_no_self_approval",
    );
  });

  it("an approver must be an active CRM Lead (staff, viewers and deactivated leads are refused)", async () => {
    for (const approver of [f.staff, f.viewer]) {
      const loa = await draftLoa();
      await expectDbError(
        update(f.db, "loas", "loa_id", loa.loa_id, {
          status: "APPROVED",
          approved_by: approver.user_id,
          approved_at: "2026-10-29T03:00:00Z",
        }),
        "approver must be an active CRM Lead",
      );
    }
    const retired = await insert(f.db, "users", {
      email: `${uniq("retired")}@example.invalid`,
      name: "Synthetic Retired Lead",
      access_role: "CRM_LEAD",
      is_active: false,
    });
    const loa = await draftLoa();
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, {
        status: "APPROVED",
        approved_by: retired.user_id,
        approved_at: "2026-10-29T03:00:00Z",
      }),
      "approver must be an active CRM Lead",
    );
  });

  it("approval person and time are recorded together; APPROVED/SIGNED require an approver", async () => {
    const loa = await draftLoa();
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, { approved_by: f.leadA.user_id }),
      "loas_approval_pair",
    );
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, { status: "APPROVED" }),
      "loas_approved_states",
    );
  });

  it("SIGNED requires both signature times and the signed-document link", async () => {
    const loa = await draftLoa();
    const approve = {
      status: "SIGNED",
      approved_by: f.leadA.user_id,
      approved_at: "2026-10-29T03:00:00Z",
    };
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, approve),
      "loas_signed_complete",
    );
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, {
        ...approve,
        partner_signed_at: "2026-10-30T03:00:00Z",
        aiesec_signed_at: "2026-10-30T04:00:00Z",
      }),
      "loas_signed_complete",
    );
    await expectDbError(
      update(f.db, "loas", "loa_id", loa.loa_id, {
        ...approve,
        partner_signed_at: "2026-10-30T03:00:00Z",
        document_url: "https://example.invalid/signed",
      }),
      "loas_signed_complete",
    );
  });

  it("a signed LoA is immutable (cannot be reverted, re-attributed or re-linked)", async () => {
    const signed = await signedLoa();
    for (const set of [
      { status: "DRAFT" },
      { submitted_by: f.leadB.user_id },
      { document_url: "https://example.invalid/other" },
    ]) {
      await expectDbError(update(f.db, "loas", "loa_id", signed.loa_id, set), /immutable|loas_/);
    }
  });

  it("LoA numbers are unique per year and sequence, and all-or-none", async () => {
    const a = await draftLoa({ loa_year: 2026, loa_sequence: 501, loa_number: "LOA/2026/501" });
    expect(a.loa_sequence).toBe(501);
    await expectDbError(
      draftLoa({ loa_year: 2026, loa_sequence: 501, loa_number: "LOA/2026/502" }),
      "loas_year_sequence_key",
    );
    await expectDbError(
      draftLoa({ loa_year: 2025, loa_sequence: 7, loa_number: "LOA/2026/501" }),
      /loa_number_key|loas_loa_number_key/,
    );
    await draftLoa({ loa_year: 2027, loa_sequence: 501, loa_number: "LOA/2027/501" });
    await expectDbError(draftLoa({ loa_year: 2026 }), "loas_number_parts");
    await expectDbError(draftLoa({ loa_number: "LOA/ORPHAN" }), "loas_number_parts");
  });

  it("the LoA's proposal must belong to the same cycle (no cross-cycle LoA)", async () => {
    const other = await newCycle(f.db, (await newPartner(f.db, f.category.category_id)).partner_id);
    await expectDbError(draftLoa({}, other), "loas_proposal_same_cycle");
  });

  it("one proposal can lead to several LoAs (0..*); template kind is constrained", async () => {
    await draftLoa();
    await draftLoa();
    await expectDbError(draftLoa({ template_kind: "VERBAL" }), "template_kind");
  });
});

describe("realization project starts only from a fully signed LoA", () => {
  const project = (loa: Row, extra: Row = {}) =>
    insert(f.db, "realization_projects", {
      loa_id: loa.loa_id,
      start_date: "2026-11-01",
      ...extra,
    });

  it("opens from a signed LoA", async () => {
    expect((await project(await signedLoa())).status).toBe("PLANNED");
  });

  it("refuses draft, submitted, approved-but-unsigned, rejected and cancelled LoAs", async () => {
    const draft = await draftLoa();
    await expectDbError(project(draft), "fully signed LoA");
    for (const status of ["SUBMITTED", "REJECTED", "CANCELLED"]) {
      const l = await draftLoa();
      await update(f.db, "loas", "loa_id", l.loa_id, { status });
      await expectDbError(project(l), "fully signed LoA");
    }
    const approved = await draftLoa();
    await update(f.db, "loas", "loa_id", approved.loa_id, {
      status: "APPROVED",
      approved_by: f.leadB.user_id,
      approved_at: "2026-10-29T03:00:00Z",
    });
    await expectDbError(project(approved), "fully signed LoA");
  });

  it("a finished project requires the report link and submission time (ESSM report gate)", async () => {
    const p = await project(await signedLoa());
    await expectDbError(
      update(f.db, "realization_projects", "project_id", p.project_id, { status: "FINISHED" }),
      "projects_finished_requires_report",
    );
    await expectDbError(
      update(f.db, "realization_projects", "project_id", p.project_id, {
        status: "FINISHED",
        report_url: "https://example.invalid/report",
      }),
      "projects_finished_requires_report",
    );
    const done = await update(f.db, "realization_projects", "project_id", p.project_id, {
      status: "FINISHED",
      report_url: "https://example.invalid/report",
      report_submitted_at: "2026-12-01T00:00:00Z",
    });
    expect(done.status).toBe("FINISHED");
  });

  it("the optional Impact Report due date does not satisfy the mandatory report gate", async () => {
    const p = await project(await signedLoa(), { impact_report_due_at: "2026-12-10" });
    await expectDbError(
      update(f.db, "realization_projects", "project_id", p.project_id, { status: "FINISHED" }),
      "projects_finished_requires_report",
    );
  });

  it("rejects an end date before the start and non-http report links", async () => {
    await expectDbError(project(await signedLoa(), { end_date: "2026-10-01" }), "projects_period");
    await expectDbError(
      project(await signedLoa(), { report_url: "file:///etc/passwd" }),
      "report_url",
    );
  });

  it("one LoA can have several projects (0..*), and deliveries mirror the LoA's own proposal", async () => {
    const loa = await signedLoa();
    const p1 = await project(loa);
    await project(loa);

    await insert(f.db, "delivery_records", {
      project_id: p1.project_id,
      proposal_benefit_id: line.proposal_benefit_id,
    });
    await expectDbError(
      insert(f.db, "delivery_records", {
        project_id: p1.project_id,
        proposal_benefit_id: line.proposal_benefit_id,
      }),
      "delivery_one_per_commitment",
    );

    // A benefit from a different proposal cannot be delivered against this project.
    const otherCycle = await newCycle(
      f.db,
      (await newPartner(f.db, f.category.category_id)).partner_id,
    );
    const otherProposal = await insert(f.db, "proposals", {
      cycle_id: otherCycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 1,
    });
    const foreign = await insert(f.db, "proposal_benefits", {
      proposal_id: otherProposal.proposal_id,
      rate_card_item_id: f.item.rate_card_item_id,
      quantity: 1,
      agreed_unit_value: 1,
      line_total_value: 1,
      contribution_type: "SERVICE",
      benefit_name_snapshot: "Logo placement",
      unit_snapshot: "slot",
      rate_card_version_snapshot: 1,
    });
    const p2 = await project(await signedLoa());
    await expectDbError(
      insert(f.db, "delivery_records", {
        project_id: p2.project_id,
        proposal_benefit_id: foreign.proposal_benefit_id,
      }),
      "benefit of the LoA",
    );
  });

  it("a DELIVERED record requires a delivery time and proof link", async () => {
    const p = await project(await signedLoa());
    const d = await insert(f.db, "delivery_records", {
      project_id: p.project_id,
      proposal_benefit_id: line.proposal_benefit_id,
    });
    await expectDbError(
      update(f.db, "delivery_records", "delivery_id", d.delivery_id, { status: "DELIVERED" }),
      "delivery_delivered_requires_proof",
    );
    const ok = await update(f.db, "delivery_records", "delivery_id", d.delivery_id, {
      status: "DELIVERED",
      delivered_at: "2026-11-20T00:00:00Z",
      proof_url: "https://example.invalid/proof",
    });
    expect(ok.status).toBe("DELIVERED");
  });
});

describe("actual revenue: financial and in-kind receipts are separate, proven records", () => {
  const financial = (extra: Row = {}) => ({
    cycle_id: f.cycle.cycle_id,
    revenue_type: "FINANCIAL",
    month: "2026-11",
    program: "Synthetic Program",
    date_received: "2026-11-05",
    financial_amount: 1500000,
    proof_url: "https://example.invalid/transfer-proof",
    ...extra,
  });
  const inKind = (extra: Row = {}) => ({
    cycle_id: f.cycle.cycle_id,
    revenue_type: "IN_KIND",
    month: "2026-11",
    program: "Synthetic Program",
    date_received: "2026-11-06",
    in_kind_value: 750000,
    in_kind_type: "ADDED_VALUE",
    in_kind_description: "Venue sponsorship for one day",
    proof_url: "https://example.invalid/venue-proof",
    ...extra,
  });

  it("stores a financial receipt with integer rupiah and proof", async () => {
    const r = await insert(f.db, "revenue_records", financial());
    expect(r.financial_amount).toBe(1500000);
    expect(r.in_kind_value).toBeNull();
    expect(r.proof_uploaded).toBe(false);
  });

  it("stores an in-kind receipt with type, value and description", async () => {
    const r = await insert(f.db, "revenue_records", inKind({ in_kind_type: "COST_REDUCTION" }));
    expect(r.in_kind_type).toBe("COST_REDUCTION");
    expect(r.financial_amount).toBeNull();
  });

  it("rejects mixing the two shapes in one row", async () => {
    await expectDbError(
      insert(f.db, "revenue_records", financial({ in_kind_value: 10 })),
      "revenue_financial_shape",
    );
    await expectDbError(
      insert(f.db, "revenue_records", financial({ in_kind_description: "x" })),
      "revenue_financial_shape",
    );
    await expectDbError(
      insert(f.db, "revenue_records", inKind({ financial_amount: 10 })),
      "revenue_in_kind_shape",
    );
    await expectDbError(
      insert(f.db, "revenue_records", financial({ financial_amount: null })),
      "revenue_financial_shape",
    );
  });

  it("requires a proof URL on every receipt and rejects zero or negative values", async () => {
    await expectDbError(
      insert(f.db, "revenue_records", financial({ proof_url: null })),
      "null value",
    );
    await expectDbError(
      insert(f.db, "revenue_records", financial({ proof_url: "see email" })),
      "proof_url",
    );
    await expectDbError(
      insert(f.db, "revenue_records", financial({ financial_amount: 0 })),
      "financial_amount",
    );
    await expectDbError(
      insert(f.db, "revenue_records", inKind({ in_kind_value: -5 })),
      "in_kind_value",
    );
    await expectDbError(
      insert(f.db, "revenue_records", inKind({ in_kind_description: "  " })),
      "revenue_in_kind_shape",
    );
  });

  it("rejects fractional rupiah (integer money) and malformed month / type values", async () => {
    await expectDbError(
      insert(f.db, "revenue_records", financial({ financial_amount: 100.5 })),
      /invalid input syntax|integer|bigint/,
    );
    await expectDbError(insert(f.db, "revenue_records", financial({ month: "11-2026" })), "month");
    await expectDbError(insert(f.db, "revenue_records", financial({ month: "2026-13" })), "month");
    await expectDbError(
      insert(f.db, "revenue_records", financial({ revenue_type: "BARTER" })),
      "revenue_type",
    );
  });

  it("a proposal valuation never appears in revenue totals (no FK, separate sums)", async () => {
    const before = await f.db.query<{ total: string | null }>(
      "SELECT sum(financial_amount) AS total FROM revenue_records WHERE cycle_id = $1",
      [f.cycle.cycle_id],
    );
    await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 99_000_000,
    });
    const after = await f.db.query<{ total: string | null }>(
      "SELECT sum(financial_amount) AS total FROM revenue_records WHERE cycle_id = $1",
      [f.cycle.cycle_id],
    );
    expect(after.rows[0]?.total).toEqual(before.rows[0]?.total);
  });

  it("links to a LoA/project only inside the same cycle", async () => {
    const loa = await signedLoa();
    const project = await insert(f.db, "realization_projects", {
      loa_id: loa.loa_id,
      start_date: "2026-11-01",
    });
    await insert(
      f.db,
      "revenue_records",
      financial({ loa_id: loa.loa_id, project_id: project.project_id }),
    );

    const otherCycle = await newCycle(
      f.db,
      (await newPartner(f.db, f.category.category_id)).partner_id,
    );
    await expectDbError(
      insert(
        f.db,
        "revenue_records",
        financial({ cycle_id: otherCycle.cycle_id, loa_id: loa.loa_id }),
      ),
      "different cycle",
    );
    await expectDbError(
      insert(
        f.db,
        "revenue_records",
        financial({ cycle_id: otherCycle.cycle_id, project_id: project.project_id }),
      ),
      "different cycle",
    );
  });
});

describe("merchandise tracker is separate from partner revenue", () => {
  const item = (extra: Row = {}) =>
    insert(f.db, "merchandise_items", {
      item_name: uniq("Synthetic Tote Bag"),
      cogs_per_item: 20000,
      selling_price: 35000,
      ...extra,
    });

  it("derives per-item profit in the database", async () => {
    const i = await item();
    expect(i.profit_per_item).toBe(15000);
    const loss = await item({ cogs_per_item: 40000, selling_price: 35000 });
    expect(loss.profit_per_item).toBe(-5000);
  });

  it("does not allow writing derived columns directly", async () => {
    await expectDbError(item({ profit_per_item: 1 }), /generated column|cannot insert/);
  });

  it("rejects negative prices and duplicate item names (case-insensitive)", async () => {
    await expectDbError(item({ cogs_per_item: -1 }), "cogs_per_item");
    await expectDbError(item({ selling_price: -1 }), "selling_price");
    const name = uniq("Synthetic Mug");
    await item({ item_name: name });
    await expectDbError(item({ item_name: name.toUpperCase() }), "merchandise_items_name_key");
  });

  it("a realization is for exactly one of item or bundle", async () => {
    const i = await item();
    const bundle = await insert(f.db, "merchandise_bundles", {
      bundle_name: uniq("Synthetic Bundle"),
      bundling_price: 90000,
    });
    const sale = {
      quantity_sold: 3,
      unit_selling_price: 35000,
      unit_cogs_snapshot: 20000,
      realized_at: "2026-11-10",
      revenue_proof_url: "https://example.invalid/sales-proof",
    };
    const itemSale = await insert(f.db, "merchandise_realizations", {
      ...sale,
      item_id: i.item_id,
    });
    await insert(f.db, "merchandise_realizations", { ...sale, bundle_id: bundle.bundle_id });
    await expectDbError(
      insert(f.db, "merchandise_realizations", {
        ...sale,
        item_id: i.item_id,
        bundle_id: bundle.bundle_id,
      }),
      "realization_item_xor_bundle",
    );
    await expectDbError(
      insert(f.db, "merchandise_realizations", sale),
      "realization_item_xor_bundle",
    );
    expect([itemSale.total_cogs, itemSale.total_revenue, itemSale.total_profit]).toEqual([
      60000, 105000, 45000,
    ]);
  });

  it("history is snapshotted: editing item prices later does not change a recorded sale", async () => {
    const i = await item();
    const sale = await insert(f.db, "merchandise_realizations", {
      item_id: i.item_id,
      quantity_sold: 10,
      unit_selling_price: 35000,
      unit_cogs_snapshot: 20000,
      realized_at: "2026-11-10",
      revenue_proof_url: "https://example.invalid/proof",
    });
    await update(f.db, "merchandise_items", "item_id", i.item_id, {
      cogs_per_item: 99999,
      selling_price: 1,
    });
    const { rows } = await f.db.query<Row>(
      "SELECT total_cogs, total_revenue, total_profit FROM merchandise_realizations WHERE realization_id = $1",
      [sale.realization_id],
    );
    expect(rows[0]).toEqual({ total_cogs: 200000, total_revenue: 350000, total_profit: 150000 });
  });

  it("requires revenue proof, positive integer quantity and non-negative snapshots", async () => {
    const i = await item();
    const base = {
      item_id: i.item_id,
      quantity_sold: 1,
      unit_selling_price: 1,
      unit_cogs_snapshot: 1,
      realized_at: "2026-11-10",
      revenue_proof_url: "https://example.invalid/p",
    };
    await expectDbError(
      insert(f.db, "merchandise_realizations", { ...base, revenue_proof_url: null }),
      "null value",
    );
    await expectDbError(
      insert(f.db, "merchandise_realizations", { ...base, quantity_sold: 0 }),
      "quantity_sold",
    );
    await expectDbError(
      insert(f.db, "merchandise_realizations", { ...base, unit_cogs_snapshot: -1 }),
      "unit_cogs_snapshot",
    );
  });

  it("bundles are many-to-many with items, once per item, positive quantity", async () => {
    const a = await item();
    const b = await item();
    const bundle = await insert(f.db, "merchandise_bundles", {
      bundle_name: uniq("Combo"),
      bundling_price: 50000,
    });
    await insert(f.db, "merchandise_bundle_items", {
      bundle_id: bundle.bundle_id,
      item_id: a.item_id,
      quantity_per_bundle: 2,
    });
    await insert(f.db, "merchandise_bundle_items", {
      bundle_id: bundle.bundle_id,
      item_id: b.item_id,
      quantity_per_bundle: 1,
    });
    await expectDbError(
      insert(f.db, "merchandise_bundle_items", {
        bundle_id: bundle.bundle_id,
        item_id: a.item_id,
        quantity_per_bundle: 1,
      }),
      "bundle_item_unique",
    );
    await expectDbError(
      insert(f.db, "merchandise_bundle_items", {
        bundle_id: bundle.bundle_id,
        item_id: crypto.randomUUID(),
        quantity_per_bundle: 0,
      }),
      /quantity_per_bundle|foreign key/,
    );
  });

  it("has no foreign key to revenue_records (retail sales cannot double count as partner revenue)", async () => {
    const { rows } = await f.db.query(
      `SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND conrelid = 'merchandise_realizations'::regclass AND confrelid = 'revenue_records'::regclass`,
    );
    expect(rows).toHaveLength(0);
    const reverse = await f.db.query(
      `SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND conrelid = 'revenue_records'::regclass
          AND confrelid IN ('merchandise_realizations'::regclass, 'merchandise_items'::regclass)`,
    );
    expect(reverse.rows).toHaveLength(0);
  });
});

describe("engagement and Post Survey tracking", () => {
  it("newsletter/visit/invitation/greeting are all recordable; SENT needs actor, approver and time", async () => {
    for (const type of ["NEWSLETTER", "PARTNER_VISIT", "EVENT_INVITATION", "GREETING_CARD"]) {
      await insert(f.db, "partner_engagements", {
        cycle_id: f.cycle.cycle_id,
        engagement_type: type,
      });
    }
    await expectDbError(
      insert(f.db, "partner_engagements", {
        cycle_id: f.cycle.cycle_id,
        engagement_type: "NEWSLETTER",
        status: "SENT",
      }),
      "engagement_sent_complete",
    );
    await insert(f.db, "partner_engagements", {
      cycle_id: f.cycle.cycle_id,
      engagement_type: "NEWSLETTER",
      status: "SENT",
      approved_by: f.staff.user_id,
      sent_by: f.staff.user_id,
      sent_at: "2026-11-01T01:00:00Z",
    });
    await expectDbError(
      insert(f.db, "partner_engagements", {
        cycle_id: f.cycle.cycle_id,
        engagement_type: "PODCAST",
      }),
      "engagement_type",
    );
  });

  it("optional engagements may be SKIPPED without blocking anything", async () => {
    const e = await insert(f.db, "partner_engagements", {
      cycle_id: f.cycle.cycle_id,
      engagement_type: "PARTNER_VISIT",
      status: "SKIPPED",
    });
    expect(e.status).toBe("SKIPPED");
  });

  it("a cycle has at most one survey record; SENT needs time and sender", async () => {
    const cycle = await newCycle(f.db, (await newPartner(f.db, f.category.category_id)).partner_id);
    const url = "https://s.aiesec.or.id/AIESECPartnershipSurvey-BD";
    await insert(f.db, "post_partnership_surveys", {
      cycle_id: cycle.cycle_id,
      official_form_url: url,
    });
    await expectDbError(
      insert(f.db, "post_partnership_surveys", {
        cycle_id: cycle.cycle_id,
        official_form_url: url,
      }),
      /post_partnership_surveys_cycle_id_key|duplicate key/,
    );
    const other = await newCycle(f.db, (await newPartner(f.db, f.category.category_id)).partner_id);
    await expectDbError(
      insert(f.db, "post_partnership_surveys", {
        cycle_id: other.cycle_id,
        official_form_url: url,
        status: "SENT",
      }),
      "survey_sent_complete",
    );
    await expectDbError(
      insert(f.db, "post_partnership_surveys", {
        cycle_id: other.cycle_id,
        official_form_url: url,
        status: "COMPLETION_CONFIRMED",
        sent_at: "2026-12-01T00:00:00Z",
        sent_by: f.staff.user_id,
      }),
      "survey_completion_checked",
    );
  });

  it("has no column for survey response content (link and status tracking only, D-011)", async () => {
    const { rows } = await f.db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'post_partnership_surveys' AND column_name ~* '(response|answer|score|comment)'",
    );
    expect(rows).toEqual([]);
  });

  it("rate card assessment scores are 0-5 and derived values stay unset (Q-01)", async () => {
    const { rows } = await f.db.query<Row>(
      "SELECT proposal_benefit_id FROM proposal_benefits WHERE proposal_id = $1 LIMIT 1",
      [f.proposal.proposal_id],
    );
    const pb = (rows[0] as Row).proposal_benefit_id;
    const scores = {
      proposal_benefit_id: pb,
      retention_rate_score: 3,
      event_size_score: 4,
      event_scale_score: 2,
      partnership_quality_score: 5,
      partnership_duration_score: 1,
      sdg_alignment_score: 0,
      leadership_value_alignment_score: 5,
      partnership_retained_score: 3,
      historical_score: 2,
      communication_score: 4,
    };
    const a = await insert(f.db, "rate_card_assessments", scores);
    expect([a.monetize_quality, a.monetize_value]).toEqual([null, null]);
    await expectDbError(
      insert(f.db, "rate_card_assessments", scores),
      /duplicate key|_proposal_benefit_id_key/,
    );
  });
});

describe("audit_log is append-only at the database level", () => {
  const entry = (extra: Row = {}) => ({
    audit_id: crypto.randomUUID(),
    occurred_at: "2026-10-29T03:00:00Z",
    kind: "MUTATION",
    actor_user_id: f.staff.user_id,
    action: "partner.write",
    entity_type: "partner",
    entity_id: "partner-123",
    metadata: { changedFields: ["name"] },
    ...extra,
  });

  it("accepts appends, including the non-UUID entity targets M0-06 produces", async () => {
    await insert(f.db, "audit_log", entry());
    await insert(
      f.db,
      "audit_log",
      entry({ kind: "ACCESS_DENIED", entity_type: "authorization", entity_id: "partner.write" }),
    );
    await insert(f.db, "audit_log", entry({ metadata: null }));
  });

  it("rejects UPDATE and DELETE of any row, even by the table owner", async () => {
    const row = await insert(f.db, "audit_log", entry());
    await expectDbError(
      update(f.db, "audit_log", "audit_id", row.audit_id, { action: "tampered" }),
      "append-only",
    );
    await expectDbError(
      f.db.query("UPDATE audit_log SET actor_user_id = $1", [f.leadA.user_id]),
      "append-only",
    );
    await expectDbError(
      f.db.query("DELETE FROM audit_log WHERE audit_id = $1", [row.audit_id]),
      "append-only",
    );
    await expectDbError(f.db.query("DELETE FROM audit_log"), "append-only");
    const { rows } = await f.db.query<Row>("SELECT action FROM audit_log WHERE audit_id = $1", [
      row.audit_id,
    ]);
    expect(rows[0]?.action).toBe("partner.write");
  });

  it("rejects TRUNCATE", async () => {
    await expectDbError(f.db.query("TRUNCATE audit_log"), "append-only");
    const { rows } = await f.db.query("SELECT 1 FROM audit_log");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("rejects a duplicate audit id (no overwrite through upsert either)", async () => {
    const e = entry();
    await insert(f.db, "audit_log", e);
    await expectDbError(insert(f.db, "audit_log", e), /duplicate key|audit_log_pkey/);
    await expectDbError(
      f.db.query(
        "INSERT INTO audit_log (audit_id, occurred_at, kind, actor_user_id, action, entity_type, entity_id) VALUES ($1, now(), 'MUTATION', $2, 'x', 'y', 'z') ON CONFLICT (audit_id) DO UPDATE SET action = 'overwritten'",
        [e.audit_id, f.staff.user_id],
      ),
      "append-only",
    );
  });

  it("a gate override needs a reason of 10+ characters and the actor as the named lead", async () => {
    const override = entry({
      kind: "GATE_OVERRIDE",
      action: "gate.override",
      actor_user_id: f.leadA.user_id,
    });
    await expectDbError(insert(f.db, "audit_log", override), "audit_override_requires_reason");
    await expectDbError(
      insert(f.db, "audit_log", {
        ...override,
        reason: "too short",
        authorized_by_user_id: f.leadA.user_id,
      }),
      "audit_override_requires_reason",
    );
    await expectDbError(
      insert(f.db, "audit_log", {
        ...override,
        audit_id: crypto.randomUUID(),
        reason: "Approved exception for pilot partner",
        authorized_by_user_id: f.leadB.user_id,
      }),
      "audit_override_requires_reason",
    );
    await insert(f.db, "audit_log", {
      ...override,
      audit_id: crypto.randomUUID(),
      reason: "Approved exception for pilot partner",
      authorized_by_user_id: f.leadA.user_id,
    });
  });

  it("requires a real actor, a known kind and object metadata; the actor row cannot be deleted", async () => {
    await expectDbError(
      insert(f.db, "audit_log", entry({ actor_user_id: crypto.randomUUID() })),
      "foreign key",
    );
    await expectDbError(insert(f.db, "audit_log", entry({ kind: "SECRET_ACCESS" })), "kind");
    await expectDbError(
      insert(f.db, "audit_log", entry({ metadata: JSON.stringify([1, 2]) })),
      "audit_log_metadata_check",
    );
    await expectDbError(
      f.db.query("DELETE FROM users WHERE user_id = $1", [f.staff.user_id]),
      "foreign key",
    );
  });

  it("has no application update path: dropping the guard triggers is the only bypass (documented)", async () => {
    const { rows } = await f.db.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal ORDER BY 1",
    );
    expect(rows.map((r) => r.tgname)).toEqual(["audit_log_no_row_change", "audit_log_no_truncate"]);
  });
});

describe("user sessions", () => {
  const hash = "c".repeat(64);
  it("stores only a hex SHA-256 token hash; hashes are unique", async () => {
    const base = {
      session_id: crypto.randomUUID(),
      user_id: f.staff.user_id,
      token_hash: hash,
      created_at: "2026-10-29T00:00:00Z",
      expires_at: "2026-10-29T08:00:00Z",
    };
    await insert(f.db, "user_sessions", base);
    await expectDbError(
      insert(f.db, "user_sessions", { ...base, session_id: crypto.randomUUID() }),
      /user_sessions_token_hash_key|duplicate key/,
    );
    await expectDbError(
      insert(f.db, "user_sessions", {
        ...base,
        session_id: crypto.randomUUID(),
        token_hash: "raw-session-token",
      }),
      "token_hash",
    );
  });

  it("must expire after creation and reference a real user", async () => {
    const base = {
      session_id: crypto.randomUUID(),
      user_id: f.staff.user_id,
      token_hash: "d".repeat(64),
      created_at: "2026-10-29T08:00:00Z",
      expires_at: "2026-10-29T00:00:00Z",
    };
    await expectDbError(insert(f.db, "user_sessions", base), "user_sessions_expiry");
    await expectDbError(
      insert(f.db, "user_sessions", {
        ...base,
        expires_at: "2026-10-29T09:00:00Z",
        user_id: crypto.randomUUID(),
      }),
      "foreign key",
    );
  });
});
