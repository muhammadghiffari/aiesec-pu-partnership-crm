/**
 * Integrity and cardinality tests (real PostgreSQL via PGlite): partners through proposals.
 * Every rejection test asserts the specific database error so a different failure cannot pass.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  newContact,
  newCycle,
  newPartner,
  type Row,
  uniq,
  update,
} from "./test-support";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

describe("users", () => {
  it("normalizes: rejects non-lowercase and malformed emails, and duplicates", async () => {
    await expectDbError(
      insert(f.db, "users", { email: "Mixed@Example.invalid", name: "x", access_role: "BD_STAFF" }),
      "users_email_normalized",
    );
    await expectDbError(
      insert(f.db, "users", { email: "not-an-email", name: "x", access_role: "BD_STAFF" }),
      "users_email_normalized",
    );
    await expectDbError(
      insert(f.db, "users", { email: f.staff.email, name: "dup", access_role: "BD_STAFF" }),
      "users_email_key",
    );
  });

  it("rejects an access role outside CRM_LEAD/BD_STAFF/VIEWER (no TL BD / LCVP PD roles)", async () => {
    for (const role of ["TL_BD", "LCVP_PD", "SUPER_ADMIN"]) {
      await expectDbError(
        insert(f.db, "users", {
          email: `${uniq("r")}@example.invalid`,
          name: "x",
          access_role: role,
        }),
        "access_role",
      );
    }
  });

  it("stores organizational title as metadata: both leads share the same role value", () => {
    expect(f.leadA.access_role).toBe(f.leadB.access_role);
    expect(f.leadA.organizational_title).not.toBe(f.leadB.organizational_title);
  });
});

describe("partners and contacts", () => {
  it("one category classifies many partners; each partner needs an existing category", async () => {
    const second = await newPartner(f.db, f.category.category_id);
    expect(second.partner_id).not.toBe(f.partner.partner_id);
    await expectDbError(newPartner(f.db, crypto.randomUUID()), "foreign key");
  });

  it("allows possible duplicates (review, never silent merge) but derives a normalized name", async () => {
    const a = await newPartner(f.db, f.category.category_id, { name: "  Acme   Synthetic  Ltd " });
    const b = await newPartner(f.db, f.category.category_id, { name: "acme synthetic ltd" });
    expect(a.normalized_name).toBe("acme synthetic ltd");
    expect(b.normalized_name).toBe(a.normalized_name);
  });

  it("rejects malformed domains and URLs", async () => {
    await expectDbError(
      newPartner(f.db, f.category.category_id, { website_domain: "not a domain" }),
      "website_domain",
    );
    await expectDbError(
      newPartner(f.db, f.category.category_id, { source_url: "javascript:alert(1)" }),
      "source_url",
    );
  });

  it("one partner has many contacts, but a duplicate email within a partner is rejected", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    const c1 = await newContact(f.db, p.partner_id, { email: "same@example.invalid" });
    const c2 = await newContact(f.db, p.partner_id, { email: "other@example.invalid" });
    expect(c1.contact_id).not.toBe(c2.contact_id);
    await expectDbError(
      newContact(f.db, p.partner_id, { email: "same@example.invalid" }),
      "contacts_partner_email_key",
    );
    // The same address under a different partner is allowed.
    await newContact(f.db, f.partner.partner_id, { email: "same@example.invalid" });
  });

  it("requires a lawful-basis note and a valid verification status", async () => {
    await expectDbError(
      newContact(f.db, f.partner.partner_id, { lawful_basis_note: "" }),
      "lawful_basis_note",
    );
    await expectDbError(
      newContact(f.db, f.partner.partner_id, { verification_status: "MAYBE" }),
      "verification_status",
    );
  });

  it("VERIFIED requires verifier, timestamp and at least one channel", async () => {
    const base = { verification_status: "VERIFIED" };
    await expectDbError(
      newContact(f.db, f.partner.partner_id, base),
      "contacts_verified_requires_evidence",
    );
    await expectDbError(
      newContact(f.db, f.partner.partner_id, {
        ...base,
        verified_at: "2026-10-29T00:00:00Z",
        verified_by: f.staff.user_id,
        email: null,
      }),
      "contacts_verified_requires_evidence",
    );
    await newContact(f.db, f.partner.partner_id, {
      ...base,
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
    });
  });

  it("do-not-contact requires a reason, time and named actor", async () => {
    await expectDbError(
      newContact(f.db, f.partner.partner_id, { do_not_contact: true }),
      "contacts_dnc_requires_reason",
    );
    await newContact(f.db, f.partner.partner_id, {
      do_not_contact: true,
      dnc_reason: "Partner asked not to be contacted",
      dnc_set_at: "2026-10-29T00:00:00Z",
      dnc_set_by: f.leadA.user_id,
    });
  });

  it("restricts deleting a partner that has contacts or cycles (history is preserved)", async () => {
    await expectDbError(
      f.db.query("DELETE FROM partners WHERE partner_id = $1", [f.partner.partner_id]),
      "foreign key",
    );
  });
});

describe("partnership cycles (five-stage lifecycle storage)", () => {
  it("one partner can have many cycles with unique cycle numbers", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    await newCycle(f.db, p.partner_id, { cycle_number: 1 });
    await newCycle(f.db, p.partner_id, { cycle_number: 2, sales_type: "RE_RAISE" });
    await expectDbError(
      newCycle(f.db, p.partner_id, { cycle_number: 2 }),
      "cycles_partner_number_key",
    );
  });

  it("accepts exactly the five ESSM stages and rejects sub-activities or legacy values", async () => {
    for (const stage of [
      "PROSPECTING",
      "SALES_PROCESS",
      "CLOSE_DEAL",
      "PARTNERSHIP_IMPLEMENTATION",
      "POST_SURVEY",
    ]) {
      const p = await newPartner(f.db, f.category.category_id);
      await newCycle(f.db, p.partner_id, { essm_stage: stage });
    }
    for (const stage of ["OUTREACHING", "MEETING", "CONTRACT_SIGNED", "B2B", "CLOSED"]) {
      const p = await newPartner(f.db, f.category.category_id);
      await expectDbError(newCycle(f.db, p.partner_id, { essm_stage: stage }), "essm_stage");
    }
  });

  it("keeps sales status, approach method and partnership status as separate dimensions", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    const c = await newCycle(f.db, p.partner_id, {
      sales_status: "INACTIVE",
      approach_method: "PASSIVE",
      partnership_status: "BREAK",
    });
    expect([c.sales_status, c.approach_method, c.partnership_status]).toEqual([
      "INACTIVE",
      "PASSIVE",
      "BREAK",
    ]);
    await expectDbError(
      newCycle(f.db, p.partner_id, { cycle_number: 2, sales_status: "BREAK" }),
      "sales_status",
    );
    await expectDbError(
      newCycle(f.db, p.partner_id, { cycle_number: 3, partnership_status: "INACTIVE" }),
      "partnership_status",
    );
  });

  it("a re-raise cycle links to an earlier cycle of the SAME partner and keeps history", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    const first = await newCycle(f.db, p.partner_id, {
      cycle_number: 1,
      essm_stage: "POST_SURVEY",
      re_raise_decision: "YES",
    });
    const second = await newCycle(f.db, p.partner_id, {
      cycle_number: 2,
      sales_type: "RE_RAISE",
      previous_cycle_id: first.cycle_id,
    });
    expect(second.previous_cycle_id).toBe(first.cycle_id);
    const { rows } = await f.db.query<Row>(
      "SELECT re_raise_decision FROM partnership_cycles WHERE cycle_id = $1",
      [first.cycle_id],
    );
    expect(rows[0]?.re_raise_decision).toBe("YES"); // earlier cycle untouched

    const other = await newPartner(f.db, f.category.category_id);
    await expectDbError(
      newCycle(f.db, other.partner_id, { cycle_number: 2, previous_cycle_id: first.cycle_id }),
      "cycles_previous_same_partner",
    );
  });

  it("a first cycle cannot have a previous cycle", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    const c1 = await newCycle(f.db, p.partner_id, { cycle_number: 1 });
    await expectDbError(
      newCycle(f.db, p.partner_id, { cycle_number: 1, previous_cycle_id: c1.cycle_id }),
      /cycles_partner_number_key|cycles_previous_only_after_first/,
    );
  });

  it("PLANNING_TO requires a review date; YES/NO do not", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    await expectDbError(
      newCycle(f.db, p.partner_id, { cycle_number: 1, re_raise_decision: "PLANNING_TO" }),
      "cycles_planning_to_needs_review_date",
    );
    await newCycle(f.db, p.partner_id, {
      cycle_number: 1,
      re_raise_decision: "PLANNING_TO",
      re_raise_review_date: "2027-01-15",
    });
    await newCycle(f.db, p.partner_id, { cycle_number: 2, re_raise_decision: "NO" });
  });

  it("requires a valid Project Support and a close date after the open date", async () => {
    const p = await newPartner(f.db, f.category.category_id);
    await expectDbError(
      newCycle(f.db, p.partner_id, { project_support: "UNKNOWN" }),
      "foreign key",
    );
    await expectDbError(
      newCycle(f.db, p.partner_id, {
        opened_at: "2026-10-29T00:00:00Z",
        closed_at: "2026-10-01T00:00:00Z",
      }),
      "cycles_closed_after_opened",
    );
  });
});

describe("market research and prospecting", () => {
  const valid = (): Row => ({
    cycle_id: f.cycle.cycle_id,
    values_score: 4,
    vision_score: 3,
    current_focus_score: 5,
    program_score: 2,
    proceed_decision: true,
    evidence_urls: ["https://example.invalid/evidence"],
    verified_by: f.staff.user_id,
    research_date: "2026-10-29",
  });

  it("stores four human scores 1-5, a Proceed decision and a separate AI fit score", async () => {
    const r = await insert(f.db, "market_research", { ...valid(), ai_fit_score: 87.5 });
    expect([r.values_score, r.vision_score, r.current_focus_score, r.program_score]).toEqual([
      4, 3, 5, 2,
    ]);
    expect(r.ai_fit_score).toBe("87.50");
  });

  it.each(["values_score", "vision_score", "current_focus_score", "program_score"])(
    "rejects %s outside 1-5 and missing",
    async (col) => {
      for (const bad of [0, 6, -1]) {
        await expectDbError(insert(f.db, "market_research", { ...valid(), [col]: bad }), col);
      }
      await expectDbError(
        insert(f.db, "market_research", { ...valid(), [col]: null }),
        "null value",
      );
    },
  );

  it("requires an explicit Proceed decision, evidence and a human verifier", async () => {
    await expectDbError(
      insert(f.db, "market_research", { ...valid(), proceed_decision: null }),
      "null value",
    );
    await expectDbError(
      insert(f.db, "market_research", { ...valid(), evidence_urls: [] }),
      "evidence_urls",
    );
    await expectDbError(
      insert(f.db, "market_research", { ...valid(), evidence_urls: ["ftp://example.invalid/x"] }),
      "evidence_urls",
    );
    await expectDbError(
      insert(f.db, "market_research", { ...valid(), verified_by: null }),
      "null value",
    );
  });

  it("an AI fit score alone cannot satisfy the four ESSM scores", async () => {
    const { values_score: _v, ...withoutValues } = valid();
    await expectDbError(
      insert(f.db, "market_research", { ...withoutValues, ai_fit_score: 99 }),
      "null value",
    );
  });

  it("a cycle can keep several research records (history)", async () => {
    await insert(f.db, "market_research", { ...valid(), research_date: "2026-10-30" });
    const { rows } = await f.db.query("SELECT 1 FROM market_research WHERE cycle_id = $1", [
      f.cycle.cycle_id,
    ]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("prospecting records need a criteria version and source URLs", async () => {
    const criteria = await insert(f.db, "target_criteria", {
      industry_category_id: f.category.category_id,
      project_support: "OTHERS",
      criteria_text: "Synthetic criteria",
      version: 1,
    });
    const rec = {
      cycle_id: f.cycle.cycle_id,
      criteria_id: criteria.criteria_id,
      fit_score: 72,
      fit_rationale: "synthetic rationale",
      insight_summary: "synthetic insight",
      source_urls: ["https://example.invalid/source"],
    };
    await insert(f.db, "prospecting_records", rec);
    await expectDbError(
      insert(f.db, "prospecting_records", { ...rec, source_urls: [] }),
      "source_urls",
    );
    await expectDbError(
      insert(f.db, "prospecting_records", { ...rec, criteria_id: crypto.randomUUID() }),
      "foreign key",
    );
  });

  it("criteria versions are unique per category and Project Support, including the global (null) category", async () => {
    const base = { project_support: "OTHERS", criteria_text: "c", version: 7 };
    await insert(f.db, "target_criteria", base);
    await expectDbError(insert(f.db, "target_criteria", base), "target_criteria_version_key");
    await insert(f.db, "target_criteria", {
      ...base,
      industry_category_id: f.category.category_id,
    });
  });
});

describe("outreach: approval hash invalidation, DNC and verified-recipient gates", () => {
  // Since migration 0008 a message is bound to an exact contact_channels row and an approval
  // must carry the hash recomputed from message + channel address.
  const channels = new Map<unknown, Row>();
  async function emailChannel(contact: Row, verifiedChannel = true): Promise<Row> {
    const key = `${String(contact.contact_id)}:${verifiedChannel}`;
    const cached = channels.get(key);
    if (cached) return cached;
    const created = await insert(f.db, "contact_channels", {
      channel_id: crypto.randomUUID(),
      contact_id: contact.contact_id,
      channel: "EMAIL",
      address: `${crypto.randomUUID().slice(0, 8)}@syntheticedu.example.invalid`,
      source_tier: "OFFICIAL",
      created_at: "2026-10-29T03:00:00Z",
      ...(verifiedChannel
        ? {
            verification_status: "VERIFIED",
            verification_method: "PARTNER_CONFIRMED",
            verified_by: f.staff.user_id,
            verified_at: "2026-10-29T03:00:00Z",
          }
        : {}),
    });
    channels.set(key, created);
    return created;
  }

  async function draft(extra: Row = {}, contact: Row = f.contact, cycle: Row = f.cycle) {
    const channel = await emailChannel(contact);
    return insert(f.db, "outreach_messages", {
      cycle_id: cycle.cycle_id,
      contact_id: contact.contact_id,
      channel_id: channel.channel_id,
      draft_content: "Selamat siang, kami dari AIESEC in PU.",
      subject: "Penjajakan kerja sama",
      channel: "EMAIL",
      ...extra,
    });
  }

  /** The hash exactly as the application computes it, evaluated by the database function. */
  async function hashOf(m: Row): Promise<string> {
    const { rows } = await f.db.query<{ h: string }>(
      `SELECT crm_outreach_approval_hash(m.message_id, m.cycle_id, m.contact_id, m.channel_id, m.channel, ch.address, m.subject, m.draft_content) AS h
         FROM outreach_messages m JOIN contact_channels ch ON ch.channel_id = m.channel_id WHERE m.message_id = $1`,
      [m.message_id],
    );
    return (rows[0] as { h: string }).h;
  }

  const approve = async (m: Row, by = f.staff) =>
    update(f.db, "outreach_messages", "message_id", m.message_id, {
      status: "APPROVED",
      approved_by: by.user_id,
      approved_at: "2026-10-29T03:00:00Z",
      approved_content_hash: await hashOf(m),
      approved_lint_version: 1,
    });

  it("one contact and one cycle can have many messages; follow-up attempts are capped at 3", async () => {
    await draft();
    await draft({ follow_up_attempt: 3 });
    await expectDbError(draft({ follow_up_attempt: 4 }), "follow_up_attempt");
    await expectDbError(draft({ follow_up_attempt: -1 }), "follow_up_attempt");
  });

  it("approval requires approver, time and hash together; a bare APPROVED status is rejected", async () => {
    const m = await draft();
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, { status: "APPROVED" }),
      // The 0008 guard trigger fires before the CHECK; either layer must refuse.
      /outreach_approval_complete|approver must be an active/,
    );
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        status: "APPROVED",
        approved_by: f.staff.user_id,
        approved_at: "2026-10-29T03:00:00Z",
      }),
      /outreach_approval_all_or_none|hash does not match/,
    );
    expect((await approve(m)).status).toBe("APPROVED");
  });

  it("rejects a malformed hash and an approval left on a DRAFT", async () => {
    const m = await draft();
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        status: "APPROVED",
        approved_by: f.staff.user_id,
        approved_at: "2026-10-29T03:00:00Z",
        approved_content_hash: "not-a-hash",
        approved_lint_version: 1,
      }),
      /approved_content_hash|hash does not match/,
    );
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        approved_by: f.staff.user_id,
      }),
      "outreach_approval_all_or_none",
    );
  });

  it("editing the text of an approved message invalidates the approval", async () => {
    const m = await approve(await draft());
    const edited = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      draft_content: "Teks yang diubah setelah disetujui.",
    });
    expect(edited.status).toBe("DRAFT");
    expect([edited.approved_by, edited.approved_at, edited.approved_content_hash]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("changing the channel or the recipient invalidates the approval", async () => {
    const byChannel = await update(
      f.db,
      "outreach_messages",
      "message_id",
      (await approve(await draft())).message_id,
      {
        channel: "WHATSAPP",
      },
    );
    expect(byChannel.status).toBe("DRAFT");
    expect(byChannel.approved_content_hash).toBeNull();

    const other = await newContact(f.db, f.partner.partner_id, {
      verification_status: "VERIFIED",
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
    });
    const byRecipient = await update(
      f.db,
      "outreach_messages",
      "message_id",
      (await approve(await draft())).message_id,
      {
        contact_id: other.contact_id,
      },
    );
    expect(byRecipient.status).toBe("DRAFT");
    expect(byRecipient.approved_by).toBeNull();
  });

  it("a non-content change keeps the approval", async () => {
    const m = await approve(await draft());
    const kept = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      follow_up_attempt: 1,
    });
    expect(kept.status).toBe("APPROVED");
    expect(kept.approved_content_hash).toBe(await hashOf(m));
  });

  it("sent messages are immutable (content, channel, recipient, hash)", async () => {
    const m = await approve(await draft());
    const sent = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      status: "SENT",
      sent_at: "2026-10-29T04:00:00Z",
    });
    expect(sent.status).toBe("SENT");
    for (const set of [
      { draft_content: "tampered after send" },
      { channel: "LINKEDIN" },
      { approved_content_hash: "b".repeat(64) },
    ]) {
      await expectDbError(
        update(f.db, "outreach_messages", "message_id", m.message_id, set),
        "immutable",
      );
    }
    // Logging the reply afterwards is still allowed.
    expect(
      (await update(f.db, "outreach_messages", "message_id", m.message_id, { status: "REPLIED" }))
        .status,
    ).toBe("REPLIED");
  });

  it("SENT requires a sent timestamp", async () => {
    const m = await approve(await draft());
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, { status: "SENT" }),
      "outreach_sent_has_timestamp",
    );
  });

  it("cannot draft, approve or send to a do-not-contact recipient", async () => {
    const dnc = await newContact(f.db, f.partner.partner_id, {
      verification_status: "VERIFIED",
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
      do_not_contact: true,
      dnc_reason: "Asked to stop",
      dnc_set_at: "2026-10-29T00:00:00Z",
      dnc_set_by: f.leadA.user_id,
    });
    await expectDbError(draft({}, dnc), "do-not-contact");
  });

  it("a recipient who becomes do-not-contact after approval cannot be sent to", async () => {
    const c = await newContact(f.db, f.partner.partner_id, {
      verification_status: "VERIFIED",
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
    });
    const m = await approve(await draft({}, c));
    await update(f.db, "contacts", "contact_id", c.contact_id, {
      do_not_contact: true,
      dnc_reason: "Asked to stop",
      dnc_set_at: "2026-10-30T00:00:00Z",
      dnc_set_by: f.leadB.user_id,
    });
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        status: "SENT",
        sent_at: "2026-10-30T01:00:00Z",
      }),
      "do-not-contact",
    );
    // The pending message can still be cancelled.
    expect(
      (await update(f.db, "outreach_messages", "message_id", m.message_id, { status: "CANCELLED" }))
        .status,
    ).toBe("CANCELLED");
  });

  it("cannot approve or send to an unverified, pending or failed recipient (drafting is allowed)", async () => {
    for (const status of ["UNVERIFIED", "PENDING", "FAILED"]) {
      const c = await newContact(f.db, f.partner.partner_id, { verification_status: status });
      const m = await draft({}, c);
      expect(m.status).toBe("DRAFT");
      await expectDbError(approve(m), "recipient must be verified");
    }
  });

  it("the contact must belong to the cycle's partner", async () => {
    const otherPartner = await newPartner(f.db, f.category.category_id);
    const foreign = await newContact(f.db, otherPartner.partner_id);
    await expectDbError(draft({}, foreign), "does not belong to the cycle");
  });
});

