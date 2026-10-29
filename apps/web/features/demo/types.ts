/**
 * Demo-mode domain types for the presentation prototype under /demo.
 *
 * These types describe the *intended* product shape across the five-stage ESSM
 * lifecycle. They are deliberately separate from the real M1/M2 service
 * contracts in `features/partners/`: nothing here is persisted, sent, or
 * signed. All seed data is synthetic (example.invalid / *.example domains).
 *
 * Reused from the production contract (features/partners/types.ts):
 *   - the ten ESSM industry categories
 *   - source tiers and verification statuses
 * Everything else is demo-local.
 */
import type { IndustryCode, SourceTier, VerificationStatus } from "../partners/types";

export type { IndustryCode, SourceTier, VerificationStatus };

/* ------------------------------------------------------------------ *
 * Lifecycle (fixed: five top-level ESSM stages — D-003)
 * ------------------------------------------------------------------ */

export const LIFECYCLE_STAGES = [
  { code: "PROSPECTING", label: "Prospecting", order: 1 },
  { code: "SALES_PROCESS", label: "Sales Process", order: 2 },
  { code: "CLOSE_DEAL", label: "Close Deal", order: 3 },
  { code: "PARTNERSHIP_IMPLEMENTATION", label: "Partnership Implementation", order: 4 },
  { code: "POST_SURVEY", label: "Post Survey", order: 5 },
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]["code"];

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  PROSPECTING: "Prospecting",
  SALES_PROCESS: "Sales Process",
  CLOSE_DEAL: "Close Deal",
  PARTNERSHIP_IMPLEMENTATION: "Partnership Implementation",
  POST_SURVEY: "Post Survey",
};

/** ESSM Project Support dropdown (docs/ESSM_MAPPING.md §3). */
export const PROJECT_SUPPORTS = [
  { code: "OGX", label: "oGX" },
  { code: "IGV", label: "iGV" },
  { code: "MEMBERSHIP", label: "Membership" },
  { code: "LV", label: "LV" },
  { code: "AFL", label: "AFL" },
  { code: "BRAND_ACTIVATION", label: "Brand Activation" },
  { code: "BD_PROJECT", label: "BD Project" },
  { code: "LC_INITIATIVES", label: "LC Initiatives" },
  { code: "OTHERS", label: "Others" },
] as const;

export type ProjectSupportCode = (typeof PROJECT_SUPPORTS)[number]["code"];

export const PROJECT_SUPPORT_SHORT: Record<ProjectSupportCode, string> = {
  OGX: "oGX",
  IGV: "iGV",
  MEMBERSHIP: "Membership",
  LV: "LV",
  AFL: "AFL",
  BRAND_ACTIVATION: "Brand A.",
  BD_PROJECT: "BD Project",
  LC_INITIATIVES: "LC Init.",
  OTHERS: "Others",
};

export const PROJECT_SUPPORT_LABELS: Record<ProjectSupportCode, string> = {
  OGX: "oGX (Outgoing Exchange)",
  IGV: "iGV (Incoming Global Volunteer)",
  MEMBERSHIP: "Membership",
  LV: "LV (Local Volunteer)",
  AFL: "AIESEC Future Leaders",
  BRAND_ACTIVATION: "Brand Activation",
  BD_PROJECT: "BD Project",
  LC_INITIATIVES: "LC Initiatives",
  OTHERS: "Others",
};

/* ------------------------------------------------------------------ *
 * Partner + partnership cycle
 * ------------------------------------------------------------------ */

export type SalesType = "NEW_SALES" | "RE_RAISE";
export type SalesStatus = "ACTIVE" | "INACTIVE";
export type ApproachMethod = "ACTIVE" | "PASSIVE";
export type PartnershipStatus = "ACTIVE" | "BREAK" | "FINISH" | null;

/** Partner-level rollup of its cycles (directory "partnership status" filter). */
export type RelationshipStatus = "PROSPECT" | "ACTIVE" | "BREAK" | "FINISH";

export const RELATIONSHIP_LABELS: Record<RelationshipStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active partner",
  BREAK: "On break",
  FINISH: "Finished",
};

/** Human-entered ESSM Partnership Alignment scores (1–5 each) + Proceed. */
export interface AlignmentScores {
  values: number | null;
  vision: number | null;
  currentFocus: number | null;
  program: number | null;
  proceed: "YES" | "NO" | null;
}

