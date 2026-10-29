/**
 * Integrity tests for migration 0008: approvals are bound to the exact channel row and a hash
 * the database recomputes, and the hash matches the application's (packages/core).
 */

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { type ApprovalPayload, approvalHash } from "../../core/src/outreach/hash";
import { migrateDown, migrateUp } from "./migrate";
import { MIGRATIONS } from "./migrations/index";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  newContact,
  type Row,
  uniq,
  update,
} from "./test-support";

let f: Fixture;
let channel: Row;
beforeAll(async () => {
  f = await buildFixture();
  channel = await verifiedChannel(f.contact);
});

async function verifiedChannel(contact: Row, extra: Row = {}): Promise<Row> {
  return insert(f.db, "contact_channels", {
    channel_id: crypto.randomUUID(),
    contact_id: contact.contact_id,
    channel: "EMAIL",
    address: `${uniq("pic")}@syntheticedu.example.invalid`,
    source_tier: "OFFICIAL",
    created_at: "2026-10-29T03:00:00Z",
    verification_status: "VERIFIED",
    verification_method: "PARTNER_CONFIRMED",
    verified_by: f.staff.user_id,
    verified_at: "2026-10-29T03:00:00Z",
    ...extra,
  });
}

async function draft(extra: Row = {}, ch: Row = channel, contact: Row = f.contact): Promise<Row> {
  return insert(f.db, "outreach_messages", {
    cycle_id: f.cycle.cycle_id,
    contact_id: contact.contact_id,
    channel_id: ch.channel_id,
    channel: ch.channel,
    subject: "Penjajakan kerja sama",
    draft_content: "Yth. Ibu Sinta,\nKami ingin berdiskusi tentang kerja sama.",
    ...extra,
  });
}

async function sqlHash(m: Row, address: string): Promise<string> {
  const { rows } = await f.db.query<{ h: string }>(
    "SELECT crm_outreach_approval_hash($1,$2,$3,$4,$5,$6,$7,$8) AS h",
    [
      m.message_id,
      m.cycle_id,
      m.contact_id,
      m.channel_id,
      m.channel,
      address,
      m.subject,
      m.draft_content,
    ],
  );
  return (rows[0] as { h: string }).h;
}

const approveWith = (m: Row, hash: string, by: Row = f.staff) =>
  update(f.db, "outreach_messages", "message_id", m.message_id, {
    status: "APPROVED",
    approved_by: by.user_id,
    approved_at: "2026-10-29T04:00:00Z",
    approved_content_hash: hash,
    approved_lint_version: 1,
  });

describe("hash parity between the application and the database", () => {
  const texts: [string, string | null, string][] = [
    ["plain", "Subjek", "Isi pesan"],
    ["null subject", null, "Isi pesan tanpa subjek"],
    ["empty subject", "", "Isi pesan"],
    ["multi-byte", "Penjajakan é 😀", "Halo ☕ — « teks » \n baris kedua\r\nketiga"],
    ["field-like text", "x\nbody=5:hello", "\nbody=5:hello"],
    ["trailing space", "Subjek", "Isi pesan "],
  ];
  it.each(texts)("%s", async (_n, subject, body) => {
    const m = await draft({ subject, draft_content: body }, channel);
    const payload: ApprovalPayload = {
      messageId: String(m.message_id),
      cycleId: String(m.cycle_id),
      contactId: String(m.contact_id),
      channelId: String(m.channel_id),
      channel: String(m.channel),
      address: String(channel.address),
      subject,
      body,
    };
    expect(await sqlHash(m, String(channel.address))).toBe(await approvalHash(payload));
  });
});

