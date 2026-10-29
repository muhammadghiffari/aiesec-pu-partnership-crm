/**
 * Test-only harness for lifecycle tests: an in-memory repository with real rollback and
 * injection hooks for race conditions, wired to the audit harness. Synthetic data only.
 */

import { buildAuditHarness } from "../audit/test-support";
import { EMPTY_FACTS, type EssmStage, type StageFacts } from "./rules";
import { createLifecycleService } from "./service";
import type { CyclePatch, CycleRecord, LifecycleRepository } from "./types";

export class InMemoryLifecycleRepo implements LifecycleRepository {
  partners = new Set<string>();
  cycles = new Map<string, CycleRecord>();
  facts = new Map<string, StageFacts>();
  /** Test hooks to simulate concurrent changes between a read and the following write. */
  beforeUpdate?: (cycleId: string) => void;
  onGetFacts?: (cycleId: string, call: number) => void;
  private factsCalls = 0;

  snapshot() {
    return {
      cycles: new Map([...this.cycles].map(([k, v]) => [k, { ...v }])),
      facts: new Map(this.facts),
    };
  }
  restore(s: unknown) {
    const snap = s as ReturnType<InMemoryLifecycleRepo["snapshot"]>;
    this.cycles = new Map([...snap.cycles].map(([k, v]) => [k, { ...v }]));
    this.facts = new Map(snap.facts);
  }

  async partnerExists(partnerId: string) {
    return this.partners.has(partnerId);
  }
  async listCyclesForPartner(partnerId: string) {
    return [...this.cycles.values()]
      .filter((c) => c.partnerId === partnerId)
      .map((c) => ({ ...c }));
  }
  async getCycle(cycleId: string) {
    const c = this.cycles.get(cycleId);
    return c ? { ...c } : null;
  }
  async getFacts(cycleId: string) {
    const value = this.facts.get(cycleId) ?? EMPTY_FACTS;
    // The hook runs AFTER this read returns its value, so it models data changing between two reads.
    this.onGetFacts?.(cycleId, ++this.factsCalls);
    return value;
  }
  async insertCycle(cycle: CycleRecord) {
    this.cycles.set(cycle.cycleId, { ...cycle });
  }
  async updateCycle(cycleId: string, expectedStage: EssmStage, patch: CyclePatch) {
    this.beforeUpdate?.(cycleId);
    const c = this.cycles.get(cycleId);
    if (!c || c.essmStage !== expectedStage) return false;
    this.cycles.set(cycleId, { ...c, ...patch });
    return true;
  }
}

export async function buildLifecycleHarness(options: { failAudit?: boolean } = {}) {
  const repo = new InMemoryLifecycleRepo();
  const h = await buildAuditHarness({ ...options, extraDomain: repo });
  const lifecycle = createLifecycleService({
    guard: { sessions: h.sessionService },
    audit: h.audit,
    repository: repo,
    clock: h.clock,
  });
  const partnerId = crypto.randomUUID();
  repo.partners.add(partnerId);
  return { ...h, repo, lifecycle, partnerId };
}

/** Facts that satisfy every gate of every stage. */
export function satisfiedFacts(): StageFacts {
  const signedAt = new Date("2026-10-30T00:00:00Z");
  return {
    marketResearch: {
      valuesScore: 4,
      visionScore: 3,
      currentFocusScore: 5,
      programScore: 2,
      proceedDecision: true,
      evidenceUrls: ["https://example.invalid/evidence"],
      verifiedByUserId: "u-staff",
    },
    sentProposalCount: 1,
    meetingCount: 1,
    meetingsWithoutFinalMomCount: 0,
    sndConfirmed: true,
    loa: {
      status: "SIGNED",
      submittedByUserId: "u-staff",
      approvedByUserId: "u-lcvp",
      partnerSignedAt: signedAt,
      aiesecSignedAt: signedAt,
      documentUrl: "https://example.invalid/signed-loa",
    },
    project: {
      status: "FINISHED",
      reportUrl: "https://example.invalid/report",
      reportSubmittedAt: signedAt,
    },
  };
}

type Facts = StageFacts;
type Research = NonNullable<Facts["marketResearch"]>;
type Loa = NonNullable<Facts["loa"]>;
type Project = NonNullable<Facts["project"]>;

/** Fully satisfied facts with one part overridden; avoids non-null assertions in tests. */
export function factsWith(patch: Partial<Facts>): Facts {
  return { ...satisfiedFacts(), ...patch };
}
export function researchWith(patch: Partial<Research>): Facts {
  return factsWith({
    marketResearch: { ...(satisfiedFacts().marketResearch as Research), ...patch },
  });
}
export function loaWith(patch: Partial<Loa>): Facts {
  return factsWith({ loa: { ...(satisfiedFacts().loa as Loa), ...patch } });
}
export function projectWith(patch: Partial<Project>): Facts {
  return factsWith({ project: { ...(satisfiedFacts().project as Project), ...patch } });
}