export interface DemoPartner {
  id: string;
  name: string;
  websiteDomain: string | null;
  industry: IndustryCode;
  officialEmail: string | null;
  /** AIESEC PIC/owner display name (null = unassigned). */
  ownerName: string | null;
  sourceTier: SourceTier;
  sourceUrl: string | null;
  lawfulBasisNote: string;
  notes: string | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface StageTransition {
  stage: LifecycleStage;
  at: string;
}

export interface DemoCycle {
  id: string;
  partnerId: string;
  stage: LifecycleStage;
  salesType: SalesType;
  salesStatus: SalesStatus;
  approachMethod: ApproachMethod;
  projectSupport: ProjectSupportCode;
  partnershipStatus: PartnershipStatus;
  /** Agreed/expected value in integer IDR (not actual revenue). */
  agreedValueIdr: number | null;
  alignment: AlignmentScores | null;
  stageHistory: StageTransition[];
  startedAt: string;
  updatedAt: string;
  nextAction: { label: string; dueDate: string } | null;
}

/* ------------------------------------------------------------------ *
 * Contacts and channels
 *
 * Identity verification and channel verification are *separate facts*.
 * Both the identity AND the exact intended channel must be verified before
 * a recipient can be presented as outreach-ready.
 * ------------------------------------------------------------------ */

export const CHANNEL_KINDS = ["email", "whatsapp", "linkedin"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const CHANNEL_LABELS: Record<ChannelKind, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
};

export interface DemoContactChannel {
  channel: ChannelKind;
  value: string;
  verification: VerificationStatus;
  method: string | null;
  evidenceUrl: string | null;
  verifiedAt: string | null;
}

export interface DncRecord {
  active: boolean;
  reason: string;
  at: string;
  by: string;
}

export interface DemoContact {
  id: string;
  partnerId: string;
  name: string;
  title: string | null;
  identityVerification: VerificationStatus;
  identityMethod: string | null;
  identityEvidenceUrl: string | null;
  channels: DemoContactChannel[];
  sourceTier: SourceTier;
  sourceUrl: string | null;
  lawfulBasisNote: string;
  dnc: DncRecord | null;
  addedAt: string;
}

/* ------------------------------------------------------------------ *
 * Prospecting research
 * ------------------------------------------------------------------ */

export type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface ResearchCriteria {
  industries: IndustryCode[];
  keywords: string;
  projectSupport: ProjectSupportCode | null;
  targetCount: number;
  updatedAt: string;
}

export interface DemoResearchJob {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  criteriaSnippet: string;
  found: number;
}

export type CandidateReviewStatus = "PENDING" | "ACCEPTED" | "ACCEPTED_LINKED" | "REJECTED";

export interface DemoCandidate {
  id: string;
  jobId: string;
  orgName: string;
  websiteDomain: string;
  industry: IndustryCode;
  sourceUrl: string;
  sourceLabel: string;
  sourceTier: SourceTier;
  /** Prospect-prioritisation signal only — never an ESSM alignment score. */
  fitScore: number;
  notes: string;
  flags: string[];
  /** Set when the record looks like a possible duplicate of a partner. */
  duplicateOf: string | null;
  contactDraft: {
    name: string;
    title: string | null;
    email: string;
    offDomainNote: string | null;
  };
  reviewStatus: CandidateReviewStatus;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Outreach preparation (nothing is ever sent from the prototype)
 * ------------------------------------------------------------------ */

export type DraftStatus = "DRAFT" | "NEEDS_REVIEW" | "BLOCKED" | "READY_FOR_REVIEW";

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  DRAFT: "Draft",
  NEEDS_REVIEW: "Needs review",
  BLOCKED: "Blocked",
  READY_FOR_REVIEW: "Ready for human review",
};

export interface DemoOutreachDraft {
  id: string;
  partnerId: string;
  contactId: string;
  channel: ChannelKind;
  subject: string;
  body: string;
  /** Simulated human review of the exact version (never a send). */
  approvedAt: string | null;
  approvedBy: string | null;
  approvedHash: string | null;
  sources: string[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Meetings and minutes (MoM)
 * ------------------------------------------------------------------ */

export type MeetingKind = "DISCOVERY" | "SALES" | "REVIEW" | "KICKOFF";
export type MeetingStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface DemoActionItem {
  id: string;
  text: string;
  owner: string;
  dueDate: string;
  done: boolean;
}

export interface DemoMinutes {
  discussion: string[];
  decisions: string[];
  actionItems: DemoActionItem[];
  recordedAt: string;
  recordedBy: string;
  evidenceUrl: string | null;
}

export interface DemoMeeting {
  id: string;
  partnerId: string;
  cycleId: string;
  title: string;
  kind: MeetingKind;
  at: string;
  location: string;
  attendees: string[];
  status: MeetingStatus;
  minutes: DemoMinutes | null;
}

/* ------------------------------------------------------------------ *
 * Letter of Agreement (recorded metadata only — signing is external)
 * ------------------------------------------------------------------ */

export type LoaStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "AWAITING_SIGNATURE"
  | "SIGNED"
  | "REJECTED";

export const LOA_STATUS_LABELS: Record<LoaStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved (recorded)",
  AWAITING_SIGNATURE: "Awaiting signature",
  SIGNED: "Signed copy on file",
  REJECTED: "Returned",
};

export interface LoaVersion {
  version: number;
  at: string;
  by: string;
  note: string;
}

export type LoaHistoryAction = "SUBMITTED" | "APPROVED" | "RETURNED" | "SIGNATURE_RECORDED";

export interface LoaHistoryItem {
  actor: string;
  action: LoaHistoryAction;
  at: string;
  note: string;
}

export interface DemoAgreement {
  id: string;
  number: string;
  partnerId: string;
  cycleId: string;
  kind: "MONETARY" | "NON_MONETARY";
  title: string;
  status: LoaStatus;
  submitter: string;
  signatories: string[];
  valueIdr: number | null;
  versions: LoaVersion[];
  history: LoaHistoryItem[];
  documentRef: string | null;
  signedRef: string | null;
  signedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Partnership implementation projects
 * ------------------------------------------------------------------ */

export type ProjectStatus = "PLANNING" | "IN_PROGRESS" | "AT_RISK" | "COMPLETED" | "ON_HOLD";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In progress",
  AT_RISK: "At risk",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
};

export type MilestoneStatus = "DONE" | "IN_PROGRESS" | "PENDING" | "LATE";

export interface DemoMilestone {
  id: string;
  name: string;
  dueDate: string;
  status: MilestoneStatus;
}

export interface DemoProject {
  id: string;
  partnerId: string;
  cycleId: string;
  name: string;
  projectSupport: ProjectSupportCode;
  status: ProjectStatus;
  owner: string;
  progress: number;
  startDate: string;
  endDate: string;
  nextMilestone: string | null;
  milestones: DemoMilestone[];
  actionItems: DemoActionItem[];
}

/* ------------------------------------------------------------------ *
 * Activity, tasks, notifications
 * ------------------------------------------------------------------ */

export interface DemoActivity {
  id: string;
  at: string;
  actor: string;
  kind: string;
  partnerId: string | null;
  summary: string;
  href: string;
}

export type TaskKind = "FOLLOW_UP" | "MEETING_PREP" | "REVIEW" | "NEWSLETTER" | "SURVEY";

export interface DemoTask {
  id: string;
  title: string;
  partnerId: string | null;
  href: string;
  dueDate: string;
  done: boolean;
  kind: TaskKind;
}

export interface DemoNotification {
  id: string;
  at: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
}

/* ------------------------------------------------------------------ *
 * Aggregate dataset + demo session user
 * ------------------------------------------------------------------ */

export interface DemoDataset {
  partners: DemoPartner[];
  cycles: DemoCycle[];
  contacts: DemoContact[];
  criteria: ResearchCriteria;
  jobs: DemoResearchJob[];
  candidates: DemoCandidate[];
  drafts: DemoOutreachDraft[];
  meetings: DemoMeeting[];
  agreements: DemoAgreement[];
  projects: DemoProject[];
  activities: DemoActivity[];
  tasks: DemoTask[];
  notifications: DemoNotification[];
}

export interface DemoUser {
  name: string;
  email: string;
  role: "CRM_LEAD" | "BD_STAFF";
  roleLabel: string;
}

export interface DemoPrefs {
  density: "comfortable" | "compact";
  dateFormat: "relative" | "absolute";
}

/** Fixed anchor so every count, trend and "upcoming" list is deterministic. */
export const DEMO_NOW_ISO = "2026-10-29T02:30:00.000Z";