describe("approval needs the exact verified channel row and the correct hash", () => {
  it("accepts the correct hash and stores actor, time and lint version", async () => {
    const m = await draft();
    const a = await approveWith(m, await sqlHash(m, String(channel.address)));
    expect(a).toMatchObject({
      status: "APPROVED",
      approved_by: f.staff.user_id,
      approved_lint_version: 1,
    });
  });

  it("rejects a wrong hash, including a hash of other content", async () => {
    const m = await draft();
    const other = await draft({ draft_content: "Isi lain sama sekali untuk pesan yang berbeda." });
    await expectDbError(approveWith(m, "a".repeat(64)), "hash does not match");
    await expectDbError(
      approveWith(m, await sqlHash(other, String(channel.address))),
      "hash does not match",
    );
  });

  it("rejects approval without a channel row, with another contact's channel, or the wrong type", async () => {
    const orphan = await draft({ channel_id: null });
    await expectDbError(approveWith(orphan, "a".repeat(64)), "requires a channel row");

    const otherContact = await newContact(f.db, f.partner.partner_id, {
      verification_status: "VERIFIED",
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
    });
    const foreign = await verifiedChannel(otherContact);
    const swapped = await draft({ channel_id: foreign.channel_id });
    await expectDbError(
      approveWith(swapped, await sqlHash(swapped, String(foreign.address))),
      "requires a channel row",
    );

    const wa = await verifiedChannel(f.contact, { channel: "WHATSAPP", address: "+6281234567890" });
    const wrongType = await draft({ channel_id: wa.channel_id, channel: "EMAIL" });
    await expectDbError(
      approveWith(wrongType, await sqlHash(wrongType, String(wa.address))),
      "requires a channel row",
    );
  });

  it("rejects approval or send on an unverified or failed channel", async () => {
    for (const status of ["UNVERIFIED", "FAILED"]) {
      const extra =
        status === "FAILED"
          ? {
              verification_status: "FAILED",
              verification_method: null,
              verified_by: f.staff.user_id,
              verified_at: "2026-10-29T03:00:00Z",
            }
          : {
              verification_status: "UNVERIFIED",
              verification_method: null,
              verified_by: null,
              verified_at: null,
            };
      const ch = await verifiedChannel(f.contact, extra);
      const m = await draft({}, ch);
      await expectDbError(
        approveWith(m, await sqlHash(m, String(ch.address))),
        "channel must be verified",
      );
    }
  });

  it("rejects an approver who is a viewer or inactive", async () => {
    const m = await draft();
    const hash = await sqlHash(m, String(channel.address));
    await expectDbError(approveWith(m, hash, f.viewer), "approver must be an active");
    const gone = await insert(f.db, "users", {
      email: `${uniq("gone")}@example.invalid`,
      name: "x",
      access_role: "BD_STAFF",
      is_active: false,
    });
    await expectDbError(approveWith(m, hash, gone), "approver must be an active");
  });

  it("a lint version is required with a hash and forbidden without one", async () => {
    const m = await draft();
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        status: "APPROVED",
        approved_by: f.staff.user_id,
        approved_at: "2026-10-29T04:00:00Z",
        approved_content_hash: await sqlHash(m, String(channel.address)),
      }),
      /outreach_lint_with_approval/,
    );
  });
});

