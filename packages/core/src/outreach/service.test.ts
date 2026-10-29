import { describe, expect, it } from "vitest";
import type { ContactRecord } from "../contacts/types";
import { approvalHash } from "./hash";
import {
  buildOutreachHarness,
  CHANNEL_ID,
  CONTACT_ID,
  CYCLE_ID,
  GOOD_BODY,
  SECOND_CHANNEL_ID,
  verifiedChannel,
} from "./test-support";

type H = Awaited<ReturnType<typeof buildOutreachHarness>>;

/** Update the stored contact (typed; no casts). */
function patchContact(h: H, patch: Partial<ContactRecord>) {
  const current = h.contactRepo.contacts.get(CONTACT_ID);
  if (!current) throw new Error("fixture contact missing");
  h.contactRepo.contacts.set(CONTACT_ID, { ...current, ...patch });
}

async function approved(h: H) {
  const { staff, message } = await h.newDraft();
  const r = await h.approveAs(staff, message.messageId);
  if (!r.ok) throw new Error(`approve failed: ${r.code}`);
  return { staff, message: r.value };
}

describe("drafts", () => {
  it("creates a DRAFT bound to the exact contact and channel row, with an audit event and no text in the log", async () => {
    const h = await buildOutreachHarness();
    const { message } = await h.newDraft();
    expect(message).toMatchObject({
      status: "DRAFT",
      contactId: CONTACT_ID,
      channelId: CHANNEL_ID,
      channel: "EMAIL",
      approvedBy: null,
      approvedContentHash: null,
      draftSource: "HUMAN",
    });
    const events = await h.auditStore.list({ entityType: "outreach_message" });
    expect(events).toHaveLength(1);
    const logged = JSON.stringify(events);
    expect(logged).not.toContain("AIESEC in Universitas Padjadjaran");
    expect(logged).not.toContain("Penjajakan");
    expect(logged).not.toContain("example.invalid");
  });

  it("may be drafted for an unverified recipient, but cannot then be approved", async () => {
    const h = await buildOutreachHarness();
    patchContact(h, { verificationStatus: "UNVERIFIED" });
    const { staff, message } = await h.newDraft();
    expect(message.status).toBe("DRAFT");
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    expect(p).toMatchObject({
      ok: true,
      value: { readiness: { ready: false, blockers: ["CONTACT_NOT_VERIFIED"] } },
    });
    expect(
      await h.outreach.approve(staff, {
        messageId: message.messageId,
        reviewedHash: p.ok ? p.value.contentHash : "",
      }),
    ).toMatchObject({
      ok: false,
      code: "NOT_READY",
      blockers: ["CONTACT_NOT_VERIFIED"],
    });
  });

  it("is refused for a do-not-contact recipient (no draft at all)", async () => {
    const h = await buildOutreachHarness();
    patchContact(h, { doNotContact: true });
    const staff = await h.login("staff@example.invalid");
    expect(await h.outreach.createDraft(staff, h.draftInput())).toMatchObject({
      ok: false,
      code: "CONTACT_DNC",
      httpStatus: 409,
    });
    expect(h.outreachRepo.messages.size).toBe(0);
  });

  it("rejects an unknown cycle, a contact of another partner, a channel of another contact and phone", async () => {
    const h = await buildOutreachHarness();
    const staff = await h.login("staff@example.invalid");
    expect(
      await h.outreach.createDraft(
        staff,
        h.draftInput({ cycleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      ),
    ).toMatchObject({ code: "CYCLE_NOT_FOUND" });
    h.outreachRepo.cyclePartner.set("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "other-partner");
    expect(
      await h.outreach.createDraft(
        staff,
        h.draftInput({ cycleId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
      ),
    ).toMatchObject({ code: "CONTACT_NOT_FOUND" });
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        contactId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        address: "x@syntheticedu.example.invalid",
      }),
    );
    expect(
      await h.outreach.createDraft(staff, h.draftInput({ channelId: SECOND_CHANNEL_ID })),
    ).toMatchObject({ code: "CHANNEL_NOT_FOUND" });
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        channel: "PHONE",
        address: "+6281234567890",
      }),
    );
    expect(
      await h.outreach.createDraft(staff, h.draftInput({ channelId: SECOND_CHANNEL_ID })),
    ).toMatchObject({ code: "CHANNEL_MISMATCH" });
    expect(h.outreachRepo.messages.size).toBe(0);
  });

  it("validates input strictly (no forged status, approval fields or sender)", async () => {
    const h = await buildOutreachHarness();
    const staff = await h.login("staff@example.invalid");
    for (const extra of [
      { status: "APPROVED" },
      { approvedBy: "u-staff" },
      { approvedContentHash: "a".repeat(64) },
      { sentAt: "2026-10-29" },
      { body: "" },
      { language: "fr" },
      { draftSource: "AI" },
    ]) {
      expect(
        await h.outreach.createDraft(staff, h.draftInput(extra)),
        JSON.stringify(extra),
      ).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    }
  });

  it("records AI provenance as a template id, never the prompt", async () => {
    const h = await buildOutreachHarness();
    const { message } = await h.newDraft({ draftSource: "AI", aiTemplate: "outreach.draft@1" });
    expect(message).toMatchObject({
      draftSource: "AI",
      aiTemplate: "outreach.draft@1",
      status: "DRAFT",
    });
  });

  it("viewers and anonymous callers cannot draft", async () => {
    const h = await buildOutreachHarness();
    for (const token of [await h.login("viewer@example.invalid"), undefined]) {
      expect((await h.outreach.createDraft(token, h.draftInput())).ok).toBe(false);
    }
    expect(h.outreachRepo.messages.size).toBe(0);
  });
});

