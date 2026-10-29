/**
 * Test-only harness for outreach tests: contact repo + outreach repo with shared rollback,
 * a verified synthetic recipient, and the real contact/outreach services. Not exported.
 */

import { buildAuditHarness } from "../audit/test-support";
import { InMemoryContactRepo, PARTNER_ID } from "../contacts/test-support";
import type { ChannelRecord, ContactRecord } from "../contacts/types";
import { approvalHash } from "./hash";
import { createOutreachService } from "./service";
import type { MessagePatch, OutreachMessage, OutreachRepository, OutreachStatus } from "./types";

export class InMemoryOutreachRepo implements OutreachRepository {
  messages = new Map<string, OutreachMessage>();
  cyclePartner = new Map<string, string>();
  /** Test hook: runs inside updateMessage before the compare-and-set (race simulation). */
  beforeUpdate?: (id: string) => void;

  snapshot() {
    return new Map([...this.messages].map(([k, v]) => [k, { ...v }]));
  }
  restore(s: unknown) {
    this.messages = new Map(
      [...(s as Map<string, OutreachMessage>)].map(([k, v]) => [k, { ...v }]),
    );
  }
  async getCyclePartnerId(id: string) {
    return this.cyclePartner.get(id) ?? null;
  }
  async getMessage(id: string) {
    const m = this.messages.get(id);
    return m ? { ...m } : null;
  }
  async insertMessage(m: OutreachMessage) {
    this.messages.set(m.messageId, { ...m });
  }
  async updateMessage(id: string, expected: OutreachStatus, patch: MessagePatch) {
    this.beforeUpdate?.(id);
    const m = this.messages.get(id);
    if (!m || m.status !== expected) return false;
    this.messages.set(id, { ...m, ...patch });
    return true;
  }
}

export const CYCLE_ID = "77777777-7777-4777-8777-777777777777";
export const CONTACT_ID = "88888888-8888-4888-8888-888888888888";
export const CHANNEL_ID = "99999999-9999-4999-8999-999999999999";
export const SECOND_CHANNEL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const GOOD_BODY =
  "Yth. Ibu Sinta,\n\nPerkenalkan, kami dari AIESEC in Universitas Padjadjaran. Kami ingin menjajaki peluang kerja sama " +
  "dalam program pengembangan kepemimpinan mahasiswa dan memohon waktu Ibu untuk berdiskusi singkat.\n\nTerima kasih.\nHormat kami,\nRina";

const verifiedContact = (extra: Partial<ContactRecord> = {}): ContactRecord => ({
  contactId: CONTACT_ID,
  partnerId: PARTNER_ID,
  name: "Synthetic PIC",
  title: null,
  verificationStatus: "VERIFIED",
  verifiedBy: "u-staff",
  verifiedAt: new Date("2026-10-29T02:00:00Z"),
  lawfulBasisNote: "Listed on the partner's official team page",
  doNotContact: false,
  dncReason: null,
  dncSetBy: null,
  dncSetAt: null,
  ...extra,
});

export const verifiedChannel = (extra: Partial<ChannelRecord> = {}): ChannelRecord => ({
  channelId: CHANNEL_ID,
  contactId: CONTACT_ID,
  channel: "EMAIL",
  address: "pic@syntheticedu.example.invalid",
  sourceUrl: "https://syntheticedu.example.invalid/team",
  sourceTier: "OFFICIAL",
  verificationStatus: "VERIFIED",
  verificationMethod: "OFFICIAL_WEBSITE",
  evidenceUrl: "https://syntheticedu.example.invalid/team",
  verifiedBy: "u-staff",
  verifiedAt: new Date("2026-10-29T02:00:00Z"),
  createdAt: new Date("2026-10-29T01:00:00Z"),
  ...extra,
});

export async function buildOutreachHarness(options: { failAudit?: boolean } = {}) {
  const contactRepo = new InMemoryContactRepo();
  const outreachRepo = new InMemoryOutreachRepo();
  contactRepo.contacts.set(CONTACT_ID, verifiedContact());
  contactRepo.channels.set(CHANNEL_ID, verifiedChannel());
  outreachRepo.cyclePartner.set(CYCLE_ID, PARTNER_ID);

  const h = await buildAuditHarness({
    failAudit: options.failAudit,
    extraDomain: {
      snapshot: () => ({ c: contactRepo.snapshot(), o: outreachRepo.snapshot() }),
      restore: (s) => {
        const snap = s as { c: unknown; o: unknown };
        contactRepo.restore(snap.c);
        outreachRepo.restore(snap.o);
      },
    },
  });
  const outreach = createOutreachService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    outreach: outreachRepo,
    contacts: contactRepo,
    clock: h.clock,
  });

  const draftInput = (extra: Record<string, unknown> = {}) => ({
    cycleId: CYCLE_ID,
    contactId: CONTACT_ID,
    channelId: CHANNEL_ID,
    language: "id",
    subject: "Penjajakan Kerja Sama AIESEC in UNPAD",
    body: GOOD_BODY,
    ...extra,
  });

  /** Create a draft as staff and return it. */
  async function newDraft(extra: Record<string, unknown> = {}) {
    const staff = await h.login("staff@example.invalid");
    const r = await outreach.createDraft(staff, draftInput(extra));
    if (!r.ok) throw new Error(`draft failed: ${r.code}`);
    return { staff, message: r.value };
  }

  /** Preview then approve with the hash the approver saw. */
  async function approveAs(token: string, messageId: string) {
    const p = await outreach.previewApproval(token, { messageId });
    if (!p.ok) throw new Error(`preview failed: ${p.code}`);
    return outreach.approve(token, { messageId, reviewedHash: p.value.contentHash });
  }

  return {
    ...h,
    contactRepo,
    outreachRepo,
    outreach,
    draftInput,
    newDraft,
    approveAs,
    approvalHash,
  };
}
