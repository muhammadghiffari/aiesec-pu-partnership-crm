/** Integrity tests for migration 0007 (contact channels and candidates) on real PostgreSQL. */

import { beforeAll, describe, expect, it } from "vitest";
import {
  buildFixture,
  expectDbError,
  type Fixture,
  insert,
  newContact,
  type Row,
  update,
} from "./test-support";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

const channel = (extra: Row = {}): Row => ({
  channel_id: crypto.randomUUID(),
  contact_id: f.contact.contact_id,
  channel: "EMAIL",
  address: `${crypto.randomUUID().slice(0, 8)}@syntheticedu.example.invalid`,
  source_tier: "OFFICIAL",
  created_at: "2026-10-29T03:00:00Z",
  ...extra,
});
const verified = { verification_status: "VERIFIED", verified_at: "2026-10-29T04:00:00Z" };

describe("contact_channels", () => {
  it("stores channel addresses in canonical form only", async () => {
    await insert(f.db, "contact_channels", channel());
    await insert(
      f.db,
      "contact_channels",
      channel({ channel: "WHATSAPP", address: "+6281234567890" }),
    );
    await insert(
      f.db,
      "contact_channels",
      channel({ channel: "LINKEDIN", address: "https://www.linkedin.com/in/synthetic-pic" }),
    );
    await expectDbError(
      insert(f.db, "contact_channels", channel({ address: "Mixed@Example.invalid" })),
      "contact_channels_email_shape",
    );
    await expectDbError(
      insert(f.db, "contact_channels", channel({ channel: "WHATSAPP", address: "0812 3456 7890" })),
      "contact_channels_phone_shape",
    );
    await expectDbError(
      insert(
        f.db,
        "contact_channels",
        channel({ channel: "LINKEDIN", address: "https://www.linkedin.com/in/x?trk=1" }),
      ),
      "contact_channels_linkedin_shape",
    );
    await expectDbError(
      insert(f.db, "contact_channels", channel({ channel: "FAX", address: "+6221555" })),
      "channel",
    );
  });

  it("one address per contact and channel type", async () => {
    const c = channel({ address: "dup@syntheticedu.example.invalid" });
    await insert(f.db, "contact_channels", c);
    await expectDbError(
      insert(f.db, "contact_channels", { ...c, channel_id: crypto.randomUUID() }),
      "contact_channels_unique_address",
    );
  });

  it("VERIFIED needs method, verifier and time; page-based methods need an evidence URL", async () => {
    await expectDbError(
      insert(f.db, "contact_channels", channel({ ...verified })),
      "contact_channels_verified_complete",
    );
    await expectDbError(
      insert(
        f.db,
        "contact_channels",
        channel({
          ...verified,
          verification_method: "OFFICIAL_WEBSITE",
          verified_by: f.staff.user_id,
        }),
      ),
      "contact_channels_verified_complete",
    );
    await insert(
      f.db,
      "contact_channels",
      channel({
        ...verified,
        verification_method: "OFFICIAL_WEBSITE",
        verified_by: f.staff.user_id,
        evidence_url: "https://syntheticedu.example.invalid/team",
      }),
    );
    await insert(
      f.db,
      "contact_channels",
      channel({
        ...verified,
        verification_method: "PARTNER_CONFIRMED",
        verified_by: f.staff.user_id,
      }),
    );
  });

  it("UNVERIFIED rows carry no verification data", async () => {
    await expectDbError(
      insert(f.db, "contact_channels", channel({ verified_by: f.staff.user_id })),
      "contact_channels_unverified_clean",
    );
  });

  it("the address of a channel is immutable; verification status may change", async () => {
    const c = await insert(f.db, "contact_channels", channel());
    await expectDbError(
      update(f.db, "contact_channels", "channel_id", c.channel_id, {
        address: "other@syntheticedu.example.invalid",
      }),
      "immutable",
    );
    await expectDbError(
      update(f.db, "contact_channels", "channel_id", c.channel_id, { channel: "PHONE" }),
      /immutable|phone_shape/,
    );
    const other = await newContact(f.db, f.partner.partner_id);
    await expectDbError(
      update(f.db, "contact_channels", "channel_id", c.channel_id, {
        contact_id: other.contact_id,
      }),
      "immutable",
    );
    const failed = await update(f.db, "contact_channels", "channel_id", c.channel_id, {
      verification_status: "FAILED",
      verified_by: f.staff.user_id,
      verified_at: "2026-10-30T00:00:00Z",
    });
    expect(failed.verification_status).toBe("FAILED");
  });
});

describe("contact_candidates", () => {
  const cand = (extra: Row = {}): Row => ({
    candidate_id: crypto.randomUUID(),
    partner_id: f.partner.partner_id,
    name: "Synthetic PIC",
    channel: "EMAIL",
    address: `${crypto.randomUUID().slice(0, 8)}@syntheticedu.example.invalid`,
    source_url: "https://syntheticedu.example.invalid/team",
    source_tier: "UNVERIFIED",
    provider: "SYNTHETIC_API",
    retrieved_at: "2026-10-29T03:00:00Z",
    requested_by: f.staff.user_id,
    ...extra,
  });

  it("requires provenance: source URL, provider and requester", async () => {
    await insert(f.db, "contact_candidates", cand());
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ source_url: null })),
      "null value",
    );
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ source_url: "ftp://x.example.invalid" })),
      "source_url",
    );
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ provider: "scraper v2!" })),
      "provider",
    );
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ requested_by: crypto.randomUUID() })),
      "foreign key",
    );
  });

  it("only one PENDING candidate per partner, channel and address (case-insensitive)", async () => {
    await insert(
      f.db,
      "contact_candidates",
      cand({ address: "same@syntheticedu.example.invalid" }),
    );
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ address: "SAME@syntheticedu.example.invalid" })),
      "contact_candidates_pending_key",
    );
    await insert(
      f.db,
      "contact_candidates",
      cand({
        address: "same@syntheticedu.example.invalid",
        review_status: "REJECTED",
        reviewed_by: f.staff.user_id,
        reviewed_at: "2026-10-29T05:00:00Z",
        review_reason: "Not the PIC",
      }),
    );
  });

  it("review states are complete and exclusive", async () => {
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ reviewed_by: f.staff.user_id })),
      "contact_candidates_pending_clean",
    );
    const reviewed = { reviewed_by: f.staff.user_id, reviewed_at: "2026-10-29T05:00:00Z" };
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ review_status: "ACCEPTED", ...reviewed })),
      "contact_candidates_accepted_complete",
    );
    await insert(
      f.db,
      "contact_candidates",
      cand({ review_status: "ACCEPTED", ...reviewed, accepted_contact_id: f.contact.contact_id }),
    );
    await expectDbError(
      insert(f.db, "contact_candidates", cand({ review_status: "REJECTED", ...reviewed })),
      "contact_candidates_rejected_reason",
    );
    await expectDbError(
      insert(
        f.db,
        "contact_candidates",
        cand({
          review_status: "REJECTED",
          ...reviewed,
          review_reason: "No",
          accepted_contact_id: f.contact.contact_id,
        }),
      ),
      "contact_candidates_rejected_reason",
    );
  });

  it("has no column for provider-claimed verification or consent", async () => {
    const { rows } = await f.db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'contact_candidates' AND column_name ~* '(verif|consent|dnc|opt)'",
    );
    expect(rows).toEqual([]);
  });
});
