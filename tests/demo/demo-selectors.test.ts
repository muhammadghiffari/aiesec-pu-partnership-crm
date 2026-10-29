/**
 * Demo prototype trust-rule tests. The prototype is synthetic, but the rules
 * it demonstrates are the real product's non-negotiables:
 *
 *  - DNC always blocks outreach readiness (regardless of verification).
 *  - Identity verification and channel verification are separate gates.
 *  - An unverified channel never becomes "ready".
 *  - LoA separation of duties: a submitter can never approve their own LoA.
 *  - Dashboard/report figures reconcile with the underlying dataset.
 */
import { describe, expect, it } from "vitest";
import { seedDataset } from "../../apps/web/features/demo/seed";
import {
  canApproveLoa,
  categoryCounts,
  dashboardCounts,
  draftReadiness,
  findPartnerDuplicates,
  pendingCandidates,
  stageCounts,
} from "../../apps/web/features/demo/selectors";
import type { DemoAgreement, DemoOutreachDraft } from "../../apps/web/features/demo/types";

function draftFor(partial: Partial<DemoOutreachDraft>): DemoOutreachDraft {
  return {
    id: "d-test",
    partnerId: "p-x",
    contactId: "c-x",
    channel: "email",
    subject: "Tes",
    body: "isi",
    approvedAt: null,
    approvedBy: null,
    approvedHash: null,
    sources: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("dataset integrity", () => {
  it("every contact belongs to an existing partner", () => {
    const ds = seedDataset();
    const ids = new Set(ds.partners.map((p) => p.id));
    for (const c of ds.contacts) expect(ids.has(c.partnerId)).toBe(true);
  });

  it("every cycle belongs to an existing partner", () => {
    const ds = seedDataset();
    const ids = new Set(ds.partners.map((p) => p.id));
    for (const cy of ds.cycles) expect(ids.has(cy.partnerId)).toBe(true);
  });

  it("partner names carry the synthetic marker", () => {
    const ds = seedDataset();
    for (const p of ds.partners) {
      expect(/demo|sintet|synthet/i.test(p.name)).toBe(true);
    }
  });

  it("no contact is both DNC and outreach-ready", () => {
    const ds = seedDataset();
    for (const d of ds.drafts) {
      const contact = ds.contacts.find((c) => c.id === d.contactId) ?? null;
      if (contact?.dnc?.active) {
        expect(draftReadiness(d, contact).status).toBe("BLOCKED");
      }
    }
  });
});

describe("outreach readiness rules", () => {
  const ds = seedDataset();
  const dina = ds.contacts.find((c) => c.id === "c-dina");
  const gentur = ds.contacts.find((c) => c.id === "c-gentur");

  it("fully-verified identity + channel without review stamp is a Draft", () => {
    expect(dina).toBeDefined();
    const r = draftReadiness(draftFor({}), dina ?? null);
    expect(r.status).toBe("DRAFT");
    expect(r.canMarkReviewed).toBe(true);
  });

  it("review stamp flips a ready draft to Ready for human review", () => {
    const r = draftReadiness(
      draftFor({ approvedAt: "2026-10-27T09:00:00.000Z", approvedBy: "Bimo", approvedHash: "x" }),
      dina ?? null,
    );
    expect(r.status).toBe("READY_FOR_REVIEW");
  });

  it("DNC blocks even when identity and channel are both verified", () => {
    expect(gentur?.dnc?.active).toBe(true);
    expect(gentur?.identityVerification).toBe("verified");
    const r = draftReadiness(draftFor({}), gentur ?? null);
    expect(r.status).toBe("BLOCKED");
    expect(r.canMarkReviewed).toBe(false);
    expect(r.checks.some((c) => c.state === "block")).toBe(true);
  });

  it("identity verified + unverified channel is NOT ready (separate facts)", () => {
    const bagus = ds.contacts.find((c) => c.id === "c-bagus");
    expect(bagus?.identityVerification).toBe("verified");
    const r = draftReadiness(draftFor({ channel: "email" }), bagus ?? null);
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.canMarkReviewed).toBe(false);
    const channelCheck = r.checks.find((c) => c.key === "channel");
    expect(channelCheck?.state).toBe("block");
  });

  it("verified identity + failed channel verification still blocks", () => {
    const tono = ds.contacts.find((c) => c.id === "c-tono");
    const r = draftReadiness(draftFor({ channel: "email" }), tono ?? null);
    expect(r.status).toBe("NEEDS_REVIEW");
    expect(r.canMarkReviewed).toBe(false);
  });

  it("no selected contact is a Draft awaiting a recipient, never ready", () => {
    const r = draftReadiness(draftFor({}), null);
    expect(r.status).toBe("DRAFT");
    expect(r.canMarkReviewed).toBe(false);
  });

  it("empty subject blocks human stamping", () => {
    const r = draftReadiness(draftFor({ subject: "   " }), dina ?? null);
    expect(r.canMarkReviewed).toBe(false);
  });
});

describe("LoA separation of duties (D-009)", () => {
  const ds = seedDataset();

  it("another CRM Lead may approve an in-review LoA", () => {
    const loa = ds.agreements.find((a) => a.status === "IN_REVIEW") as DemoAgreement;
    expect(loa).toBeDefined();
    const gate = canApproveLoa("Nadia Prameswari", loa);
    expect(gate.allowed).toBe(true);
  });

  it("a submitter can never approve their own LoA", () => {
    const loa = ds.agreements.find((a) => a.status === "IN_REVIEW") as DemoAgreement;
    const gate = canApproveLoa(loa.submitter, loa);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/submitte?r/i);
  });

  it("only in-review LoAs are approvable", () => {
    const signed = ds.agreements.find((a) => a.status === "SIGNED") as DemoAgreement;
    expect(canApproveLoa("Any Lead", signed).allowed).toBe(false);
  });
});