describe("any change to what was approved clears the approval", () => {
  async function approvedMessage(): Promise<Row> {
    const m = await draft();
    return approveWith(m, await sqlHash(m, String(channel.address)));
  }

  it("subject change", async () => {
    const m = await approvedMessage();
    const r = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      subject: "Subjek baru",
    });
    expect(r).toMatchObject({
      status: "DRAFT",
      approved_by: null,
      approved_at: null,
      approved_content_hash: null,
      approved_lint_version: null,
    });
  });

  it("body change", async () => {
    const m = await approvedMessage();
    const r = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      draft_content: `${m.draft_content} `,
    });
    expect(r).toMatchObject({ status: "DRAFT", approved_content_hash: null });
  });

  it("switching to another channel row of the same contact", async () => {
    const m = await approvedMessage();
    const other = await verifiedChannel(f.contact);
    const r = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      channel_id: other.channel_id,
    });
    expect(r).toMatchObject({
      status: "DRAFT",
      approved_content_hash: null,
      approved_lint_version: null,
    });
  });

  it("re-approving after the edit needs the NEW hash", async () => {
    const m = await approvedMessage();
    const old = String(m.approved_content_hash);
    const edited = await update(f.db, "outreach_messages", "message_id", m.message_id, {
      draft_content: "Isi pesan yang sudah diubah setelah persetujuan.",
    });
    await expectDbError(approveWith(edited, old), "hash does not match");
    expect((await approveWith(edited, await sqlHash(edited, String(channel.address)))).status).toBe(
      "APPROVED",
    );
  });

  it("an address cannot be changed under an approval (channel addresses are immutable)", async () => {
    await expectDbError(
      update(f.db, "contact_channels", "channel_id", channel.channel_id, {
        address: "swapped@syntheticedu.example.invalid",
      }),
      "immutable",
    );
  });

  it("a sent message cannot have its approval changed", async () => {
    const m = await approvedMessage();
    await update(f.db, "outreach_messages", "message_id", m.message_id, {
      status: "SENT",
      sent_at: "2026-10-29T05:00:00Z",
    });
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        approved_by: f.leadA.user_id,
      }),
      "immutable",
    );
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, { subject: "dirubah" }),
      "immutable",
    );
  });

  it("do-not-contact set after approval blocks the send", async () => {
    const contact = await newContact(f.db, f.partner.partner_id, {
      verification_status: "VERIFIED",
      verified_at: "2026-10-29T00:00:00Z",
      verified_by: f.staff.user_id,
    });
    const ch = await verifiedChannel(contact);
    const m = await draft({}, ch, contact);
    await approveWith(m, await sqlHash(m, String(ch.address)));
    await update(f.db, "contacts", "contact_id", contact.contact_id, {
      do_not_contact: true,
      dnc_reason: "Asked to stop",
      dnc_set_at: "2026-10-30T00:00:00Z",
      dnc_set_by: f.leadA.user_id,
    });
    await expectDbError(
      update(f.db, "outreach_messages", "message_id", m.message_id, {
        status: "SENT",
        sent_at: "2026-10-30T01:00:00Z",
      }),
      "do-not-contact",
    );
  });
});

describe("AI provenance and legacy rows", () => {
  it("an AI draft carries a template id; a human draft must not", async () => {
    await draft({ draft_source: "AI", ai_template: "outreach.draft@1" });
    await expectDbError(draft({ draft_source: "AI" }), "outreach_ai_template_iff_ai");
    await expectDbError(draft({ ai_template: "outreach.draft@1" }), "outreach_ai_template_iff_ai");
    await expectDbError(
      draft({ draft_source: "AI", ai_template: "full prompt text here" }),
      "ai_template",
    );
  });

  it("a draft without a channel row can exist but can never be approved (backfill rule)", async () => {
    const m = await draft({ channel_id: null });
    await expectDbError(approveWith(m, "a".repeat(64)), "requires a channel row");
  });
});

describe("rollback restores the previous guard", () => {
  it("down(8) removes the new columns and functions and re-installs the 0002 guard; up restores 0008", async () => {
    const db = new PGlite();
    await migrateUp(db, MIGRATIONS);
    expect(await migrateDown(db, MIGRATIONS, 7)).toEqual([8]);

    const cols = await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='outreach_messages' AND column_name IN ('channel_id','subject','language','approved_lint_version','draft_source','ai_template')",
    );
    expect(cols.rows).toHaveLength(0);
    const fns = await db.query(
      "SELECT proname FROM pg_proc WHERE proname IN ('crm_outreach_approval_hash','crm_hash_field')",
    );
    expect(fns.rows).toHaveLength(0);
    const guard = await db.query<{ src: string }>(
      "SELECT prosrc AS src FROM pg_proc WHERE proname='outreach_messages_guard'",
    );
    expect((guard.rows[0] as { src: string }).src).not.toContain("crm_outreach_approval_hash");
    expect((guard.rows[0] as { src: string }).src).toContain(
      "sent outreach content, recipient and channel are immutable",
    );

    await migrateUp(db, MIGRATIONS);
    const guard2 = await db.query<{ src: string }>(
      "SELECT prosrc AS src FROM pg_proc WHERE proname='outreach_messages_guard'",
    );
    expect((guard2.rows[0] as { src: string }).src).toContain("crm_outreach_approval_hash");
  });
});