describe("approval is bound to the exact content", () => {
  it("approves a clean draft with actor, time, lint version and the content hash", async () => {
    const h = await buildOutreachHarness();
    const { message } = await approved(h);
    const expected = await approvalHash({
      messageId: message.messageId,
      cycleId: CYCLE_ID,
      contactId: CONTACT_ID,
      channelId: CHANNEL_ID,
      channel: "EMAIL",
      address: "pic@syntheticedu.example.invalid",
      subject: message.subject,
      body: message.body,
    });
    expect(message).toMatchObject({
      status: "APPROVED",
      approvedBy: "u-staff",
      approvedContentHash: expected,
      approvedLintVersion: 1,
    });
    expect(message.approvedAt).toEqual(h.clock.now());
    const [event] = await h.auditStore.list({ kind: "APPROVAL" });
    expect(event).toMatchObject({
      actorUserId: "u-staff",
      entityId: message.messageId,
      metadata: { approvedContentHash: expected, lintVersion: 1 },
    });
  });

  it("BD staff may approve their own message (PRD §11); a CRM Lead may too", async () => {
    const h = await buildOutreachHarness();
    const { message } = await h.newDraft();
    const lead = await h.login("tlbd@example.invalid");
    expect((await h.approveAs(lead, message.messageId)).ok).toBe(true);
    expect(h.outreachRepo.messages.get(message.messageId)?.approvedBy).toBe("u-tlbd");
  });

  it("a stale reviewed hash is refused: the approver must have seen the current version", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    const preview = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    if (!preview.ok) throw new Error();
    // Someone edits the text after the approver opened the preview.
    await h.outreach.editDraft(staff, {
      messageId: message.messageId,
      body: `${GOOD_BODY}\n\nP.S. Kami juga dapat hadir di kampus Ibu.`,
    });
    expect(
      await h.outreach.approve(staff, {
        messageId: message.messageId,
        reviewedHash: preview.value.contentHash,
      }),
    ).toMatchObject({
      ok: false,
      code: "STALE_CONTENT",
      httpStatus: 409,
    });
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("DRAFT");
    // Re-previewing yields the new hash, which is accepted.
    expect((await h.approveAs(staff, message.messageId)).ok).toBe(true);
  });

  it("rejects a malformed or foreign reviewed hash", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    expect(
      await h.outreach.approve(staff, { messageId: message.messageId, reviewedHash: "nope" }),
    ).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      await h.outreach.approve(staff, {
        messageId: message.messageId,
        reviewedHash: "0".repeat(64),
      }),
    ).toMatchObject({ code: "STALE_CONTENT" });
  });

  it("lint ERRORs block approval and name the rules without echoing text", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft({
      body: `${GOOD_BODY}\nSalam {{nama}} ${"sk"}-${"z".repeat(24)}`,
    });
    const r = await h.approveAs(staff, message.messageId);
    expect(r).toMatchObject({ ok: false, code: "LINT_FAILED", httpStatus: 422 });
    const rules = (r.ok ? [] : (r.findings ?? [])).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(["PLACEHOLDER_LEFT", "SECRET_LIKE"]));
    expect(JSON.stringify(r)).not.toContain("zzzz");
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("DRAFT");
  });

  it("lint WARNINGs do not block but are counted in the audit record", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft({ body: `${GOOD_BODY}\nTerima kasih!!` });
    expect((await h.approveAs(staff, message.messageId)).ok).toBe(true);
    expect((await h.auditStore.list({ kind: "APPROVAL" }))[0]?.metadata.lintWarnings).toBe(1);
  });

  it("approving twice, or approving a sent message, is refused", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    expect(await h.approveAs(staff, message.messageId)).toMatchObject({ code: "ALREADY_APPROVED" });
    await h.outreach.confirmSent(staff, { messageId: message.messageId });
    expect(await h.approveAs(staff, message.messageId)).toMatchObject({
      code: "MESSAGE_IMMUTABLE",
    });
  });

  it("an audit failure leaves the message a DRAFT", async () => {
    const h = await buildOutreachHarness({ failAudit: true });
    h.outreachRepo.messages.set("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", {
      messageId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      cycleId: CYCLE_ID,
      contactId: CONTACT_ID,
      channelId: CHANNEL_ID,
      channel: "EMAIL",
      subject: "Penjajakan Kerja Sama",
      body: GOOD_BODY,
      language: "id",
      status: "DRAFT",
      followUpAttempt: 0,
      draftSource: "HUMAN",
      aiTemplate: null,
      approvedBy: null,
      approvedAt: null,
      approvedContentHash: null,
      approvedLintVersion: null,
      sentAt: null,
    });
    const staff = await h.login("staff@example.invalid");
    const p = await h.outreach.previewApproval(staff, {
      messageId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });
    if (!p.ok) throw new Error();
    await expect(
      h.outreach.approve(staff, {
        messageId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        reviewedHash: p.value.contentHash,
      }),
    ).rejects.toThrow(/audit write failed/);
    expect(h.outreachRepo.messages.get("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")?.status).toBe(
      "DRAFT",
    );
  });
});

