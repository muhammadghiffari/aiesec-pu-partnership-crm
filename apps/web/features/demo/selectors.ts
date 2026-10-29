/**
 * Pure, framework-free selectors over the demo dataset.
 *
 * These functions encode the product's trust rules (outreach readiness,
 * DNC blocking, LoA separation of duties, duplicate handling) and the
 * derived counts every screen reconciles with. They are covered by
 * tests/demo/demo-selectors.test.ts.
 */

import { DEMO_NOW, isDueWithin } from "./format";
import type {
  ChannelKind,
  DemoAgreement,
  DemoCandidate,
  DemoContact,
  DemoContactChannel,
  DemoCycle,
  DemoDataset,
  DemoOutreachDraft,
  DemoPartner,
  DemoTask,
  DraftStatus,
  LifecycleStage,
  RelationshipStatus,
} from "./types";

const MILLIS_PER_DAY = 86_400_000;

/* ---------------- partner rollup ---------------- */

export interface PartnerRollup {
  partner: DemoPartner;
  /** Most recently updated cycle; null when the partner has no cycle yet. */
  cycle: DemoCycle | null;
  cycles: DemoCycle[];
  contacts: DemoContact[];
  relationship: RelationshipStatus;
}

export function indexById<T extends { id: string }>(items: T[] | readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

export function partnerRollup(dataset: DemoDataset, partner: DemoPartner): PartnerRollup {
  const cycles = dataset.cycles
    .filter((c) => c.partnerId === partner.id)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cycle = cycles[0] ?? null;
  return {
    partner,
    cycle,
    cycles,
    contacts: dataset.contacts
      .filter((c) => c.partnerId === partner.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    relationship: relationshipOf(cycles),
  };
}

export function allRollups(dataset: DemoDataset): Map<string, PartnerRollup> {
  return new Map(dataset.partners.map((p) => [p.id, partnerRollup(dataset, p)]));
}

export function relationshipOf(cycles: DemoCycle[]): RelationshipStatus {
  const sorted = cycles.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const c of sorted) {
    if (c.partnershipStatus === "ACTIVE") return "ACTIVE";
  }
  const latest = sorted[0];
  if (latest && (latest.partnershipStatus === "BREAK" || latest.partnershipStatus === "FINISH")) {
    return latest.partnershipStatus;
  }
  return "PROSPECT";
}

/* ---------------- outreach readiness ---------------- */

export interface ReadinessCheck {
  key: string;
  label: string;
  state: "ok" | "warn" | "block";
  detail: string;
}

export interface ReadinessResult {
  status: DraftStatus;
  checks: ReadinessCheck[];
  /** True when a human may stamp the exact version as reviewed. */
  canMarkReviewed: boolean;
}

export function findChannel(contact: DemoContact, channel: ChannelKind): DemoContactChannel | null {
  return contact.channels.find((c) => c.channel === channel) ?? null;
}

/**
 * Compute the outreach readiness of one draft for its selected contact.
 *
 *   - DNC always blocks (every flow).
 *   - Identity verification and channel verification are separate gates.
 *   - A human review stamp is possible only when no blocker remains and
 *     subject + body are present.
 */
export function draftReadiness(
  draft: DemoOutreachDraft,
  contact: DemoContact | null,
): ReadinessResult {
  const checks: ReadinessCheck[] = [];

  if (!contact) {
    return {
      status: "DRAFT",
      checks: [
        {
          key: "recipient",
          label: "Recipient selected",
          state: "warn",
          detail: "Choose a partner and recipient to evaluate readiness.",
        },
      ],
      canMarkReviewed: false,
    };
  }

  if (contact.dnc?.active) {
    checks.push({
      key: "dnc",
      label: "Do-Not-Contact",
      state: "block",
      detail: `${contact.name} is marked Do-Not-Contact (${contact.dnc.reason}). Outreach is blocked in every flow.`,
    });
    checks.push({
      key: "note",
      label: "Send permission",
      state: "block",
      detail:
        "Sending is not available in this prototype. Approval, OAuth and delivery are separate future integrations.",
    });
    return { status: "BLOCKED", checks, canMarkReviewed: false };
  }

  checks.push({
    key: "dnc",
    label: "Do-Not-Contact",
    state: "ok",
    detail: "No DNC flag on this contact.",
  });

  if (contact.identityVerification === "verified") {
    checks.push({
      key: "identity",
      label: "Identity verified",
      state: "ok",
      detail: `Identity confirmed via ${contact.identityMethod ?? "documented method"}.`,
    });
  } else {
    checks.push({
      key: "identity",
      label: "Identity verified",
      state: "block",
      detail: `Identity is ${contact.identityVerification}. Verify the person's identity with an explicit method and evidence URL first (Contact directory).`,
    });
  }

  const channel = findChannel(contact, draft.channel);
  if (!channel) {
    checks.push({
      key: "channel",
      label: "Channel verified",
      state: "block",
      detail: `No ${draft.channel} channel on record for ${contact.name}.`,
    });
  } else if (channel.verification === "verified") {
    checks.push({
      key: "channel",
      label: "Channel verified",
      state: "ok",
      detail: `${draft.channel} address verified${channel.method ? ` via ${channel.method}` : ""}.`,
    });
  } else {
    checks.push({
      key: "channel",
      label: "Channel verified",
      state: "block",
      detail: `The exact ${draft.channel} channel is ${channel.verification}. An unverified channel must never be presented as outreach-ready.`,
    });
  }

  const hasContent = draft.subject.trim().length > 0 && draft.body.trim().length > 0;
  checks.push({
    key: "content",
    label: "Subject and body present",
    state: hasContent ? "ok" : "warn",
    detail: hasContent
      ? "A human must review the exact version; editing afterwards invalidates the review stamp."
      : "Add a subject and body (a synthetic Indonesian draft is available).",
  });

  checks.push({
    key: "send",
    label: "Send action",
    state: "warn",
    detail:
      "This prototype never sends. In production, a human sends via the approved sender profile — no AI/tool has send credentials.",
  });

  const blocked = checks.some((c) => c.state === "block");
  const status: DraftStatus = blocked
    ? "NEEDS_REVIEW"
    : draft.approvedAt
      ? "READY_FOR_REVIEW"
      : "DRAFT";
  const canMarkReviewed = !blocked && hasContent && !draft.approvedAt;

  return { status, checks, canMarkReviewed };
}

/* ---------------- duplicates ---------------- */

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

/** Same semantics as the M1-03 service: same domain, or >= 2 shared name tokens. */
export function findPartnerDuplicates(
  partners: DemoPartner[],
  name: string,
  websiteDomain: string | null,
  excludeId?: string,
): DemoPartner[] {
  const domain = websiteDomain?.toLowerCase() ?? null;
  const tokens = tokenSet(name);
  const hits: DemoPartner[] = [];
  for (const existing of partners) {
    if (existing.id === excludeId) continue;
    if (domain && existing.websiteDomain?.toLowerCase() === domain) {
      hits.push(existing);
      continue;
    }
    let overlap = 0;
    for (const token of tokenSet(existing.name)) {
      if (tokens.has(token)) overlap += 1;
    }
    if (overlap >= 2) hits.push(existing);
  }
  return hits;
}

/* ---------------- research ---------------- */

export function pendingCandidates(candidates: DemoCandidate[]): DemoCandidate[] {
  return candidates.filter((c) => c.reviewStatus === "PENDING");
}

/* ---------------- LoA separation of duties ---------------- */

/** D-009: a submitter can never approve their own LoA. */
export function canApproveLoa(
  userName: string,
  loa: DemoAgreement,
): { allowed: boolean; reason: string | null } {
  if (loa.status !== "IN_REVIEW") {
    return { allowed: false, reason: "Only agreements in review can be approved." };
  }
  if (loa.submitter === userName) {
    return {
      allowed: false,
      reason:
        "A submitter can never approve their own LoA (decision D-009). Ask the other CRM Lead to review.",
    };
  }
  return { allowed: true, reason: null };
}

/* ---------------- task + activity derivatives ---------------- */

export function openTasks(tasks: DemoTask[]): DemoTask[] {
  return tasks
    .filter((t) => !t.done)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function tasksDueSoon(tasks: DemoTask[], days: number): DemoTask[] {
  return openTasks(tasks).filter((t) => isDueWithin(t.dueDate, days));
}

const WEEK_STARTS: number[] = (() => {
  // 8 one-week buckets ending at the demo anchor (weeks labelled W1..W8).
  const starts: number[] = [];
  const end = DEMO_NOW.getTime();
  for (let w = 7; w >= 0; w--) starts.push(end - (w + 1) * 7 * MILLIS_PER_DAY);
  return starts;
})();

export interface ActivityWeek {
  label: string;
  startIso: string;
  count: number;
}

export function activityByWeek(dataset: DemoDataset): ActivityWeek[] {
  return WEEK_STARTS.map((start) => {
    const end = start + 7 * MILLIS_PER_DAY;
    const count = dataset.activities.filter((a) => {
      const t = new Date(a.at).getTime();
      return t >= start && t < end;
    }).length;
    const d = new Date(start + 6 * MILLIS_PER_DAY);
    const label = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    });
    return { label, startIso: new Date(start).toISOString(), count };
  });
}

