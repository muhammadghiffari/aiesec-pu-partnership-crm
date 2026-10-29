import { describe, expect, it } from "vitest";
import { buildPricingHarness, CYCLE } from "./test-support";

type H = Awaited<ReturnType<typeof buildPricingHarness>>;

const ITEM_ID = "34343434-3434-4434-8434-343434343434";

const custom = (
  cat: { logo: { itemId: string }; post: { itemId: string }; booth: { itemId: string } },
  extra: Record<string, unknown> = {},
) => ({
  cycleId: CYCLE,
  catalogName: "ESSM BD Rate Card (synthetic)",
  mode: "CUSTOM",
  customLines: [{ itemId: cat.booth.itemId, quantity: 2 }],
  ...extra,
});

async function staffToken(h: H) {
  return h.login("staff@example.invalid");
}

describe("creating a proposal", () => {
  it("prices a CUSTOM proposal from the active catalog and stores a full snapshot", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const t = await staffToken(h);
    const r = await h.proposals.createProposal(
      t,
      custom(cat, {
        customLines: [
          { itemId: cat.booth.itemId, quantity: 2 },
          { itemId: cat.post.itemId, quantity: "1.5", agreedUnitValue: 200_000 },
        ],
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        proposal: {
          pricingMode: "CUSTOM",
          status: "DRAFT",
          currency: "IDR",
          calculatedValue: 2_000_000 + 300_000,
          packageId: null,
        },
      },
    });
    const lines = r.ok ? r.value.lines : [];
    expect(
      lines.map((l) => [
        l.benefitNameSnapshot,
        l.unitSnapshot,
        l.quantity,
        l.catalogUnitValueSnapshot,
        l.agreedUnitValue,
        l.lineTotalValue,
        l.rateCardVersionSnapshot,
        l.source,
      ]),
    ).toEqual([
      ["Event booth", "booth", "2.000", 1_000_000, 1_000_000, 2_000_000, 1, "CUSTOM"],
      ["Social media post", "post", "1.500", 250_000, 200_000, 300_000, 1, "CUSTOM"],
    ]);
    expect((await h.auditStore.list({ entityType: "proposal" }))[0]).toMatchObject({
      actorUserId: "u-staff",
      metadata: { mode: "CUSTOM", lines: 2, calculatedValue: 2_300_000, catalogVersion: 1 },
    });
  });

  it("PACKAGE: worth the listed price, benefit lines included once", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const r = await h.proposals.createProposal(await staffToken(h), {
      cycleId: CYCLE,
      catalogName: h.NAME,
      mode: "PACKAGE",
      packageId: cat.pkg.packageId,
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        proposal: { calculatedValue: 600_000, packageId: cat.pkg.packageId },
        packageBenefitsReferenceValue: 1_000_000,
      },
    });
    expect(r.ok && r.value.lines.map((l) => [l.source, l.quantity, l.lineTotalValue])).toEqual([
      ["PACKAGE", "1.000", 500_000],
      ["PACKAGE", "2.000", 500_000],
    ]);
  });

  it("HYBRID: package price plus custom lines for benefits not in the package", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const r = await h.proposals.createProposal(await staffToken(h), {
      ...custom(cat),
      mode: "HYBRID",
      packageId: cat.pkg.packageId,
    });
    expect(r).toMatchObject({
      ok: true,
      value: { proposal: { calculatedValue: 600_000 + 2_000_000 } },
    });
  });

  it("a custom line for a benefit the package already includes is refused (double count)", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    expect(
      await h.proposals.createProposal(await staffToken(h), {
        ...custom(cat, { customLines: [{ itemId: cat.logo.itemId, quantity: 1 }] }),
        mode: "HYBRID",
        packageId: cat.pkg.packageId,
      }),
    ).toMatchObject({ ok: false, code: "DOUBLE_COUNTED_BENEFIT" });
    expect(h.proposalRepo.proposals.size).toBe(0);
  });

  it("the same benefit twice is refused; nothing is stored", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    expect(
      await h.proposals.createProposal(
        await staffToken(h),
        custom(cat, {
          customLines: [
            { itemId: cat.booth.itemId, quantity: 1 },
            { itemId: cat.booth.itemId, quantity: 2 },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, code: "DUPLICATE_BENEFIT" });
    expect(h.proposalRepo.proposals.size + h.proposalRepo.lines.size).toBe(0);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["four decimals", "1.0001"],
    ["exponent", "1e3"],
    ["NaN", Number.NaN],
    ["too large", 20_000],
    ["text", "two"],
  ])("rejects quantity %s", async (_n, quantity) => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const r = await h.proposals.createProposal(
      await staffToken(h),
      custom(cat, { customLines: [{ itemId: cat.booth.itemId, quantity }] }),
    );
    expect(r.ok).toBe(false);
    expect(h.proposalRepo.proposals.size).toBe(0);
  });

  it("rejects fractional or negative agreed rupiah, forged totals and unknown fields", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const t = await staffToken(h);
    for (const bad of [
      custom(cat, {
        customLines: [{ itemId: cat.booth.itemId, quantity: 1, agreedUnitValue: 1000.5 }],
      }),
      custom(cat, {
        customLines: [{ itemId: cat.booth.itemId, quantity: 1, agreedUnitValue: -1 }],
      }),
      custom(cat, { calculatedValue: 1 }),
      custom(cat, { customLines: [{ itemId: cat.booth.itemId, quantity: 1, lineTotalValue: 1 }] }),
      custom(cat, { mode: "FREE" }),
      custom(cat, { currency: "USD" }),
    ]) {
      expect(await h.proposals.createProposal(t, bad), JSON.stringify(bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
  });

  it("rounds half up per line, then sums", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog("2026-01-01", { logo: 333, post: 333, booth: 1_000_000 });
    const r = await h.proposals.createProposal(
      await staffToken(h),
      custom(cat, {
        customLines: [
          { itemId: cat.logo.itemId, quantity: "1.5" },
          { itemId: cat.post.itemId, quantity: "1.5" },
        ],
      }),
    );
    expect(r.ok && r.value.lines.map((l) => l.lineTotalValue)).toEqual([500, 500]);
    expect(r.ok && r.value.proposal.calculatedValue).toBe(1000);
  });

  it("requires an existing cycle and an active catalog covering today", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog("2026-11-01"); // starts after the harness clock (2026-10-29)
    const t = await staffToken(h);
    expect(
      await h.proposals.createProposal(
        t,
        custom(cat, { cycleId: "99999999-9999-4999-8999-999999999999" }),
      ),
    ).toMatchObject({ code: "CYCLE_NOT_FOUND" });
    expect(await h.proposals.createProposal(t, custom(cat))).toMatchObject({
      code: "NO_ACTIVE_CATALOG",
    });
    expect(
      await h.proposals.createProposal(t, custom(cat, { catalogName: "Unknown Card" })),
    ).toMatchObject({ code: "CATALOG_NOT_FOUND" });
  });

  it("refuses inactive items, items of another catalog, and packages of another version", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const t = await staffToken(h);
    expect(
      await h.proposals.createProposal(
        t,
        custom(cat, {
          customLines: [{ itemId: "99999999-9999-4999-8999-999999999999", quantity: 1 }],
        }),
      ),
    ).toMatchObject({ code: "ITEM_NOT_IN_CATALOG" });
    expect(
      await h.proposals.createProposal(t, {
        cycleId: CYCLE,
        catalogName: h.NAME,
        mode: "PACKAGE",
        packageId: "99999999-9999-4999-8999-999999999999",
      }),
    ).toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    expect(
      await h.proposals.createProposal(t, { cycleId: CYCLE, catalogName: h.NAME, mode: "PACKAGE" }),
    ).toMatchObject({ ok: false });
    expect(
      await h.proposals.createProposal(t, custom(cat, { packageId: cat.pkg.packageId })),
    ).toMatchObject({ ok: false });
  });

  it("an empty proposal is refused", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    expect(
      await h.proposals.createProposal(await staffToken(h), custom(cat, { customLines: [] })),
    ).toMatchObject({ code: "NO_LINES" });
  });

  it("viewers and anonymous callers cannot create", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    for (const t of [await h.login("viewer@example.invalid"), undefined]) {
      expect((await h.proposals.createProposal(t, custom(cat))).ok).toBe(false);
    }
    expect(h.proposalRepo.proposals.size).toBe(0);
  });

  it("an audit failure stores neither the proposal nor its lines", async () => {
    const f = await buildPricingHarness({ failAudit: true });
    // The catalog cannot be built through the audited service when audit is failing: seed it.
    f.catalogRepo.versions.set("v", {
      rateCardId: "v",
      name: f.NAME,
      version: 1,
      currency: "IDR",
      status: "ACTIVE",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      ownerId: "u-tlbd",
    });
    f.catalogRepo.items.set(ITEM_ID, {
      itemId: ITEM_ID,
      rateCardId: "v",
      category: "BRANDING",
      benefitName: "Logo",
      monetizedUnitValue: 1000,
      unit: "slot",
      active: true,
      valueStatus: "CONFIRMED",
      confirmedBy: "u",
      confirmedAt: new Date(),
    });
    await expect(
      f.proposals.createProposal(await f.login("staff@example.invalid"), {
        cycleId: CYCLE,
        catalogName: f.NAME,
        mode: "CUSTOM",
        customLines: [{ itemId: ITEM_ID, quantity: 1 }],
      }),
    ).rejects.toThrow(/audit write failed/);
    expect(f.proposalRepo.proposals.size + f.proposalRepo.lines.size).toBe(0);
  });
});