describe("any mutation after approval invalidates it", () => {
  it.each([
    ["body", { body: `${GOOD_BODY} ` }],
    ["subject", { subject: "Subjek yang berbeda" }],
  ])("editing the %s returns the message to DRAFT and clears the approval", async (_n, patch) => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    const r = await h.outreach.editDraft(staff, { messageId: message.messageId, ...patch });
    expect(r).toMatchObject({
      ok: true,
      value: {
        status: "DRAFT",
        approvedBy: null,
        approvedAt: null,
        approvedContentHash: null,
        approvedLintVersion: null,
      },
    });
    expect(
      (await h.auditStore.list({ entityType: "outreach_message" })).at(-1)?.metadata,
    ).toMatchObject({ approvalInvalidated: true });
    // The old approval cannot be used to confirm a send.
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "NOT_APPROVED",
    });
  });

  it("switching to another channel row of the same contact invalidates the approval", async () => {
    const h = await buildOutreachHarness();
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        channel: "LINKEDIN",
        address: "https://www.linkedin.com/in/synthetic-pic",
      }),
    );
    const { staff, message } = await approved(h);
    const r = await h.outreach.editDraft(staff, {
      messageId: message.messageId,
      channelId: SECOND_CHANNEL_ID,
      subject: null,
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        status: "DRAFT",
        channel: "LINKEDIN",
        channelId: SECOND_CHANNEL_ID,
        approvedContentHash: null,
      },
    });
  });

  it("a channel of a different contact (recipient swap) cannot be selected", async () => {
    const h = await buildOutreachHarness();
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        contactId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        address: "other@syntheticedu.example.invalid",
      }),
    );
    const { staff, message } = await approved(h);
    expect(
      await h.outreach.editDraft(staff, {
        messageId: message.messageId,
        channelId: SECOND_CHANNEL_ID,
      }),
    ).toMatchObject({ ok: false, code: "CHANNEL_NOT_FOUND" });
    expect(h.outreachRepo.messages.get(message.messageId)).toMatchObject({
      status: "APPROVED",
      channelId: CHANNEL_ID,
    });
  });

  it("re-approval after an edit produces a different hash", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    const first = message.approvedContentHash;
    await h.outreach.editDraft(staff, {
      messageId: message.messageId,
      body: `${GOOD_BODY}\nCatatan tambahan.`,
    });
    const again = await h.approveAs(staff, message.messageId);
    expect(again.ok && again.value.approvedContentHash).not.toBe(first);
  });

  it("an edit that changes nothing is refused and keeps the approval", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    expect(
      await h.outreach.editDraft(staff, { messageId: message.messageId, body: message.body }),
    ).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("APPROVED");
  });

  it("sent messages cannot be edited", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    await h.outreach.confirmSent(staff, { messageId: message.messageId });
    expect(
      await h.outreach.editDraft(staff, {
        messageId: message.messageId,
        body: "diubah setelah dikirim",
      }),
    ).toMatchObject({ ok: false, code: "MESSAGE_IMMUTABLE" });
  });

  it("a concurrent change during the edit is detected and rolled back", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    h.outreachRepo.beforeUpdate = (id) => {
      const m = h.outreachRepo.messages.get(id);
      if (m) h.outreachRepo.messages.set(id, { ...m, status: "CANCELLED" });
    };
    expect(
      await h.outreach.editDraft(staff, {
        messageId: message.messageId,
        body: `${GOOD_BODY}\nUbah.`,
      }),
    ).toMatchObject({ ok: false, code: "CONCURRENT_CHANGE" });
  });
});

