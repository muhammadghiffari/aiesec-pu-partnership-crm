/**
 * Test-only harness for contact tests. Synthetic data only (`example.invalid`). Not exported.
 */

import { buildAuditHarness } from "../audit/test-support";
import { createContactService } from "./service";
import type {
  ChannelRecord,
  ContactCandidate,
  ContactEnrichmentProvider,
  ContactRecord,
  ContactRepository,
  PartnerSummary,
} from "./types";

export class InMemoryContactRepo implements ContactRepository {
  partners = new Map<string, PartnerSummary>();
  contacts = new Map<string, ContactRecord>();
  channels = new Map<string, ChannelRecord>();
  candidates = new Map<string, ContactCandidate>();

  snapshot() {
    const copy = <T>(m: Map<string, T>) => new Map([...m].map(([k, v]) => [k, { ...v }]));
    return {
      contacts: copy(this.contacts),
      channels: copy(this.channels),
      candidates: copy(this.candidates),
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<InMemoryContactRepo["snapshot"]>;
    this.contacts = snap.contacts;
    this.channels = snap.channels;
    this.candidates = snap.candidates;
  }

  async getPartner(id: string) {
    return this.partners.get(id) ?? null;
  }
  async getContact(id: string) {
    const c = this.contacts.get(id);
    return c ? { ...c } : null;
  }
  async getChannel(id: string) {
    const c = this.channels.get(id);
    return c ? { ...c } : null;
  }
  async listChannels(contactId: string) {
    return [...this.channels.values()]
      .filter((c) => c.contactId === contactId)
      .map((c) => ({ ...c }));
  }
  async findChannel(contactId: string, channel: string, address: string) {
    return (
      [...this.channels.values()].find(
        (c) => c.contactId === contactId && c.channel === channel && c.address === address,
      ) ?? null
    );
  }
  async insertContact(c: ContactRecord) {
    this.contacts.set(c.contactId, { ...c });
  }
  async insertChannel(c: ChannelRecord) {
    if (await this.findChannel(c.contactId, c.channel, c.address))
      throw new Error("unique violation");
    this.channels.set(c.channelId, { ...c });
  }
  async updateChannelVerification(id: string, patch: Partial<ChannelRecord>) {
    const c = this.channels.get(id);
    if (c) this.channels.set(id, { ...c, ...patch });
  }
  async updateContact(id: string, patch: Partial<ContactRecord>) {
    const c = this.contacts.get(id);
    if (c) this.contacts.set(id, { ...c, ...patch });
  }
  async hasPendingCandidate(partnerId: string, channel: string, address: string) {
    return [...this.candidates.values()].some(
      (c) =>
        c.partnerId === partnerId &&
        c.channel === channel &&
        c.address === address &&
        c.reviewStatus === "PENDING",
    );
  }
  async insertCandidate(c: ContactCandidate) {
    this.candidates.set(c.candidateId, { ...c });
  }
  async getCandidate(id: string) {
    const c = this.candidates.get(id);
    return c ? { ...c } : null;
  }
  async markCandidate(id: string, patch: Partial<ContactCandidate>) {
    const c = this.candidates.get(id);
    if (c?.reviewStatus !== "PENDING") return false;
    this.candidates.set(id, { ...c, ...patch });
    return true;
  }
}

export class FakeEnrichment implements ContactEnrichmentProvider {
  readonly code = "SYNTHETIC_API";
  calls: { partnerName: string; websiteDomain: string | null }[] = [];
  next: () => unknown = () => ({ results: [] });
  async lookup(
    query: { partnerName: string; websiteDomain: string | null },
    _o: { signal: AbortSignal },
  ) {
    this.calls.push(query);
    return this.next();
  }
}

export const PARTNER_ID = "33333333-3333-4333-8333-333333333333";

export async function buildContactHarness(
  options: { failAudit?: boolean; enrichment?: boolean; timeoutMs?: number } = {},
) {
  const repo = new InMemoryContactRepo();
  repo.partners.set(PARTNER_ID, {
    partnerId: PARTNER_ID,
    name: "Synthetic Edu Foundation",
    websiteDomain: "syntheticedu.example.invalid",
  });
  const provider = new FakeEnrichment();
  const h = await buildAuditHarness({ failAudit: options.failAudit, extraDomain: repo });
  const contacts = createContactService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    repository: repo,
    enrichment: options.enrichment === false ? null : provider,
    clock: h.clock,
    enrichmentTimeoutMs: options.timeoutMs,
  });
  return { ...h, repo, provider, contacts };
}

export const manual = (extra: Record<string, unknown> = {}) => ({
  partnerId: PARTNER_ID,
  name: "Synthetic PIC",
  title: "Partnership Manager",
  channel: "EMAIL",
  address: "pic@syntheticedu.example.invalid",
  sourceUrl: "https://syntheticedu.example.invalid/team",
  sourceTier: "OFFICIAL",
  ...extra,
});
