/**
 * Test-only harness for proposal pricing: the REAL rate card service builds a versioned catalog,
 * an in-memory proposal repository (with rollback) stores snapshots. Synthetic data only.
 */

import { buildAuditHarness } from "../audit/test-support";
import { createRateCardService } from "../ratecard/service";
import { InMemoryRateCardRepo } from "../ratecard/test-support";
import {
  createProposalService,
  type ProposalLine,
  type ProposalRecord,
  type ProposalRepository,
} from "./service";

export class InMemoryProposalRepo implements ProposalRepository {
  proposals = new Map<string, ProposalRecord>();
  lines = new Map<string, ProposalLine>();
  cycles = new Set<string>();
  beforeUpdate?: (id: string) => void;

  snapshot() {
    return {
      proposals: new Map([...this.proposals].map(([k, v]) => [k, { ...v }])),
      lines: new Map([...this.lines].map(([k, v]) => [k, { ...v }])),
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<InMemoryProposalRepo["snapshot"]>;
    this.proposals = snap.proposals;
    this.lines = snap.lines;
  }
  async cycleExists(id: string) {
    return this.cycles.has(id);
  }
  async getProposal(id: string) {
    const p = this.proposals.get(id);
    return p ? { ...p } : null;
  }
  async listLines(id: string) {
    return [...this.lines.values()].filter((l) => l.proposalId === id).map((l) => ({ ...l }));
  }
  async insertProposal(p: ProposalRecord) {
    this.proposals.set(p.proposalId, { ...p });
  }
  async updateProposal(
    id: string,
    expected: ProposalRecord["status"],
    patch: Partial<ProposalRecord>,
  ) {
    this.beforeUpdate?.(id);
    const p = this.proposals.get(id);
    if (!p || p.status !== expected) return false;
    this.proposals.set(id, { ...p, ...patch });
    return true;
  }
  async replaceLines(proposalId: string, lines: ProposalLine[]) {
    for (const [k, l] of this.lines) if (l.proposalId === proposalId) this.lines.delete(k);
    for (const l of lines) this.lines.set(l.lineId, { ...l });
  }
}

export const CYCLE = "12121212-1212-4212-8212-121212121212";

export async function buildPricingHarness(options: { failAudit?: boolean } = {}) {
  const catalogRepo = new InMemoryRateCardRepo();
  const proposalRepo = new InMemoryProposalRepo();
  proposalRepo.cycles.add(CYCLE);
  const h = await buildAuditHarness({
    failAudit: options.failAudit,
    extraDomain: {
      snapshot: () => ({ c: catalogRepo.snapshot(), p: proposalRepo.snapshot() }),
      restore: (s) => {
        const snap = s as { c: unknown; p: unknown };
        catalogRepo.restore(snap.c);
        proposalRepo.restore(snap.p);
      },
    },
  });
  const ratecard = createRateCardService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    repository: catalogRepo,
    clock: h.clock,
  });
  const proposals = createProposalService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    proposals: proposalRepo,
    catalog: catalogRepo,
    clock: h.clock,
  });

  const NAME = "ESSM BD Rate Card (synthetic)";
  const lead = () => h.login("tlbd@example.invalid");

  /** An ACTIVE catalog: three items and a package (Community) including two of them. */
  async function activeCatalog(
    effectiveFrom = "2026-01-01",
    values = { logo: 500_000, post: 250_000, booth: 1_000_000 },
  ) {
    const t = await lead();
    const d = await ratecard.createDraft(t, { name: NAME, effectiveFrom });
    if (!d.ok) throw new Error(`draft ${d.code}`);
    const add = async (benefitName: string, v: number, unit: string) => {
      const r = await ratecard.addItem(t, {
        rateCardId: d.value.rateCardId,
        category: "BRANDING",
        benefitName,
        monetizedUnitValue: v,
        unit,
      });
      if (!r.ok) throw new Error(`item ${r.code}`);
      await ratecard.confirmItemValue(t, { itemId: r.value.itemId });
      return r.value;
    };
    const logo = await add("Logo placement", values.logo, "slot");
    const post = await add("Social media post", values.post, "post");
    const booth = await add("Event booth", values.booth, "booth");
    const pkg = await ratecard.addPackage(t, {
      rateCardId: d.value.rateCardId,
      packageName: "Community",
      listedPrice: 600_000,
      slotLimits: "",
    });
    if (!pkg.ok) throw new Error(`pkg ${pkg.code}`);
    const set = await ratecard.setPackageBenefits(t, {
      packageId: pkg.value.packageId,
      benefits: [
        { itemId: logo.itemId, includedQty: 1 },
        { itemId: post.itemId, includedQty: 2 },
      ],
    });
    if (!set.ok) throw new Error(`benefits ${set.code}`);
    const a = await ratecard.activate(t, { rateCardId: d.value.rateCardId });
    if (!a.ok) throw new Error(`activate ${a.code}`);
    return { token: t, version: a.value.activated, logo, post, booth, pkg: pkg.value };
  }

  return { ...h, catalogRepo, proposalRepo, ratecard, proposals, NAME, lead, activeCatalog };
}
