/**
 * In-memory mock implementation of the M1-03 PartnerService contract.
 * Synthetic data only (example.invalid). Replaced by the real M1-01-backed
 * implementation without UI changes: see getPartnerService().
 */
import { randomUUID } from "node:crypto";
import {
  assertCan,
  type Contact,
  contactVerificationInputSchema,
  type DuplicateWarning,
  dncInputSchema,
  type IndustryCode,
  type Partner,
  type PartnerPrincipal,
  type PartnerResult,
  type PartnerService,
  partnerCreateInputSchema,
  partnerUpdateInputSchema,
  toValidationIssues,
} from "./types";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(name: string): Set<string> {
  return new Set(normalizeName(name).split(" "));
}

/** Safe duplicate warning: same domain, or strong name overlap (>= 2 tokens). */
export function findDuplicates(
  candidates: Partner[],
  name: string,
  websiteDomain: string | null,
): DuplicateWarning[] {
  const warnings: DuplicateWarning[] = [];
  const domain = websiteDomain?.toLowerCase() ?? null;
  const tokens = tokenSet(name);
  for (const existing of candidates) {
    if (domain && existing.websiteDomain?.toLowerCase() === domain) {
      warnings.push({ partnerId: existing.id, name: existing.name, reason: "same_domain" });
      continue;
    }
    let overlap = 0;
    for (const token of tokenSet(existing.name)) {
      if (tokens.has(token)) overlap += 1;
    }
    if (overlap >= 2) {
      warnings.push({ partnerId: existing.id, name: existing.name, reason: "similar_name" });
    }
  }
  return warnings;
}

export class MockPartnerService implements PartnerService {
  private partners: Partner[] = [];

  constructor(seed: Partner[] = syntheticPartners()) {
    this.partners = [...seed];
  }

  async search(
    principal: PartnerPrincipal,
    query: string,
    industry: IndustryCode | null,
  ): Promise<Partner[]> {
    assertCan(principal, "read");
    const q = query.trim().toLowerCase();
    return this.partners
      .filter((p) => (industry ? p.industry === industry : true))
      .filter((p) =>
        q
          ? p.name.toLowerCase().includes(q) ||
            (p.websiteDomain?.toLowerCase().includes(q) ?? false) ||
            p.contacts.some((c) => c.email.toLowerCase().includes(q))
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(principal: PartnerPrincipal, id: string): Promise<Partner | null> {
    assertCan(principal, "read");
    return this.partners.find((p) => p.id === id) ?? null;
  }

  async create(principal: PartnerPrincipal, input: unknown): Promise<PartnerResult<Partner>> {
    assertCan(principal, "write");
    const parsed = partnerCreateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "validation_failed", issues: toValidationIssues(parsed.error) };
    }
    const data = parsed.data;
    const duplicates = findDuplicates(this.partners, data.name, data.websiteDomain ?? null);
    if (duplicates.length > 0 && !data.confirmDuplicate) {
      return { ok: false, error: "duplicate_confirmation_required", duplicates };
    }
    const now = new Date().toISOString();
    const partnerId = randomUUID();
    const primaryContact: Contact = {
      id: randomUUID(),
      partnerId,
      name: data.contact.name,
      title: data.contact.title ?? null,
      email: data.contact.email,
      phone: data.contact.phone ?? null,
      verification: "unverified",
      sourceUrl: data.contact.sourceUrl ?? null,
      sourceTier: data.contact.sourceTier,
      lawfulBasisNote: data.contact.lawfulBasisNote,
      doNotContact: false,
      verifiedAt: null,
    };
    const partner: Partner = {
      id: partnerId,
      name: data.name,
      websiteDomain: data.websiteDomain ?? null,
      industry: data.industry,
      officialEmail: data.officialEmail ?? null,
      sourceUrl: data.sourceUrl ?? null,
      sourceTier: data.sourceTier,
      lawfulBasisNote: data.lawfulBasisNote,
      createdAt: now,
      contacts: [primaryContact],
    };
    this.partners.push(partner);
    return { ok: true, data: partner };
  }