describe("send confirmation re-derives the hash (tampering, wrong recipient/channel)", () => {
  it("confirms a human send of unchanged approved content, recording time and approver hash", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    const r = await h.outreach.confirmSent(staff, { messageId: message.messageId });
    expect(r).toMatchObject({ ok: true, value: { status: "SENT" } });
    expect(r.ok && r.value.sentAt).toEqual(h.clock.now());
    expect(
      (await h.auditStore.list({ entityType: "outreach_message" })).at(-1)?.metadata,
    ).toMatchObject({
      approvedContentHash: message.approvedContentHash,
      manualSend: true,
    });
  });

  it("refuses an unapproved draft and a message already sent", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      code: "NOT_APPROVED",
    });
    const a = await h.approveAs(staff, message.messageId);
    if (!a.ok) throw new Error();
    await h.outreach.confirmSent(staff, { messageId: message.messageId });
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      code: "NOT_APPROVED",
    });
  });

  it.each([
    ["body edited directly in storage", (m: { body: string }) => ({ body: `${m.body} ` })],
    ["subject edited directly in storage", () => ({ subject: "Subjek palsu" })],
  ])("tampering: %s is caught as HASH_MISMATCH", async (_n, tamper) => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    const stored = h.outreachRepo.messages.get(message.messageId);
    if (!stored) throw new Error();
    h.outreachRepo.messages.set(message.messageId, { ...stored, ...tamper(stored) });
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "HASH_MISMATCH",
      httpStatus: 409,
    });
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("APPROVED");
    expect(h.outreachRepo.messages.get(message.messageId)?.sentAt).toBeNull();
  });

  it("wrong recipient: the message re-pointed at another contact or a swapped channel row is refused", async () => {
    const h = await buildOutreachHarness();
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        address: "attacker@syntheticedu.example.invalid",
      }),
    );
    const { staff, message } = await approved(h);
    const stored = h.outreachRepo.messages.get(message.messageId);
    if (!stored) throw new Error();
    h.outreachRepo.messages.set(message.messageId, { ...stored, channelId: SECOND_CHANNEL_ID });
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "HASH_MISMATCH",
    });
  });

  it("wrong recipient: a channel row that now belongs to a different contact is not ready", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    h.contactRepo.channels.set(
      CHANNEL_ID,
      verifiedChannel({ contactId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }),
    );
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "NOT_READY",
      blockers: ["CHANNEL_OF_OTHER_CONTACT"],
    });
  });

  it("wrong channel: a type that no longer matches the message is not ready", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    h.contactRepo.channels.set(
      CHANNEL_ID,
      verifiedChannel({ channel: "WHATSAPP", address: "+6281234567890" }),
    );
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "NOT_READY",
      blockers: ["CHANNEL_TYPE_MISMATCH"],
    });
  });

  it("the channel address changing under an approval (re-verified as another address) is a hash mismatch", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    h.contactRepo.channels.set(
      CHANNEL_ID,
      verifiedChannel({ address: "different@syntheticedu.example.invalid" }),
    );
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "HASH_MISMATCH",
    });
  });

  it("do-not-contact set after approval blocks the send", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    patchContact(h, { doNotContact: true });
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      ok: false,
      code: "NOT_READY",
      blockers: ["DO_NOT_CONTACT"],
    });
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("APPROVED");
  });

  it("losing channel verification after approval blocks the send", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await approved(h);
    h.contactRepo.channels.set(CHANNEL_ID, verifiedChannel({ verificationStatus: "FAILED" }));
    expect(await h.outreach.confirmSent(staff, { messageId: message.messageId })).toMatchObject({
      code: "NOT_READY",
      blockers: ["CHANNEL_FAILED"],
    });
  });

  it("do-not-contact blocks approval and is reported alongside other blockers", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    patchContact(h, { doNotContact: true, verificationStatus: "UNVERIFIED" });
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    const r = await h.outreach.approve(staff, {
      messageId: message.messageId,
      reviewedHash: p.ok ? p.value.contentHash : "",
    });
    expect(r).toMatchObject({
      ok: false,
      code: "NOT_READY",
      blockers: ["DO_NOT_CONTACT", "CONTACT_NOT_VERIFIED"],
    });
  });

  it("WhatsApp and LinkedIn previews are flagged manual-send only", async () => {
    const h = await buildOutreachHarness();
    h.contactRepo.channels.set(
      SECOND_CHANNEL_ID,
      verifiedChannel({
        channelId: SECOND_CHANNEL_ID,
        channel: "WHATSAPP",
        address: "+6281234567890",
      }),
    );
    const { staff, message } = await h.newDraft({ channelId: SECOND_CHANNEL_ID, subject: null });
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    expect(p).toMatchObject({
      ok: true,
      value: { readiness: { ready: true, manualSendOnly: true } },
    });
  });
});

