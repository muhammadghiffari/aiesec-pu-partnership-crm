import { describe, expect, it } from "vitest";
import { buildRateCardHarness } from "./test-support";

type H = Awaited<ReturnType<typeof buildRateCardHarness>>;

const item = (rateCardId: string, extra: Record<string, unknown> = {}) => ({
  rateCardId,
  category: "BRANDING",
  benefitName: "Social media post",
  monetizedUnitValue: 250_000,
  unit: "post",
  ...extra,
});

describe("permissions (CRM Lead only, server-side)", () => {
  it("BD staff, viewers and anonymous callers cannot create, edit, confirm or activate; nothing changes", async () => {
    const h = await buildRateCardHarness();
    const { draft, item: it1 } = await h.seededDraft();
    const before = JSON.stringify([...h.repo.items.values()]);
    for (const email of ["staff@example.invalid", "viewer@example.invalid"]) {
      const t = await h.login(email);
      const attempts = [
        h.ratecard.createDraft(t, { name: "Other Card", effectiveFrom: "2026-01-01" }),
        h.ratecard.addItem(t, item(draft.rateCardId)),
        h.ratecard.updateItem(t, { itemId: it1?.itemId, monetizedUnitValue: 1 }),
        h.ratecard.confirmItemValue(t, { itemId: it1?.itemId }),
        h.ratecard.removeItem(t, { itemId: it1?.itemId }),
        h.ratecard.addPackage(t, {
          rateCardId: draft.rateCardId,
          packageName: "Community",
          listedPrice: 500_000,
        }),
        h.ratecard.activate(t, { rateCardId: draft.rateCardId, acknowledgeUnconfirmed: true }),
        h.ratecard.discardDraft(t, { rateCardId: draft.rateCardId }),
      ];
      for (const r of await Promise.all(attempts))
        expect(r).toMatchObject({ ok: false, code: "ACTION_NOT_PERMITTED", httpStatus: 403 });
    }
    for (const r of await Promise.all([
      h.ratecard.createDraft(undefined, { name: "X Card", effectiveFrom: "2026-01-01" }),
      h.ratecard.activate("forged", { rateCardId: draft.rateCardId }),
    ])) {
      expect(r).toMatchObject({ ok: false });
      expect([401, 403]).toContain(r.ok ? 0 : r.httpStatus);
    }
    expect(JSON.stringify([...h.repo.items.values()])).toBe(before);
    expect(h.repo.versions.get(draft.rateCardId)?.status).toBe("DRAFT");
    expect(
      (await h.auditStore.list({ kind: "ACCESS_DENIED" })).every(
        (e) => e.actorUserId === "u-staff" || e.actorUserId === "u-viewer",
      ),
    ).toBe(true);
  });

  it("TL BD and LCVP PD have identical edit rights, and both are recorded as the actor", async () => {
    for (const [email, id] of [
      ["tlbd@example.invalid", "u-tlbd"],
      ["lcvp.pd@example.invalid", "u-lcvp"],
    ] as const) {
      const h = await buildRateCardHarness();
      const t = await h.login(email);
      const d = await h.ratecard.createDraft(t, { name: "Lead Card", effectiveFrom: "2026-01-01" });
      expect(d).toMatchObject({ ok: true, value: { ownerId: id } });
      expect((await h.auditStore.list({ entityType: "rate_card" }))[0]?.actorUserId).toBe(id);
    }
  });

  it("everyone who can read the catalog can read a version, including viewers; anonymous cannot", async () => {
    const h = await buildRateCardHarness();
    const { draft } = await h.seededDraft();
    expect(
      await h.ratecard.getVersion(await h.login("viewer@example.invalid"), {
        rateCardId: draft.rateCardId,
      }),
    ).toMatchObject({ ok: true, value: { items: [{ benefitName: "Logo placement" }] } });
    expect(await h.ratecard.getVersion(undefined, { rateCardId: draft.rateCardId })).toMatchObject({
      ok: false,
      httpStatus: 401,
    });
  });
});