  async update(
    principal: PartnerPrincipal,
    id: string,
    input: unknown,
  ): Promise<PartnerResult<Partner>> {
    assertCan(principal, "write");
    const existing = this.partners.find((p) => p.id === id);
    if (!existing) return { ok: false, error: "not_found" };
    const parsed = partnerUpdateInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "validation_failed", issues: toValidationIssues(parsed.error) };
    }
    Object.assign(existing, parsed.data);
    return { ok: true, data: existing };
  }

  async setContactVerification(
    principal: PartnerPrincipal,
    partnerId: string,
    input: unknown,
  ): Promise<PartnerResult<Contact>> {
    assertCan(principal, "write");
    const partner = this.partners.find((p) => p.id === partnerId);
    if (!partner) return { ok: false, error: "not_found" };
    const parsed = contactVerificationInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "validation_failed", issues: toValidationIssues(parsed.error) };
    }
    const contact = partner.contacts.find((c) => c.id === parsed.data.contactId);
    if (!contact) return { ok: false, error: "not_found" };
    // Verification requires provenance: a source URL or an existing one.
    const sourceUrl = parsed.data.sourceUrl ?? contact.sourceUrl;
    if (parsed.data.verification === "verified" && !sourceUrl) {
      return {
        ok: false,
        error: "validation_failed",
        issues: [{ path: "sourceUrl", message: "a source URL is required to verify a contact" }],
      };
    }
    contact.verification = parsed.data.verification;
    contact.verifiedAt = parsed.data.verification === "verified" ? new Date().toISOString() : null;
    if (parsed.data.sourceUrl !== undefined) contact.sourceUrl = parsed.data.sourceUrl;
    if (parsed.data.sourceTier !== undefined) contact.sourceTier = parsed.data.sourceTier;
    if (parsed.data.lawfulBasisNote !== undefined)
      contact.lawfulBasisNote = parsed.data.lawfulBasisNote;
    return { ok: true, data: contact };
  }

  async setDoNotContact(
    principal: PartnerPrincipal,
    partnerId: string,
    input: unknown,
  ): Promise<PartnerResult<Contact>> {
    assertCan(principal, "write");
    const partner = this.partners.find((p) => p.id === partnerId);
    if (!partner) return { ok: false, error: "not_found" };
    const parsed = dncInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "validation_failed", issues: toValidationIssues(parsed.error) };
    }
    const contact = partner.contacts.find((c) => c.id === parsed.data.contactId);
    if (!contact) return { ok: false, error: "not_found" };
    contact.doNotContact = parsed.data.doNotContact;
    return { ok: true, data: contact };
  }

  /** Test/inspection helper; not part of the interface. */
  all(): readonly Partner[] {
    return this.partners;
  }
}

function contact(partial: Partial<Contact> & { name: string; email: string }): Contact {
  return {
    id: partial.id ?? randomUUID(),
    partnerId: partial.partnerId ?? "",
    name: partial.name,
    email: partial.email,
    title: partial.title ?? null,
    phone: partial.phone ?? null,
    verification: partial.verification ?? "unverified",
    sourceUrl: partial.sourceUrl ?? null,
    sourceTier: partial.sourceTier ?? "research",
    lawfulBasisNote: partial.lawfulBasisNote ?? "public business contact directory",
    doNotContact: partial.doNotContact ?? false,
    verifiedAt: partial.verifiedAt ?? null,
  };
}

/** Synthetic partners only; emails use example.invalid per AGENTS.md. */
export function syntheticPartners(): Partner[] {
  const acmeId = "11111111-1111-4111-8111-111111111111";
  const bumiId = "22222222-2222-4222-8222-222222222222";
  return [
    {
      id: acmeId,
      name: "Acme synthetic Logistics",
      websiteDomain: "acme-synthetic.example",
      industry: "ENERGY_MATERIALS_INDUSTRIALS",
      officialEmail: "info@acme-synthetic.example",
      sourceUrl: "https://directory.example.invalid/acme",
      sourceTier: "official",
      lawfulBasisNote: "published business directory entry",
      createdAt: "2026-10-01T02:00:00.000Z",
      contacts: [
        contact({
          id: "aaaa1111-1111-4111-8111-111111111111",
          partnerId: acmeId,
          name: "Dina synthetic",
          title: "Marketing Manager",
          email: "dina@acme-synthetic.example",
          phone: "+62 812 0000 0001",
          verification: "verified",
          sourceUrl: "https://directory.example.invalid/acme/contact",
          sourceTier: "official",
          verifiedAt: "2026-10-02T02:00:00.000Z",
        }),
      ],
    },
    {
      id: bumiId,
      name: "Bumi synthetic Edu",
      websiteDomain: "bumi-synthetic.example",
      industry: "EDUCATION",
      officialEmail: "office@bumi-synthetic.example",
      sourceUrl: "https://directory.example.invalid/bumi",
      sourceTier: "research",
      lawfulBasisNote: "public school partner list",
      createdAt: "2026-10-05T02:00:00.000Z",
      contacts: [
        contact({
          id: "bbbb2222-2222-4222-8222-222222222222",
          partnerId: bumiId,
          name: "Raka synthetic",
          title: "Partnership Staff",
          email: "raka@bumi-synthetic.example",
          doNotContact: true,
        }),
      ],
    },
  ];
}

let singleton: PartnerService | null = null;

/**
 * UI rebinding point: swap the mock for the real M1-01/M1-04-backed service
 * here; no page or component code changes.
 */
export function getPartnerService(): PartnerService {
  singleton ??= new MockPartnerService();
  return singleton;
}