describe("package edits and catalog version changes never alter a stored proposal", () => {
  async function stored(h: H, cat: Awaited<ReturnType<H["activeCatalog"]>>) {
    const t = await staffToken(h);
    const r = await h.proposals.createProposal(t, {
      ...custom(cat),
      mode: "HYBRID",
      packageId: cat.pkg.packageId,
    });
    if (!r.ok) throw new Error(r.code);
    return { t, proposal: r.value.proposal, lines: r.value.lines };
  }

  it("activating a new catalog version with different values leaves the old proposal byte-identical", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog("2026-01-01");
    const { t, proposal } = await stored(h, cat);
    const before = JSON.stringify(
      await h.proposals.getProposal(t, { proposalId: proposal.proposalId }),
    );

    const d2 = await h.ratecard.createDraft(cat.token, {
      name: h.NAME,
      effectiveFrom: "2026-12-01",
      copyFromRateCardId: cat.version.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const items2 = await h.catalogRepo.listItems(d2.value.rateCardId);
    for (const i of items2)
      await h.ratecard.updateItem(cat.token, {
        itemId: i.itemId,
        monetizedUnitValue: i.monetizedUnitValue * 3,
      });
    const pkgs2 = await h.catalogRepo.listPackages(d2.value.rateCardId);
    await h.ratecard.updatePackage(cat.token, {
      packageId: pkgs2[0]?.packageId,
      listedPrice: 9_999_000,
    });
    expect(
      (
        await h.ratecard.activate(cat.token, {
          rateCardId: d2.value.rateCardId,
          acknowledgeUnconfirmed: true,
        })
      ).ok,
    ).toBe(true);

    expect(
      JSON.stringify(await h.proposals.getProposal(t, { proposalId: proposal.proposalId })),
    ).toBe(before);
    // New proposals use the new version and new prices once it is effective...
    h.clock.advance(40 * 24 * 60 * 60 * 1000);
    const t2 = await staffToken(h);
    const v2Booth = (await h.catalogRepo.listItems(d2.value.rateCardId)).find(
      (i) => i.benefitName === "Event booth",
    );
    const fresh = await h.proposals.createProposal(
      t2,
      custom(cat, { customLines: [{ itemId: v2Booth?.itemId, quantity: 2 }] }),
    );
    expect(fresh).toMatchObject({
      ok: true,
      value: {
        proposal: { calculatedValue: 6_000_000 },
        lines: [{ rateCardVersionSnapshot: 2, catalogUnitValueSnapshot: 3_000_000 }],
      },
    });
    // ...and an item id from the retired v1 can no longer be used for a new proposal.
    expect(await h.proposals.createProposal(t2, custom(cat))).toMatchObject({
      ok: false,
      code: "ITEM_NOT_IN_CATALOG",
    });
  });

  it("the snapshot keeps its own name, unit and values even though the catalog moved on", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    const { t, proposal } = await stored(h, cat);
    const d2 = await h.ratecard.createDraft(cat.token, {
      name: h.NAME,
      effectiveFrom: "2026-12-01",
      copyFromRateCardId: cat.version.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const first = (await h.catalogRepo.listItems(d2.value.rateCardId)).find(
      (i) => i.benefitName === "Event booth",
    );
    await h.ratecard.updateItem(cat.token, {
      itemId: first?.itemId,
      benefitName: "Exhibition booth",
      unit: "stand",
      monetizedUnitValue: 1,
    });
    await h.ratecard.activate(cat.token, {
      rateCardId: d2.value.rateCardId,
      acknowledgeUnconfirmed: true,
    });
    const view = await h.proposals.getProposal(t, { proposalId: proposal.proposalId });
    const booth = view.ok ? view.value.lines.find((l) => l.source === "CUSTOM") : undefined;
    expect(booth).toMatchObject({
      benefitNameSnapshot: "Event booth",
      unitSnapshot: "booth",
      catalogUnitValueSnapshot: 1_000_000,
      lineTotalValue: 2_000_000,
      rateCardVersionSnapshot: 1,
    });
  });

  it("editing the live catalog is impossible, so a package edit can only appear in a new draft version", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog();
    expect(
      await h.ratecard.updatePackage(cat.token, { packageId: cat.pkg.packageId, listedPrice: 1 }),
    ).toMatchObject({ ok: false, code: "NOT_A_DRAFT" });
    expect(
      await h.ratecard.setPackageBenefits(cat.token, {
        packageId: cat.pkg.packageId,
        benefits: [],
      }),
    ).toMatchObject({ ok: false, code: "NOT_A_DRAFT" });
  });

  it("new proposals price only from an ACTIVE version, never from a retired one, even on a date inside its old window", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog("2026-01-01");
    // v2 starts 2026-10-01 so v1 is retired with a window ending 2026-09-30; v2 itself is ACTIVE.
    const d2 = await h.ratecard.createDraft(cat.token, {
      name: h.NAME,
      effectiveFrom: "2026-10-01",
      copyFromRateCardId: cat.version.rateCardId,
    });
    if (!d2.ok) throw new Error();
    await h.ratecard.activate(cat.token, {
      rateCardId: d2.value.rateCardId,
      acknowledgeUnconfirmed: true,
    });
    expect(h.catalogRepo.versions.get(cat.version.rateCardId)).toMatchObject({
      status: "RETIRED",
      effectiveTo: "2026-09-30",
    });

    // Today (2026-10-29) is covered by v2 only. A v1 item must be refused for a new proposal.
    const t = await staffToken(h);
    expect(await h.proposals.createProposal(t, custom(cat))).toMatchObject({
      ok: false,
      code: "ITEM_NOT_IN_CATALOG",
    });

    // Move "today" back inside v1's retired window: there is no ACTIVE version covering it, so pricing is refused
    // rather than silently reviving a retired catalog.
    h.clock.advance(-40 * 24 * 60 * 60 * 1000);
    const t2 = await staffToken(h);
    expect(await h.proposals.createProposal(t2, custom(cat))).toMatchObject({
      ok: false,
      code: "NO_ACTIVE_CATALOG",
    });
    expect(h.proposalRepo.proposals.size).toBe(0);
  });

  it("a proposal made on a retired version still prices from that version's own lines", async () => {
    const h = await buildPricingHarness();
    const cat = await h.activeCatalog("2026-01-01");
    const { t, proposal, lines } = await stored(h, cat);
    const d2 = await h.ratecard.createDraft(cat.token, {
      name: h.NAME,
      effectiveFrom: "2026-11-01",
      copyFromRateCardId: cat.version.rateCardId,
    });
    if (!d2.ok) throw new Error();
    await h.ratecard.activate(cat.token, {
      rateCardId: d2.value.rateCardId,
      acknowledgeUnconfirmed: true,
    });
    expect(h.catalogRepo.versions.get(cat.version.rateCardId)?.status).toBe("RETIRED");
    const view = await h.proposals.getProposal(t, { proposalId: proposal.proposalId });
    expect(view.ok && view.value.lines).toEqual(lines);
    expect(view.ok && view.value.proposal.calculatedValue).toBe(proposal.calculatedValue);
  });
});