describe("authorization", () => {
  it("viewers and anonymous callers cannot preview, approve or confirm a send; nothing changes", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    const viewer = await h.login("viewer@example.invalid");
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    const reviewedHash = p.ok ? p.value.contentHash : "";
    for (const token of [viewer, undefined, "forged"]) {
      expect((await h.outreach.previewApproval(token, { messageId: message.messageId })).ok).toBe(
        false,
      );
      expect(
        (await h.outreach.approve(token, { messageId: message.messageId, reviewedHash })).ok,
      ).toBe(false);
      expect((await h.outreach.confirmSent(token, { messageId: message.messageId })).ok).toBe(
        false,
      );
    }
    expect(h.outreachRepo.messages.get(message.messageId)).toMatchObject({
      status: "DRAFT",
      approvedBy: null,
    });
    expect((await h.auditStore.list({ kind: "ACCESS_DENIED" })).map((e) => e.actorUserId)).toEqual([
      "u-viewer",
      "u-viewer",
      "u-viewer",
    ]);
  });

  it("an expired session cannot approve", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    h.clock.advance(9 * 60 * 60 * 1000);
    expect(
      await h.outreach.approve(staff, {
        messageId: message.messageId,
        reviewedHash: p.ok ? p.value.contentHash : "",
      }),
    ).toMatchObject({
      ok: false,
      code: "SESSION_EXPIRED",
    });
  });

  it("a deactivated user loses approval rights immediately", async () => {
    const h = await buildOutreachHarness();
    const { staff, message } = await h.newDraft();
    const p = await h.outreach.previewApproval(staff, { messageId: message.messageId });
    const user = h.users.users.get("u-staff");
    if (user) h.users.users.set("u-staff", { ...user, isActive: false });
    expect(
      await h.outreach.approve(staff, {
        messageId: message.messageId,
        reviewedHash: p.ok ? p.value.contentHash : "",
      }),
    ).toMatchObject({
      ok: false,
      code: "USER_INACTIVE",
    });
    expect(h.outreachRepo.messages.get(message.messageId)?.status).toBe("DRAFT");
  });

  it("TL BD and LCVP PD approve identically", async () => {
    const results: unknown[] = [];
    for (const email of ["tlbd@example.invalid", "lcvp.pd@example.invalid"]) {
      const h = await buildOutreachHarness();
      const { message } = await h.newDraft();
      const r = await h.approveAs(await h.login(email), message.messageId);
      results.push(r.ok ? r.value.status : r.code);
    }
    expect(results).toEqual(["APPROVED", "APPROVED"]);
  });
});
