/**
 * M1-03 acceptance tests (mock-boundary slice): partner/contact service
 * contract, search, dedupe warnings, validation, verification and DNC rules,
 * and the server-side authorization matrix. Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import {
  MockPartnerService,
  syntheticPartners,
} from "../../apps/web/features/partners/mock-service";
import {
  type Contact,
  ESSM_INDUSTRIES,
  type Partner,
  PartnerAccessDeniedError,
  type PartnerPrincipal,
} from "../../apps/web/features/partners/types";

const CRM_LEAD: PartnerPrincipal = {
  email: "lead@example.invalid",
  role: "CRM_LEAD",
  active: true,
};
const BD_STAFF: PartnerPrincipal = {
  email: "staff@example.invalid",
  role: "BD_STAFF",
  active: true,
};
const ANON: PartnerPrincipal = { email: null, role: "NONE", active: false };
const INACTIVE: PartnerPrincipal = {
  email: "old@example.invalid",
  role: "CRM_LEAD",
  active: false,
};

function validCreateInput() {
  return {
    name: "Cahaya synthetic Retail",
    websiteDomain: "cahaya-synthetic.example",
    industry: "ECOMMERCE_RETAIL",
    officialEmail: "info@cahaya-synthetic.example",
    sourceUrl: "https://directory.example.invalid/cahaya",
    sourceTier: "official",
    lawfulBasisNote: "published business directory entry",
    contact: {
      name: "Sari synthetic",
      email: "sari@cahaya-synthetic.example",
      phone: "+62 812 0000 0002",
      sourceUrl: "https://directory.example.invalid/cahaya/contact",
      sourceTier: "official",
      lawfulBasisNote: "published business directory entry",
    },
  } as const;
}

describe("authorization matrix (deny-closed until M0-05)", () => {
  it("denies anonymous and inactive principals for read and write", async () => {
    const service = new MockPartnerService();
    await expect(service.search(ANON, "", null)).rejects.toThrow(PartnerAccessDeniedError);
    await expect(service.search(INACTIVE, "", null)).rejects.toThrow(PartnerAccessDeniedError);
    await expect(service.create(ANON, validCreateInput())).rejects.toThrow(
      PartnerAccessDeniedError,
    );
    await expect(service.create(INACTIVE, validCreateInput())).rejects.toThrow(
      PartnerAccessDeniedError,
    );
  });

  it("grants reads to BD_STAFF and CRM_LEAD alike (TL BD / LCVP PD equivalence)", async () => {
    const service = new MockPartnerService();
    await expect(service.search(BD_STAFF, "", null)).resolves.toHaveLength(2);
    await expect(service.search(CRM_LEAD, "", null)).resolves.toHaveLength(2);
  });

  it("grants writes to BD_STAFF and CRM_LEAD alike", async () => {
    const staffService = new MockPartnerService();
    const leadService = new MockPartnerService();
    const asStaff = await staffService.create(BD_STAFF, validCreateInput());
    const asLead = await leadService.create(CRM_LEAD, validCreateInput());
    expect(asStaff.ok).toBe(true);
    expect(asLead.ok).toBe(true);
  });
});

describe("search and dedupe", () => {
  it("filters by query across name, domain and contact email", async () => {
    const service = new MockPartnerService();
    expect((await service.search(CRM_LEAD, "acme", null)).map((p) => p.name)).toEqual([
      "Acme synthetic Logistics",
    ]);
    expect(
      (await service.search(CRM_LEAD, "raka@bumi-synthetic.example", null)).map((p) => p.name),
    ).toEqual(["Bumi synthetic Edu"]);
    expect((await service.search(CRM_LEAD, "no-match-xyz", null)).length).toBe(0);
  });

  it("filters by exact ESSM industry category", async () => {
    const service = new MockPartnerService();
    const education = await service.search(CRM_LEAD, "", "EDUCATION");
    expect(education.map((p) => p.industry)).toEqual(["EDUCATION"]);
  });

  it("exposes exactly the ten official ESSM categories (no vertical taxonomy)", () => {
    expect(ESSM_INDUSTRIES).toHaveLength(10);
    expect(ESSM_INDUSTRIES.map((i) => i.code)).not.toContain("B2B");
    expect(ESSM_INDUSTRIES.map((i) => i.code)).not.toContain("MSME");
  });

  it("warns on same-domain and similar-name duplicates and requires confirmation", async () => {
    const service = new MockPartnerService();
    const sameDomain = await service.create(CRM_LEAD, {
      ...validCreateInput(),
      websiteDomain: "acme-synthetic.example",
    });
    expect(sameDomain).toMatchObject({ ok: false, error: "duplicate_confirmation_required" });
    if (!sameDomain.ok && sameDomain.error === "duplicate_confirmation_required") {
      expect(sameDomain.duplicates[0]?.reason).toBe("same_domain");
    }

    const similarName = await service.create(CRM_LEAD, {
      ...validCreateInput(),
      name: "Acme synthetic Logistics Group",
      websiteDomain: "different.example",
    });
    expect(similarName).toMatchObject({ ok: false, error: "duplicate_confirmation_required" });

    const confirmed = await service.create(CRM_LEAD, {
      ...validCreateInput(),
      name: "Acme synthetic Logistics Group",
      websiteDomain: "different.example",
      confirmDuplicate: true,
    });
    expect(confirmed.ok).toBe(true);
  });
});

describe("create validation", () => {
  it("rejects invalid industry codes, malformed emails and short notes", async () => {
    const service = new MockPartnerService();
    const result = await service.create(CRM_LEAD, {
      ...validCreateInput(),
      industry: "B2B_VERTICAL",
      officialEmail: "not-an-email",
      lawfulBasisNote: "x",
    });
    expect(result).toMatchObject({ ok: false, error: "validation_failed" });
    if (!result.ok && result.error === "validation_failed") {
      const paths = result.issues.map((i) => i.path);
      expect(paths).toContain("industry");
      expect(paths).toContain("officialEmail");
      expect(paths).toContain("lawfulBasisNote");
    }
  });

  it("creates an unverified primary contact and stores provenance", async () => {
    const service = new MockPartnerService();
    const result = await service.create(CRM_LEAD, validCreateInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.contacts).toHaveLength(1);
      expect(result.data.contacts[0]?.verification).toBe("unverified");
      expect(result.data.sourceTier).toBe("official");
      expect(result.data.contacts[0]?.doNotContact).toBe(false);
    }
  });
});

describe("verification and do-not-contact", () => {
  function firstSynthetic(): { partner: Partner; contact: Contact } {
    const [partner] = syntheticPartners();
    const [contact] = partner?.contacts ?? [];
    if (!partner || !contact) throw new Error("synthetic fixture must contain a partner contact");
    return { partner, contact };
  }

  it("blocks verification without a source URL (provenance required)", async () => {
    const service = new MockPartnerService();
    const { partner, contact } = firstSynthetic();
    const result = await service.setContactVerification(CRM_LEAD, partner.id, {
      contactId: "does-not-exist",
      verification: "verified",
    });
    expect(result).toMatchObject({ ok: false, error: "not_found" });

    const unprovenanced = new MockPartnerService([
      {
        ...partner,
        contacts: [{ ...contact, sourceUrl: null, verification: "unverified" }],
      },
    ]);
    const deniedResult = await unprovenanced.setContactVerification(CRM_LEAD, partner.id, {
      contactId: contact.id,
      verification: "verified",
    });
    expect(deniedResult).toMatchObject({ ok: false, error: "validation_failed" });

    const provenanced = await unprovenanced.setContactVerification(CRM_LEAD, partner.id, {
      contactId: contact.id,
      verification: "verified",
      sourceUrl: "https://directory.example.invalid/proof",
    });
    expect(provenanced.ok).toBe(true);
  });

  it("records DNC with a mandatory reason and stores it on the contact", async () => {
    const service = new MockPartnerService();
    const { partner, contact } = firstSynthetic();
    const missingReason = await service.setDoNotContact(CRM_LEAD, partner.id, {
      contactId: contact.id,
      doNotContact: true,
      reason: "",
    });
    expect(missingReason).toMatchObject({ ok: false, error: "validation_failed" });

    const ok = await service.setDoNotContact(CRM_LEAD, partner.id, {
      contactId: contact.id,
      doNotContact: true,
      reason: "partner requested no contact via phone call",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.doNotContact).toBe(true);
  });

  it("returns not_found for unknown partners", async () => {
    const service = new MockPartnerService();
    await expect(
      service.update(CRM_LEAD, "does-not-exist", { name: "Renamed synthetic" }),
    ).resolves.toMatchObject({ ok: false, error: "not_found" });
  });
});