describe("versions", () => {
  it("creates version 1 as a DRAFT owned by the lead, with an audit event", async () => {
    const h = await buildRateCardHarness();
    const { draft } = await h.seededDraft();
    expect(draft).toMatchObject({
      version: 1,
      status: "DRAFT",
      currency: "IDR",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      ownerId: "u-tlbd",
    });
    expect((await h.auditStore.list({ entityType: "rate_card" }))[0]).toMatchObject({
      entityId: draft.rateCardId,
      metadata: { version: 1, copiedItems: 0 },
    });
  });

  it("only one draft per catalog; a new draft is the next consecutive version", async () => {
    const h = await buildRateCardHarness();
    const first = await h.activated();
    const t = await h.lead();
    const second = await h.ratecard.createDraft(t, {
      name: h.NAME,
      effectiveFrom: "2027-01-01",
      copyFromRateCardId: first.activated.rateCardId,
    });
    expect(second).toMatchObject({ ok: true, value: { version: 2, status: "DRAFT" } });
    expect(
      await h.ratecard.createDraft(t, { name: h.NAME, effectiveFrom: "2027-06-01" }),
    ).toMatchObject({ ok: false, code: "DRAFT_EXISTS" });
  });

  it("copying a version copies items and packages but resets every value to PROPOSED", async () => {
    const h = await buildRateCardHarness();
    const first = await h.activated();
    const t = await h.lead();
    await h.ratecard
      .addPackage(t, {
        rateCardId: first.activated.rateCardId,
        packageName: "Community",
        listedPrice: 500_000,
      })
      .then((r) => expect(r).toMatchObject({ code: "NOT_A_DRAFT" }));
    const d2 = await h.ratecard.createDraft(t, {
      name: h.NAME,
      effectiveFrom: "2027-01-01",
      copyFromRateCardId: first.activated.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const copied = await h.ratecard.getVersion(t, { rateCardId: d2.value.rateCardId });
    expect(copied).toMatchObject({
      ok: true,
      value: {
        items: [
          {
            benefitName: "Logo placement",
            monetizedUnitValue: 500_000,
            valueStatus: "PROPOSED",
            confirmedBy: null,
          },
        ],
      },
    });
    expect(copied.ok && copied.value.items[0]?.itemId).not.toBe(first.item?.itemId);
  });

  it("cannot copy from a different catalog or an unknown version", async () => {
    const h = await buildRateCardHarness();
    const other = await h.seededDraft({ name: "Another Card" });
    const t = await h.lead();
    expect(
      await h.ratecard.createDraft(t, {
        name: h.NAME,
        effectiveFrom: "2026-01-01",
        copyFromRateCardId: other.draft.rateCardId,
      }),
    ).toMatchObject({ code: "VERSION_NOT_FOUND" });
    expect(
      await h.ratecard.createDraft(t, {
        name: h.NAME,
        effectiveFrom: "2026-01-01",
        copyFromRateCardId: crypto.randomUUID(),
      }),
    ).toMatchObject({ code: "VERSION_NOT_FOUND" });
  });

  it("validates input strictly", async () => {
    const h = await buildRateCardHarness();
    const t = await h.lead();
    for (const bad of [
      { name: "x", effectiveFrom: "2026-01-01" },
      { name: "Valid Card", effectiveFrom: "2026-13-01" },
      { name: "Valid Card", effectiveFrom: "2026-02-30" },
      { name: "Valid Card", effectiveFrom: "01/01/2026" },
      { name: "Valid Card", effectiveFrom: "2026-01-01", currency: "rupiah" },
      { name: "Valid Card", effectiveFrom: "2026-01-01", status: "ACTIVE" },
      { name: "Valid Card", effectiveFrom: "2026-01-01", version: 7 },
    ]) {
      expect(await h.ratecard.createDraft(t, bad), JSON.stringify(bad)).toMatchObject({
        ok: false,
        code: "VALIDATION_FAILED",
      });
    }
    expect(h.repo.versions.size).toBe(0);
  });

  it("a draft can be discarded; an active version cannot", async () => {
    const h = await buildRateCardHarness();
    const { draft, token } = await h.seededDraft();
    expect(await h.ratecard.discardDraft(token, { rateCardId: draft.rateCardId })).toMatchObject({
      ok: true,
    });
    expect(h.repo.versions.size).toBe(0);
    expect(h.repo.items.size).toBe(0);
    const a = await h.activated({ name: "Second Card" });
    expect(
      await h.ratecard.discardDraft(a.token, { rateCardId: a.activated.rateCardId }),
    ).toMatchObject({ ok: false, code: "NOT_A_DRAFT" });
  });
});

describe("items and monetized values", () => {
  it("adds items as PROPOSED integer-rupiah values with an audit trail", async () => {
    const h = await buildRateCardHarness();
    const { draft, token } = await h.seededDraft();
    const r = await h.ratecard.addItem(token, item(draft.rateCardId));
    expect(r).toMatchObject({
      ok: true,
      value: {
        monetizedUnitValue: 250_000,
        valueStatus: "PROPOSED",
        confirmedBy: null,
        active: true,
      },
    });
  });

  it.each([
    ["negative", { monetizedUnitValue: -1 }],
    ["fractional rupiah", { monetizedUnitValue: 1000.5 }],
    ["NaN", { monetizedUnitValue: Number.NaN }],
    ["too large", { monetizedUnitValue: 2_000_000_000_000 }],
    ["string number", { monetizedUnitValue: "1000" }],
    ["lower-case category", { category: "branding" }],
    ["empty unit", { unit: "" }],
    ["extra field", { valueStatus: "CONFIRMED" }],
  ])("rejects %s", async (_n, bad) => {
    const h = await buildRateCardHarness();
    const { draft, token } = await h.seededDraft();
    expect(await h.ratecard.addItem(token, item(draft.rateCardId, bad))).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });

  it("zero is a valid value (a free benefit); unknown categories and duplicates are not", async () => {
    const h = await buildRateCardHarness();
    const { draft, token } = await h.seededDraft();
    expect(
      (await h.ratecard.addItem(token, item(draft.rateCardId, { monetizedUnitValue: 0 }))).ok,
    ).toBe(true);
    expect(
      await h.ratecard.addItem(token, item(draft.rateCardId, { category: "NOPE" })),
    ).toMatchObject({ code: "CATEGORY_UNKNOWN" });
    expect(
      await h.ratecard.addItem(token, item(draft.rateCardId, { benefitName: "SOCIAL MEDIA POST" })),
    ).toMatchObject({ code: "DUPLICATE_NAME" });
  });

  it("editing a value is allowed in a draft, audited with previous and new value", async () => {
    const h = await buildRateCardHarness();
    const { token, item: it1 } = await h.seededDraft();
    const r = await h.ratecard.updateItem(token, {
      itemId: it1?.itemId,
      monetizedUnitValue: 750_000,
    });
    expect(r).toMatchObject({ ok: true, value: { monetizedUnitValue: 750_000 } });
    expect(
      (await h.auditStore.list({ entityType: "rate_card_item" })).at(-1)?.metadata,
    ).toMatchObject({
      changedFields: ["monetizedUnitValue"],
      previousValue: 500_000,
      newValue: 750_000,
    });
  });

  it("a confirmation records who and when, and editing the value voids it", async () => {
    const h = await buildRateCardHarness();
    const { token, item: it1 } = await h.seededDraft();
    const c = await h.ratecard.confirmItemValue(token, { itemId: it1?.itemId });
    expect(c).toMatchObject({
      ok: true,
      value: { valueStatus: "CONFIRMED", confirmedBy: "u-tlbd" },
    });
    expect(await h.ratecard.confirmItemValue(token, { itemId: it1?.itemId })).toMatchObject({
      code: "NO_CHANGE",
    });
    const e = await h.ratecard.updateItem(token, {
      itemId: it1?.itemId,
      monetizedUnitValue: 600_000,
    });
    expect(e).toMatchObject({ ok: true, value: { valueStatus: "PROPOSED", confirmedBy: null } });
    expect(
      (await h.auditStore.list({ entityType: "rate_card_item" })).at(-1)?.metadata,
    ).toMatchObject({ confirmationReset: true });
  });

  it("toggling active alone does not void a confirmation", async () => {
    const h = await buildRateCardHarness();
    const { token, item: it1 } = await h.seededDraft({ confirm: true });
    expect(
      await h.ratecard.updateItem(token, { itemId: it1?.itemId, active: false }),
    ).toMatchObject({ ok: true, value: { active: false, valueStatus: "CONFIRMED" } });
  });

  it("an update that changes nothing is refused", async () => {
    const h = await buildRateCardHarness();
    const { token, item: it1 } = await h.seededDraft();
    expect(
      await h.ratecard.updateItem(token, { itemId: it1?.itemId, monetizedUnitValue: 500_000 }),
    ).toMatchObject({ code: "NO_CHANGE" });
  });

  it("an item referenced by a proposal cannot be removed", async () => {
    const h = await buildRateCardHarness();
    const { token, item: it1 } = await h.seededDraft();
    h.repo.referencedItems.add(it1?.itemId ?? "");
    expect(await h.ratecard.removeItem(token, { itemId: it1?.itemId })).toMatchObject({
      code: "ITEM_IN_USE",
    });
    expect(h.repo.items.size).toBe(1);
  });
});

describe("historic versions are preserved", () => {
  it("an ACTIVE version rejects every edit: items, packages, values, confirmations", async () => {
    const h = await buildRateCardHarness();
    const { token, activated, item: it1 } = await h.activated();
    const snapshot = JSON.stringify([...h.repo.items.values()]);
    const results = await Promise.all([
      h.ratecard.addItem(token, item(activated.rateCardId)),
      h.ratecard.updateItem(token, { itemId: it1?.itemId, monetizedUnitValue: 1 }),
      h.ratecard.removeItem(token, { itemId: it1?.itemId }),
      h.ratecard.confirmItemValue(token, { itemId: it1?.itemId }),
      h.ratecard.addPackage(token, {
        rateCardId: activated.rateCardId,
        packageName: "Community",
        listedPrice: 1,
      }),
    ]);
    for (const r of results)
      expect(r).toMatchObject({ ok: false, code: "NOT_A_DRAFT", httpStatus: 409 });
    expect(JSON.stringify([...h.repo.items.values()])).toBe(snapshot);
  });

  it("activating v2 retires v1, ends its window the day before, and leaves v1's values untouched", async () => {
    const h = await buildRateCardHarness();
    const v1 = await h.activated({ value: 500_000 });
    const d2 = await h.ratecard.createDraft(v1.token, {
      name: h.NAME,
      effectiveFrom: "2027-03-01",
      copyFromRateCardId: v1.activated.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const items2 = (await h.repo.listItems(d2.value.rateCardId))[0];
    await h.ratecard.updateItem(v1.token, { itemId: items2?.itemId, monetizedUnitValue: 900_000 });
    const act = await h.ratecard.activate(v1.token, {
      rateCardId: d2.value.rateCardId,
      acknowledgeUnconfirmed: true,
    });
    expect(act).toMatchObject({
      ok: true,
      value: {
        activated: { version: 2, status: "ACTIVE" },
        retired: { version: 1, status: "RETIRED", effectiveTo: "2027-02-28" },
      },
    });
    expect(h.repo.versions.get(v1.activated.rateCardId)).toMatchObject({
      status: "RETIRED",
      effectiveTo: "2027-02-28",
      effectiveFrom: "2026-01-01",
    });
    expect((await h.repo.listItems(v1.activated.rateCardId))[0]?.monetizedUnitValue).toBe(500_000);
    expect((await h.repo.listItems(d2.value.rateCardId))[0]?.monetizedUnitValue).toBe(900_000);
    expect((await h.auditStore.list({ entityType: "rate_card" })).at(-1)?.metadata).toMatchObject({
      version: 2,
      retiredVersion: 1,
    });
  });

  it("the version effective on a date is resolved from history, never from a draft", async () => {
    const h = await buildRateCardHarness();
    const v1 = await h.activated();
    const d2 = await h.ratecard.createDraft(v1.token, {
      name: h.NAME,
      effectiveFrom: "2027-03-01",
      copyFromRateCardId: v1.activated.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const viewer = await h.login("viewer@example.invalid");
    const at = (onDate: string) =>
      h.ratecard.findEffectiveVersion(viewer, { name: h.NAME, onDate });
    expect(await at("2026-06-15")).toMatchObject({ ok: true, value: { version: 1 } });
    // v2 is only a draft, so it is never returned: the open-ended ACTIVE v1 still applies.
    expect(await at("2027-03-05")).toMatchObject({
      ok: true,
      value: { version: 1, status: "ACTIVE" },
    });
    await h.ratecard.activate(v1.token, {
      rateCardId: d2.value.rateCardId,
      acknowledgeUnconfirmed: true,
    });
    expect(await at("2026-06-15")).toMatchObject({
      ok: true,
      value: { version: 1, status: "RETIRED" },
    });
    expect(await at("2027-02-28")).toMatchObject({ ok: true, value: { version: 1 } });
    expect(await at("2027-03-01")).toMatchObject({
      ok: true,
      value: { version: 2, status: "ACTIVE" },
    });
    expect(await at("2025-12-31")).toMatchObject({ ok: false, code: "NOT_ACTIVE" });
    expect(
      await h.ratecard.findEffectiveVersion(viewer, { name: "Unknown Card", onDate: "2026-06-15" }),
    ).toMatchObject({ code: "CATALOG_NOT_FOUND" });
  });

  it("v2 must start after v1 started (no overlapping or backdated window)", async () => {
    const h = await buildRateCardHarness();
    const v1 = await h.activated({ effectiveFrom: "2026-06-01" });
    for (const from of ["2026-06-01", "2026-01-01"]) {
      const d = await h.ratecard.createDraft(v1.token, {
        name: h.NAME,
        effectiveFrom: from,
        copyFromRateCardId: v1.activated.rateCardId,
      });
      if (!d.ok) throw new Error();
      expect(
        await h.ratecard.activate(v1.token, {
          rateCardId: d.value.rateCardId,
          acknowledgeUnconfirmed: true,
        }),
      ).toMatchObject({ ok: false, code: "EFFECTIVE_DATE_CONFLICT" });
      await h.ratecard.discardDraft(v1.token, { rateCardId: d.value.rateCardId });
    }
    expect(h.repo.versions.get(v1.activated.rateCardId)?.status).toBe("ACTIVE");
  });

  it("a concurrent change during activation rolls everything back", async () => {
    const h = await buildRateCardHarness();
    const v1 = await h.activated();
    const d2 = await h.ratecard.createDraft(v1.token, {
      name: h.NAME,
      effectiveFrom: "2027-01-01",
      copyFromRateCardId: v1.activated.rateCardId,
    });
    if (!d2.ok) throw new Error();
    let calls = 0;
    h.repo.beforeVersionUpdate = (id) => {
      if (++calls === 2) {
        const v = h.repo.versions.get(id);
        if (v) h.repo.versions.set(id, { ...v, status: "RETIRED", effectiveTo: "2027-12-31" }); // someone else changed the draft
      }
    };
    expect(
      await h.ratecard.activate(v1.token, {
        rateCardId: d2.value.rateCardId,
        acknowledgeUnconfirmed: true,
      }),
    ).toMatchObject({ ok: false, code: "CONCURRENT_CHANGE" });
    expect(h.repo.versions.get(v1.activated.rateCardId)?.status).toBe("ACTIVE"); // v1 not retired by the failed attempt
  });
});

describe("activation gates", () => {
  it("needs at least one item", async () => {
    const h = await buildRateCardHarness();
    const t = await h.lead();
    const d = await h.ratecard.createDraft(t, { name: "Empty Card", effectiveFrom: "2026-01-01" });
    if (!d.ok) throw new Error();
    expect(await h.ratecard.activate(t, { rateCardId: d.value.rateCardId })).toMatchObject({
      ok: false,
      code: "NO_ITEMS",
    });
  });

  it("unconfirmed values block activation unless explicitly acknowledged, and are counted", async () => {
    const h = await buildRateCardHarness();
    const { token, draft } = await h.seededDraft();
    expect(await h.ratecard.activate(token, { rateCardId: draft.rateCardId })).toMatchObject({
      ok: false,
      code: "UNCONFIRMED_VALUES",
      httpStatus: 422,
    });
    expect(h.repo.versions.get(draft.rateCardId)?.status).toBe("DRAFT");
    expect(
      await h.ratecard.activate(token, {
        rateCardId: draft.rateCardId,
        acknowledgeUnconfirmed: true,
      }),
    ).toMatchObject({ ok: true, value: { unconfirmedItems: 1 } });
  });

  it("inactive unconfirmed items do not block activation", async () => {
    const h = await buildRateCardHarness();
    const { token, draft, item: it1 } = await h.seededDraft();
    await h.ratecard.updateItem(token, { itemId: it1?.itemId, active: false });
    expect(await h.ratecard.activate(token, { rateCardId: draft.rateCardId })).toMatchObject({
      ok: true,
      value: { unconfirmedItems: 0 },
    });
  });

  it("an already-active version cannot be activated again", async () => {
    const h = await buildRateCardHarness();
    const a = await h.activated();
    expect(
      await h.ratecard.activate(a.token, { rateCardId: a.activated.rateCardId }),
    ).toMatchObject({ code: "NOT_A_DRAFT" });
  });

  it("an audit failure leaves the draft a draft", async () => {
    const h = await buildRateCardHarness({ failAudit: true });
    const draftId = crypto.randomUUID();
    h.repo.versions.set(draftId, {
      rateCardId: draftId,
      name: "Audit Card",
      version: 1,
      currency: "IDR",
      status: "DRAFT",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      ownerId: "u-tlbd",
    });
    h.repo.items.set("i1", {
      itemId: "i1",
      rateCardId: draftId,
      category: "BRANDING",
      benefitName: "x item",
      monetizedUnitValue: 1,
      unit: "u",
      active: true,
      valueStatus: "CONFIRMED",
      confirmedBy: "u-tlbd",
      confirmedAt: new Date(),
    });
    const t = await h.lead();
    await expect(h.ratecard.activate(t, { rateCardId: draftId })).rejects.toThrow(
      /audit write failed/,
    );
    expect(h.repo.versions.get(draftId)?.status).toBe("DRAFT");
  });
});

describe("packages", () => {
  async function withItems(h: H) {
    const s = await h.seededDraft();
    const second = await h.ratecard.addItem(s.token, item(s.draft.rateCardId));
    if (!second.ok || !s.item) throw new Error();
    return { ...s, second: second.value, first: s.item };
  }

  it("creates a package and sets its benefits; each benefit counts once", async () => {
    const h = await buildRateCardHarness();
    const s = await withItems(h);
    const pkg = await h.ratecard.addPackage(s.token, {
      rateCardId: s.draft.rateCardId,
      packageName: "Community",
      listedPrice: 500_000,
      slotLimits: "max 5 partners",
    });
    if (!pkg.ok) throw new Error();
    const set = await h.ratecard.setPackageBenefits(s.token, {
      packageId: pkg.value.packageId,
      benefits: [
        { itemId: s.first.itemId, includedQty: 2 },
        { itemId: s.second.itemId, includedQty: 1, slotLimit: 3 },
      ],
    });
    expect(set).toMatchObject({
      ok: true,
      value: [
        { includedQty: 2, slotLimit: null },
        { includedQty: 1, slotLimit: 3 },
      ],
    });
    expect(
      await h.ratecard.setPackageBenefits(s.token, {
        packageId: pkg.value.packageId,
        benefits: [
          { itemId: s.first.itemId, includedQty: 1 },
          { itemId: s.first.itemId, includedQty: 2 },
        ],
      }),
    ).toMatchObject({ ok: false, code: "DUPLICATE_NAME" });
    expect((await h.repo.listPackageBenefits(s.draft.rateCardId)).length).toBe(2); // failed replace rolled back
  });

  it("a package cannot include a benefit from another version of the catalog", async () => {
    const h = await buildRateCardHarness();
    const s = await withItems(h);
    const other = await h.seededDraft({ name: "Other Card" });
    const pkg = await h.ratecard.addPackage(s.token, {
      rateCardId: s.draft.rateCardId,
      packageName: "Brand",
      listedPrice: 1_500_000,
    });
    if (!pkg.ok || !other.item) throw new Error();
    expect(
      await h.ratecard.setPackageBenefits(s.token, {
        packageId: pkg.value.packageId,
        benefits: [{ itemId: other.item.itemId, includedQty: 1 }],
      }),
    ).toMatchObject({ code: "CROSS_VERSION_REFERENCE" });
  });

  it("validates price, quantity and uniqueness; updates are audited with old and new price", async () => {
    const h = await buildRateCardHarness();
    const s = await withItems(h);
    for (const bad of [
      { listedPrice: -1 },
      { listedPrice: 10.5 },
      { packageName: "x" },
      { slotLimits: "s".repeat(301) },
    ]) {
      expect(
        await h.ratecard.addPackage(s.token, {
          rateCardId: s.draft.rateCardId,
          packageName: "Engagement",
          listedPrice: 3_000_000,
          ...bad,
        }),
      ).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    const pkg = await h.ratecard.addPackage(s.token, {
      rateCardId: s.draft.rateCardId,
      packageName: "Engagement",
      listedPrice: 3_000_000,
    });
    if (!pkg.ok) throw new Error();
    expect(
      await h.ratecard.addPackage(s.token, {
        rateCardId: s.draft.rateCardId,
        packageName: "ENGAGEMENT",
        listedPrice: 1,
      }),
    ).toMatchObject({ code: "DUPLICATE_NAME" });
    expect(
      await h.ratecard.updatePackage(s.token, {
        packageId: pkg.value.packageId,
        listedPrice: 3_500_000,
      }),
    ).toMatchObject({ ok: true, value: { listedPrice: 3_500_000 } });
    expect(
      (await h.auditStore.list({ entityType: "rate_card_package" })).at(-1)?.metadata,
    ).toMatchObject({ previousPrice: 3_000_000, newPrice: 3_500_000 });
    expect(
      await h.ratecard.setPackageBenefits(s.token, {
        packageId: pkg.value.packageId,
        benefits: [{ itemId: s.first.itemId, includedQty: 0 }],
      }),
    ).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("copying a version re-links package benefits to the copied items", async () => {
    const h = await buildRateCardHarness();
    const s = await withItems(h);
    const pkg = await h.ratecard.addPackage(s.token, {
      rateCardId: s.draft.rateCardId,
      packageName: "Community",
      listedPrice: 500_000,
    });
    if (!pkg.ok) throw new Error();
    await h.ratecard.setPackageBenefits(s.token, {
      packageId: pkg.value.packageId,
      benefits: [{ itemId: s.first.itemId, includedQty: 2 }],
    });
    await h.ratecard.confirmItemValue(s.token, { itemId: s.first.itemId });
    await h.ratecard.confirmItemValue(s.token, { itemId: s.second.itemId });
    await h.ratecard.activate(s.token, { rateCardId: s.draft.rateCardId });
    const d2 = await h.ratecard.createDraft(s.token, {
      name: h.NAME,
      effectiveFrom: "2027-01-01",
      copyFromRateCardId: s.draft.rateCardId,
    });
    if (!d2.ok) throw new Error();
    const v2 = await h.ratecard.getVersion(s.token, { rateCardId: d2.value.rateCardId });
    if (!v2.ok) throw new Error();
    const newItemIds = new Set(v2.value.items.map((i) => i.itemId));
    expect(v2.value.packages).toHaveLength(1);
    expect(v2.value.packageBenefits).toHaveLength(1);
    expect(newItemIds.has(v2.value.packageBenefits[0]?.itemId ?? "")).toBe(true);
    expect(v2.value.packageBenefits[0]?.rateCardId).toBe(d2.value.rateCardId);
  });
});