/* ---------------- dashboard + reports aggregates ---------------- */

export interface StageCount {
  stage: LifecycleStage;
  count: number;
  valueIdr: number;
}

export function stageCounts(dataset: DemoDataset): StageCount[] {
  const byStage = new Map<LifecycleStage, { count: number; valueIdr: number }>();
  const rollups = allRollups(dataset);
  for (const [, rollup] of rollups) {
    if (!rollup.cycle) continue;
    const bucket = byStage.get(rollup.cycle.stage) ?? { count: 0, valueIdr: 0 };
    bucket.count += 1;
    bucket.valueIdr += rollup.cycle.agreedValueIdr ?? 0;
    byStage.set(rollup.cycle.stage, bucket);
  }
  const ORDER: LifecycleStage[] = [
    "PROSPECTING",
    "SALES_PROCESS",
    "CLOSE_DEAL",
    "PARTNERSHIP_IMPLEMENTATION",
    "POST_SURVEY",
  ];
  return ORDER.map((stage) => {
    const bucket = byStage.get(stage) ?? { count: 0, valueIdr: 0 };
    return { stage, count: bucket.count, valueIdr: bucket.valueIdr };
  });
}

export function categoryCounts(dataset: DemoDataset): { code: string; count: number }[] {
  const byCode = new Map<string, number>();
  for (const p of dataset.partners) byCode.set(p.industry, (byCode.get(p.industry) ?? 0) + 1);
  return [...byCode.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

export interface DashboardCounts {
  partners: number;
  activeCycles: number;
  pendingCandidates: number;
  followUpsDueSoon: number;
}

export function dashboardCounts(dataset: DemoDataset): DashboardCounts {
  const rollups = allRollups(dataset);
  let activeCycles = 0;
  for (const [, r] of rollups) {
    if (r.cycle && r.cycle.salesStatus === "ACTIVE" && r.cycle.partnershipStatus !== "FINISH")
      activeCycles += 1;
  }
  return {
    partners: dataset.partners.length,
    activeCycles,
    pendingCandidates: pendingCandidates(dataset.candidates).length,
    followUpsDueSoon: tasksDueSoon(dataset.tasks, 14).length,
  };
}