describe("rate card, packages and proposals", () => {
  // Since migration 0009 only DRAFT versions are editable, so tests that build catalog rows use
  // a fresh draft "sandbox" card; the ACTIVE fixture card is used to check it is frozen.
  async function sandbox(extra: Row = {}): Promise<Row> {
    return insert(f.db, "rate_cards", {
      name: uniq("Sandbox Card"),
      version: 1,
      effective_from: "2026-01-01",
      owner_id: f.leadA.user_id,
      ...extra,
    });
  }
  const sandboxItem = (card: Row, extra: Row = {}) =>
    insert(f.db, "rate_card_items", {
      rate_card_id: card.rate_card_id,
      category: "BRANDING",
      benefit_name: uniq("Benefit"),
      monetized_unit_value: 100000,
      unit: "slot",
      ...extra,
    });

  it("versions are consecutive per name, start as DRAFT, and at most one can be a draft or ACTIVE", async () => {
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: f.card.name,
        version: 1,
        effective_from: "2026-01-01",
        owner_id: f.leadA.user_id,
      }),
      /rate_cards_name_version_key|consecutive/,
    );
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: f.card.name,
        version: 2,
        status: "ACTIVE",
        effective_from: "2027-01-01",
        owner_id: f.leadA.user_id,
      }),
      "starts as DRAFT",
    );
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: f.card.name,
        version: 3,
        effective_from: "2027-01-01",
        owner_id: f.leadA.user_id,
      }),
      "consecutive",
    );
    const v2 = await insert(f.db, "rate_cards", {
      name: f.card.name,
      version: 2,
      effective_from: "2027-01-01",
      owner_id: f.leadA.user_id,
    });
    expect(v2.status).toBe("DRAFT"); // a new version coexists with the historic one
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: f.card.name,
        version: 3,
        effective_from: "2027-06-01",
        owner_id: f.leadA.user_id,
      }),
      "rate_cards_one_draft_key",
    );
  });

  it("rejects negative values, bad periods and non-3-letter currencies", async () => {
    const card = await sandbox();
    await expectDbError(sandboxItem(card, { monetized_unit_value: -1 }), "monetized_unit_value");
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: uniq("c"),
        version: 1,
        effective_from: "2026-05-01",
        effective_to: "2026-04-01",
        owner_id: f.leadA.user_id,
      }),
      "rate_cards_period",
    );
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: uniq("c"),
        version: 1,
        currency: "rupiah",
        effective_from: "2026-05-01",
        owner_id: f.leadA.user_id,
      }),
      /currency|value too long/,
    );
  });

  it("items need an existing benefit category and are unique per card", async () => {
    const card = await sandbox();
    const item = await sandboxItem(card);
    await expectDbError(sandboxItem(card, { category: "NOPE" }), "foreign key");
    await expectDbError(
      sandboxItem(card, { benefit_name: item.benefit_name }),
      "rate_card_items_unique_benefit",
    );
  });

  it("package benefits are many-to-many but cannot mix rate-card versions or repeat a benefit", async () => {
    const card = await sandbox();
    const item = await sandboxItem(card);
    const pkg = await insert(f.db, "rate_card_packages", {
      rate_card_id: card.rate_card_id,
      package_name: uniq("Community"),
      listed_price: 500000,
    });
    const link = {
      package_id: pkg.package_id,
      rate_card_item_id: item.rate_card_item_id,
      rate_card_id: card.rate_card_id,
      included_qty: 2,
    };
    await insert(f.db, "rate_card_package_benefits", link);
    await expectDbError(
      insert(f.db, "rate_card_package_benefits", link),
      "package_benefits_unique",
    );

    const other = await sandbox();
    const otherItem = await sandboxItem(other);
    await expectDbError(
      insert(f.db, "rate_card_package_benefits", {
        package_id: pkg.package_id,
        rate_card_item_id: otherItem.rate_card_item_id,
        rate_card_id: card.rate_card_id,
        included_qty: 1,
      }),
      "package_benefits_item_fk",
    );
    const second = await sandboxItem(card);
    await expectDbError(
      insert(f.db, "rate_card_package_benefits", {
        ...link,
        rate_card_item_id: second.rate_card_item_id,
        included_qty: 0,
      }),
      "included_qty",
    );
  });

  it("pricing mode and package reference are consistent", async () => {
    // Proposals may only use packages of a frozen (ACTIVE/RETIRED) version, so activate first.
    const card = await sandbox();
    await sandboxItem(card);
    const pkg = await insert(f.db, "rate_card_packages", {
      rate_card_id: card.rate_card_id,
      package_name: uniq("Brand"),
      listed_price: 1500000,
    });
    await update(f.db, "rate_cards", "rate_card_id", card.rate_card_id, { status: "ACTIVE" });
    const base = { cycle_id: f.cycle.cycle_id, calculated_value: 1500000 };
    await insert(f.db, "proposals", {
      ...base,
      pricing_mode: "PACKAGE",
      package_id: pkg.package_id,
    });
    await insert(f.db, "proposals", {
      ...base,
      pricing_mode: "HYBRID",
      package_id: pkg.package_id,
    });
    await expectDbError(
      insert(f.db, "proposals", { ...base, pricing_mode: "PACKAGE" }),
      "proposals_mode_package",
    );
    await expectDbError(
      insert(f.db, "proposals", { ...base, pricing_mode: "CUSTOM", package_id: pkg.package_id }),
      "proposals_mode_package",
    );
    await expectDbError(
      insert(f.db, "proposals", { ...base, pricing_mode: "FREE" }),
      /pricing_mode|proposals_mode_package/,
    );
  });

  it("a SENT proposal requires a sent timestamp; one cycle can have many proposals", async () => {
    await expectDbError(
      insert(f.db, "proposals", {
        cycle_id: f.cycle.cycle_id,
        pricing_mode: "CUSTOM",
        calculated_value: 1,
        status: "SENT",
      }),
      /proposals_sent_has_timestamp|created as DRAFT/,
    );
    await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 1,
    });
    await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 2,
    });
    const { rows } = await f.db.query("SELECT 1 FROM proposals WHERE cycle_id = $1", [
      f.cycle.cycle_id,
    ]);
    expect(rows.length).toBeGreaterThan(1);
  });

  it("proposal lines snapshot name/unit/version and cannot repeat a benefit", async () => {
    const line = {
      proposal_id: f.proposal.proposal_id,
      rate_card_item_id: f.item.rate_card_item_id,
      quantity: 2.5,
      agreed_unit_value: 400000,
      line_total_value: 1000000,
      contribution_type: "FINANCIAL",
      benefit_name_snapshot: "Logo placement",
      unit_snapshot: "slot",
      rate_card_version_snapshot: 1,
    };
    const created = await insert(f.db, "proposal_benefits", line);
    expect(created.quantity).toBe("2.500"); // fractional quantities are supported
    await expectDbError(
      insert(f.db, "proposal_benefits", line),
      "proposal_benefits_once_per_proposal",
    );
    const p2 = await insert(f.db, "proposals", {
      cycle_id: f.cycle.cycle_id,
      pricing_mode: "CUSTOM",
      calculated_value: 1,
    });
    await expectDbError(
      insert(f.db, "proposal_benefits", {
        ...line,
        proposal_id: p2.proposal_id,
        quantity: 0,
        line_total_value: 0,
      }),
      "quantity",
    );
    await expectDbError(
      insert(f.db, "proposal_benefits", {
        ...line,
        proposal_id: p2.proposal_id,
        contribution_type: "BARTER",
      }),
      "contribution_type",
    );
  });

  it("a historic proposal line is untouched: the ACTIVE catalog cannot be edited, and a new version leaves it alone", async () => {
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
    // The live (ACTIVE) version cannot be edited at all...
    await expectDbError(
      update(f.db, "rate_card_items", "rate_card_item_id", f.item.rate_card_item_id, {
        monetized_unit_value: 900000,
      }),
      "historic rate card versions are immutable",
    );
    // ...and a new draft version with a different value does not reach the stored snapshot.
    const draft = await sandbox();
    await sandboxItem(draft, { monetized_unit_value: 900000, benefit_name: "Logo placement" });
    const { rows } = await f.db.query<Row>(
      "SELECT agreed_unit_value, line_total_value FROM proposal_benefits WHERE proposal_benefit_id = $1",
      [line.proposal_benefit_id],
    );
    expect(rows[0]).toEqual({ agreed_unit_value: 500000, line_total_value: 500000 });
  });

  it("an owner is required and must exist", async () => {
    await expectDbError(
      insert(f.db, "rate_cards", {
        name: uniq("c"),
        version: 1,
        effective_from: "2026-01-01",
        owner_id: crypto.randomUUID(),
      }),
      "foreign key",
    );
  });
});