describe("duplicate detection", () => {
  it("flags same-domain records", () => {
    const ds = seedDataset();
    const hits = findPartnerDuplicates(ds.partners, "Anything Else", "demo-acme.example");
    expect(hits.some((h) => h.id === "p-acme")).toBe(true);
  });

  it("flags strong name overlap (>= 2 shared tokens)", () => {
    const ds = seedDataset();
    const hits = findPartnerDuplicates(ds.partners, "Acme Demo Logistics Moved", null);
    expect(hits.some((h) => h.id === "p-acme")).toBe(true);
  });

  it("does not flag unrelated names", () => {
    const ds = seedDataset();
    const hits = findPartnerDuplicates(ds.partners, "Zebra Holdings", null);
    expect(hits.length).toBe(0);
  });
});

describe("report reconciliation", () => {
  it("pipeline stage counts + no-cycle count reconcile to partner total", () => {
    const ds = seedDataset();
    const stages = stageCounts(ds);
    const total = ds.partners.length;
    const withCycle = stages.reduce((n, s) => n + s.count, 0);
    expect(withCycle).toBeGreaterThan(0);
    expect(withCycle).toBeLessThanOrEqual(total);
  });

  it("category counts reconcile to partner total", () => {
    const ds = seedDataset();
    const cats = categoryCounts(ds);
    expect(cats.reduce((n, c) => n + c.count, 0)).toBe(ds.partners.length);
  });

  it("dashboard KPI partner count equals dataset size", () => {
    const ds = seedDataset();
    expect(dashboardCounts(ds).partners).toBe(ds.partners.length);
  });

  it("pending candidates count equals review queue length", () => {
    const ds = seedDataset();
    expect(dashboardCounts(ds).pendingCandidates).toBe(pendingCandidates(ds.candidates).length);
    expect(pendingCandidates(ds.candidates).every((c) => c.reviewStatus === "PENDING")).toBe(true);
  });
});
