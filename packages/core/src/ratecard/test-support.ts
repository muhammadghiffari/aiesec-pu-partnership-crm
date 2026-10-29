/**
 * Test-only harness for rate card tests: in-memory repository with rollback, wired to the audit
 * harness and the real service. Synthetic data only. Not exported from the package index.
 */

import { buildAuditHarness } from "../audit/test-support";
import { createRateCardService } from "./service";
import type {
  BenefitCategory,
  PackageBenefit,
  RateCardItem,
  RateCardPackage,
  RateCardRepository,
  RateCardStatus,
  RateCardVersion,
} from "./types";

export class InMemoryRateCardRepo implements RateCardRepository {
  categories = new Map<string, BenefitCategory>([
    ["BRANDING", { code: "BRANDING", label: "Branding", active: true }],
  ]);
  versions = new Map<string, RateCardVersion>();
  items = new Map<string, RateCardItem>();
  packages = new Map<string, RateCardPackage>();
  benefits = new Map<string, PackageBenefit>();
  /** Item ids referenced by proposals (simulates proposal_benefits). */
  referencedItems = new Set<string>();
  /** Race hook: runs before a compare-and-set version update. */
  beforeVersionUpdate?: (id: string) => void;

  snapshot() {
    const copy = <T extends object>(m: Map<string, T>) =>
      new Map([...m].map(([k, v]) => [k, { ...v }]));
    return {
      versions: copy(this.versions),
      items: copy(this.items),
      packages: copy(this.packages),
      benefits: copy(this.benefits),
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<InMemoryRateCardRepo["snapshot"]>;
    this.versions = snap.versions;
    this.items = snap.items;
    this.packages = snap.packages;
    this.benefits = snap.benefits;
  }

  async categoryExists(code: string) {
    return this.categories.get(code)?.active === true;
  }
  async latestVersion(name: string) {
    const all = await this.listVersions(name);
    return all.at(-1) ?? null;
  }
  async listVersions(name: string) {
    return [...this.versions.values()]
      .filter((v) => v.name === name)
      .sort((a, b) => a.version - b.version)
      .map((v) => ({ ...v }));
  }
  async listNames() {
    return [...new Set([...this.versions.values()].map((v) => v.name))];
  }
  async getVersion(id: string) {
    const v = this.versions.get(id);
    return v ? { ...v } : null;
  }
  async insertVersion(v: RateCardVersion) {
    this.versions.set(v.rateCardId, { ...v });
  }
  async updateVersion(id: string, expected: RateCardStatus, patch: Partial<RateCardVersion>) {
    this.beforeVersionUpdate?.(id);
    const v = this.versions.get(id);
    if (!v || v.status !== expected) return false;
    this.versions.set(id, { ...v, ...patch });
    return true;
  }
  async deleteDraft(id: string) {
    const v = this.versions.get(id);
    if (v?.status !== "DRAFT") return false;
    for (const [k, i] of this.items) if (i.rateCardId === id) this.items.delete(k);
    for (const [k, p] of this.packages) if (p.rateCardId === id) this.packages.delete(k);
    for (const [k, b] of this.benefits) if (b.rateCardId === id) this.benefits.delete(k);
    this.versions.delete(id);
    return true;
  }

  async listItems(id: string) {
    return [...this.items.values()].filter((i) => i.rateCardId === id).map((i) => ({ ...i }));
  }
  async getItem(id: string) {
    const i = this.items.get(id);
    return i ? { ...i } : null;
  }
  async insertItem(i: RateCardItem) {
    this.items.set(i.itemId, { ...i });
  }
  async updateItem(id: string, patch: Partial<RateCardItem>) {
    const i = this.items.get(id);
    if (i) this.items.set(id, { ...i, ...patch });
  }
  async deleteItem(id: string) {
    for (const [k, b] of this.benefits) if (b.itemId === id) this.benefits.delete(k);
    return this.items.delete(id);
  }
  async itemIsReferenced(id: string) {
    return this.referencedItems.has(id);
  }

  async listPackages(id: string) {
    return [...this.packages.values()].filter((p) => p.rateCardId === id).map((p) => ({ ...p }));
  }
  async getPackage(id: string) {
    const p = this.packages.get(id);
    return p ? { ...p } : null;
  }
  async insertPackage(p: RateCardPackage) {
    this.packages.set(p.packageId, { ...p });
  }
  async updatePackage(id: string, patch: Partial<RateCardPackage>) {
    const p = this.packages.get(id);
    if (p) this.packages.set(id, { ...p, ...patch });
  }
  async listPackageBenefits(id: string) {
    return [...this.benefits.values()].filter((b) => b.rateCardId === id).map((b) => ({ ...b }));
  }
  async replacePackageBenefits(packageId: string, _rateCardId: string, rows: PackageBenefit[]) {
    for (const [k, b] of this.benefits) if (b.packageId === packageId) this.benefits.delete(k);
    for (const r of rows) this.benefits.set(r.packageBenefitId, { ...r });
  }
}

export async function buildRateCardHarness(options: { failAudit?: boolean } = {}) {
  const repo = new InMemoryRateCardRepo();
  const h = await buildAuditHarness({ failAudit: options.failAudit, extraDomain: repo });
  const ratecard = createRateCardService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    repository: repo,
    clock: h.clock,
  });

  const NAME = "ESSM BD Rate Card (synthetic)";
  async function lead(email = "tlbd@example.invalid") {
    return h.login(email);
  }
  /** Draft with one item and one package, via the real service. */
  async function seededDraft(
    opts: {
      name?: string;
      effectiveFrom?: string;
      value?: number;
      confirm?: boolean;
      copyFrom?: string;
    } = {},
  ) {
    const token = await lead();
    const d = await ratecard.createDraft(token, {
      name: opts.name ?? NAME,
      effectiveFrom: opts.effectiveFrom ?? "2026-01-01",
      ...(opts.copyFrom ? { copyFromRateCardId: opts.copyFrom } : {}),
    });
    if (!d.ok) throw new Error(`draft: ${d.code}`);
    let item: RateCardItem | null = null;
    if (!opts.copyFrom) {
      const i = await ratecard.addItem(token, {
        rateCardId: d.value.rateCardId,
        category: "BRANDING",
        benefitName: "Logo placement",
        monetizedUnitValue: opts.value ?? 500_000,
        unit: "slot",
      });
      if (!i.ok) throw new Error(`item: ${i.code}`);
      item = i.value;
      if (opts.confirm) await ratecard.confirmItemValue(token, { itemId: item.itemId });
    }
    return { token, draft: d.value, item };
  }
  async function activated(opts: Parameters<typeof seededDraft>[0] = {}) {
    const s = await seededDraft({ confirm: true, ...opts });
    const a = await ratecard.activate(s.token, { rateCardId: s.draft.rateCardId });
    if (!a.ok) throw new Error(`activate: ${a.code}`);
    return { ...s, activated: a.value.activated };
  }
  return { ...h, repo, ratecard, NAME, lead, seededDraft, activated };
}