describe("draft revision and sending", () => {
  async function draft(h: H) {
    const cat = await h.activeCatalog();
    const t = await staffToken(h);
    const r = await h.proposals.createProposal(t, custom(cat));
    if (!r.ok) throw new Error(r.code);
    return { cat, t, proposal: r.value.proposal };
  }

  it("a DRAFT can be re-priced; the previous value is audited", async () => {
    const h = await buildPricingHarness();
    const { cat, t, proposal } = await draft(h);
    const r = await h.proposals.replaceProposal(t, {
      proposalId: proposal.proposalId,
      catalogName: h.NAME,
      mode: "PACKAGE",
      packageId: cat.pkg.packageId,
    });
    expect(r).toMatchObject({
      ok: true,
      value: { proposal: { pricingMode: "PACKAGE", calculatedValue: 600_000 } },
    });
    expect(h.proposalRepo.lines.size).toBe(2); // old lines replaced, not accumulated
    expect((await h.auditStore.list({ entityType: "proposal" })).at(-1)?.metadata).toMatchObject({
      previousValue: 2_000_000,
      calculatedValue: 600_000,
    });
  });

  it("sending records time and link and freezes the proposal", async () => {
    const h = await buildPricingHarness();
    const { cat, t, proposal } = await draft(h);
    const s = await h.proposals.sendProposal(t, {
      proposalId: proposal.proposalId,
      contentUrl: "https://docs.example.invalid/proposal-1",
    });
    expect(s).toMatchObject({
      ok: true,
      value: {
        proposal: {
          status: "SENT",
          contentUrl: "https://docs.example.invalid/proposal-1",
          calculatedValue: 2_000_000,
        },
      },
    });
    expect(s.ok && s.value.proposal.sentAt).toEqual(h.clock.now());
    expect(
      await h.proposals.replaceProposal(t, {
        proposalId: proposal.proposalId,
        catalogName: h.NAME,
        mode: "PACKAGE",
        packageId: cat.pkg.packageId,
      }),
    ).toMatchObject({ code: "PROPOSAL_FROZEN" });
    expect(await h.proposals.sendProposal(t, { proposalId: proposal.proposalId })).toMatchObject({
      code: "PROPOSAL_FROZEN",
    });
    expect(h.proposalRepo.proposals.get(proposal.proposalId)?.calculatedValue).toBe(2_000_000);
  });

  it("re-derives the total from the stored lines and refuses a tampered header", async () => {
    const h = await buildPricingHarness();
    const { t, proposal } = await draft(h);
    const stored = h.proposalRepo.proposals.get(proposal.proposalId);
    if (stored)
      h.proposalRepo.proposals.set(proposal.proposalId, { ...stored, calculatedValue: 9_999_999 });
    expect(await h.proposals.sendProposal(t, { proposalId: proposal.proposalId })).toMatchObject({
      ok: false,
      code: "TOTAL_MISMATCH",
    });
    expect(h.proposalRepo.proposals.get(proposal.proposalId)?.status).toBe("DRAFT");
  });

  it("refuses a link that is not http(s) or carries credentials, and an unknown proposal", async () => {
    const h = await buildPricingHarness();
    const { t, proposal } = await draft(h);
    for (const contentUrl of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://u:p@example.invalid/x",
      "not a url",
    ]) {
      expect(
        await h.proposals.sendProposal(t, { proposalId: proposal.proposalId, contentUrl }),
      ).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(
      await h.proposals.sendProposal(t, { proposalId: "99999999-9999-4999-8999-999999999999" }),
    ).toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
  });

  it("a concurrent change during send is detected", async () => {
    const h = await buildPricingHarness();
    const { t, proposal } = await draft(h);
    h.proposalRepo.beforeUpdate = (id) => {
      const p = h.proposalRepo.proposals.get(id);
      if (p) h.proposalRepo.proposals.set(id, { ...p, status: "SUPERSEDED" });
    };
    expect(await h.proposals.sendProposal(t, { proposalId: proposal.proposalId })).toMatchObject({
      code: "CONCURRENT_CHANGE",
    });
  });

  it("everyone who can read cycles may read a stored proposal; anonymous cannot", async () => {
    const h = await buildPricingHarness();
    const { proposal } = await draft(h);
    expect(
      (
        await h.proposals.getProposal(await h.login("viewer@example.invalid"), {
          proposalId: proposal.proposalId,
        })
      ).ok,
    ).toBe(true);
    expect(
      await h.proposals.getProposal(undefined, { proposalId: proposal.proposalId }),
    ).toMatchObject({ ok: false, httpStatus: 401 });
  });

  it("a proposal value never touches actual revenue: the module has no revenue dependency", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["calc.ts", "service.ts"]) {
      const src = readFileSync(join(import.meta.dirname, file), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .join("\n");
      expect(src.toLowerCase(), file).not.toMatch(
        /revenue_records|revenuerecord|financial_amount|insertrevenue|recordreceipt/,
      );
    }
  });
});
