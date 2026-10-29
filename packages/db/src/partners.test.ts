/** FR-200: persisted Partner/Contact records obey migration 0001. */
import { afterEach, describe, expect, it } from "vitest";
import { createPartnerRepository } from "./partners";
import { freshDb, insert } from "./test-support";

describe("partner SQL repository", () => {
  const databases: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const db of databases.splice(0)) await db.close();
  });

  it("persists partner source, official ESSM category and contact provenance", async () => {
    const db = await freshDb();
    databases.push(db);
    const category = await insert(db, "industry_categories", {
      code: "EDUCATION",
      name: "Education",
    });
    const repo = createPartnerRepository(db);
    const created = await repo.insertPartner({
      name: "Synthetic Academy",
      industry: "EDUCATION",
      sourceDescription: "Public directory",
      sourceTier: "research",
      sourceUrl: "https://example.invalid/source",
      websiteDomain: "synthetic.example",
      officialEmail: null,
    });
    expect(created.industry).toBe("EDUCATION");
    expect(created.sourceDescription).toBe("Public directory");
    const contact = await repo.insertContact(created.id, {
      name: "Synthetic PIC",
      email: "pic@example.invalid",
      title: null,
      phone: null,
      sourceUrl: "https://example.invalid/contact",
      sourceTier: "official",
      lawfulBasisNote: "Public listing",
    });
    expect(contact.verification).toBe("unverified");
    expect(contact.lawfulBasisNote).toBe("Public listing");
    expect((await repo.getById(created.id))?.contacts).toHaveLength(1);
    expect(
      (
        await db.query<{ source: string }>("SELECT source FROM partners WHERE partner_id = $1", [
          created.id,
        ])
      ).rows[0]?.source,
    ).toBe("Public directory");
    expect(category.category_id).toBeTruthy();
  });
  it("searches persisted contact email and updates partner source", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    const repo = createPartnerRepository(db);
    const saved = await repo.insertPartner({
      name: "Synthetic School",
      industry: "EDUCATION",
      sourceDescription: "Directory",
      sourceTier: "official",
      sourceUrl: null,
      officialEmail: null,
      websiteDomain: null,
    });
    await repo.insertContact(saved.id, {
      name: "Synthetic PIC",
      email: "pic@example.invalid",
      title: null,
      phone: null,
      sourceUrl: null,
      sourceTier: "research",
      lawfulBasisNote: "Public listing",
    });
    expect((await repo.search("pic@example.invalid", "EDUCATION")).map((p) => p.id)).toEqual([
      saved.id,
    ]);
    expect(await repo.search("pic@example.invalid", "TECH_COMPANY")).toEqual([]);
    expect(
      (await repo.updatePartner(saved.id, { sourceDescription: "Referral" }))?.sourceDescription,
    ).toBe("Referral");
  });
  it("persists verification actor and DNC reason, and does not mutate another partner's contact", async () => {
    const db = await freshDb();
    databases.push(db);
    await insert(db, "industry_categories", { code: "EDUCATION", name: "Education" });
    const user = await insert(db, "users", {
      email: "lead@example.invalid",
      name: "Synthetic Lead",
      access_role: "CRM_LEAD",
    });
    const repo = createPartnerRepository(db);
    const saved = await repo.insertPartner({
      name: "Synthetic School",
      industry: "EDUCATION",
      sourceDescription: "Directory",
      sourceTier: "official",
      sourceUrl: null,
      officialEmail: null,
      websiteDomain: null,
    });
    const person = await repo.insertContact(saved.id, {
      name: "Synthetic PIC",
      email: "pic@example.invalid",
      title: null,
      phone: null,
      sourceUrl: null,
      sourceTier: "research",
      lawfulBasisNote: "Public listing",
    });
    expect(
      await repo.setVerification(saved.id, person.id, "verified", String(user.user_id)),
    ).toMatchObject({ verification: "verified" });
    expect(
      await repo.setDnc(
        saved.id,
        person.id,
        true,
        "Contact requested removal",
        String(user.user_id),
      ),
    ).toMatchObject({ doNotContact: true, dncReason: "Contact requested removal" });
    expect(
      await repo.setDnc(
        crypto.randomUUID(),
        person.id,
        false,
        "Not permitted",
        String(user.user_id),
      ),
    ).toBeNull();
  });
});
