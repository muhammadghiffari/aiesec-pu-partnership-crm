"use client";

/**
 * Domain status badges used consistently across every demo screen. Status
 * semantics (tone + icon, never color alone) live here exactly once.
 */
import type {
  CandidateReviewStatus,
  DraftStatus,
  JobStatus,
  LifecycleStage,
  MeetingStatus,
  ProjectStatus,
  RelationshipStatus,
  VerificationStatus,
} from "../types";
import {
  DRAFT_STATUS_LABELS,
  LIFECYCLE_LABELS,
  LOA_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  RELATIONSHIP_LABELS,
} from "../types";
import type { IconName } from "../ui/Icon";
import { Badge, type BadgeTone } from "../ui/primitives";

/* --------------------------- lifecycle stage ------------------------- */

const STAGE_TONE: Record<LifecycleStage, BadgeTone> = {
  PROSPECTING: "navy",
  SALES_PROCESS: "blue",
  CLOSE_DEAL: "violet",
  PARTNERSHIP_IMPLEMENTATION: "teal",
  POST_SURVEY: "neutral",
};

export function StageBadge({ stage }: { stage: LifecycleStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{LIFECYCLE_LABELS[stage]}</Badge>;
}

const REL_TONE: Record<RelationshipStatus, BadgeTone> = {
  PROSPECT: "navy",
  ACTIVE: "green",
  BREAK: "amber",
  FINISH: "neutral",
};

export function RelationshipBadge({ status }: { status: RelationshipStatus }) {
  return <Badge tone={REL_TONE[status]}>{RELATIONSHIP_LABELS[status]}</Badge>;
}

/* ---------------------------- verification --------------------------- */

const VER_MAP: Record<VerificationStatus, { tone: BadgeTone; icon: IconName; label: string }> = {
  verified: { tone: "green", icon: "shield-check", label: "Verified" },
  pending: { tone: "amber", icon: "clock", label: "Pending" },
  unverified: { tone: "neutral", icon: "shield", label: "Unverified" },
  failed: { tone: "red", icon: "x", label: "Failed" },
};

export function VerificationBadge({
  status,
  kind,
}: {
  status: VerificationStatus;
  kind?: "identity" | "channel";
}) {
  const v = VER_MAP[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {kind === "identity" ? "Identity: " : kind === "channel" ? "Channel: " : ""}
      {v.label}
    </Badge>
  );
}

/* ------------------------------ outreach ----------------------------- */

const DRAFT_TONE: Record<DraftStatus, { tone: BadgeTone; icon: IconName }> = {
  DRAFT: { tone: "neutral", icon: "pencil" },
  NEEDS_REVIEW: { tone: "amber", icon: "alert" },
  BLOCKED: { tone: "red", icon: "ban" },
  READY_FOR_REVIEW: { tone: "green", icon: "shield-check" },
};

export function DraftBadge({ status }: { status: DraftStatus }) {
  const v = DRAFT_TONE[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {DRAFT_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ------------------------------ meetings ----------------------------- */

const MEET_TONE: Record<MeetingStatus, { tone: BadgeTone; icon: IconName; label: string }> = {
  SCHEDULED: { tone: "blue", icon: "calendar", label: "Scheduled" },
  COMPLETED: { tone: "green", icon: "check-circle", label: "Completed" },
  CANCELLED: { tone: "neutral", icon: "minus-circle", label: "Cancelled" },
};

export function MeetingBadge({ status }: { status: MeetingStatus }) {
  const v = MEET_TONE[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {v.label}
    </Badge>
  );
}

/* -------------------------------- LoA -------------------------------- */

const LOA_TONE: Record<keyof typeof LOA_STATUS_LABELS, { tone: BadgeTone; icon: IconName }> = {
  DRAFT: { tone: "neutral", icon: "pencil" },
  IN_REVIEW: { tone: "amber", icon: "clock" },
  APPROVED: { tone: "blue", icon: "check-circle" },
  AWAITING_SIGNATURE: { tone: "violet", icon: "clock" },
  SIGNED: { tone: "green", icon: "file-text" },
  REJECTED: { tone: "red", icon: "x" },
};

export function LoaBadge({ status }: { status: keyof typeof LOA_STATUS_LABELS }) {
  const v = LOA_TONE[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {LOA_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ------------------------------ projects ----------------------------- */

const PROJ_TONE: Record<ProjectStatus, { tone: BadgeTone; icon: IconName }> = {
  PLANNING: { tone: "navy", icon: "pencil" },
  IN_PROGRESS: { tone: "blue", icon: "zap" },
  AT_RISK: { tone: "red", icon: "alert" },
  COMPLETED: { tone: "green", icon: "check-circle" },
  ON_HOLD: { tone: "amber", icon: "clock" },
};

export function ProjectBadge({ status }: { status: ProjectStatus }) {
  const v = PROJ_TONE[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ---------------------------- research jobs -------------------------- */

const JOB_TONE: Record<JobStatus, { tone: BadgeTone; icon: IconName; spin?: boolean }> = {
  QUEUED: { tone: "neutral", icon: "clock" },
  RUNNING: { tone: "blue", icon: "loader", spin: true },
  COMPLETED: { tone: "green", icon: "check-circle" },
  FAILED: { tone: "red", icon: "alert" },
  CANCELLED: { tone: "neutral", icon: "minus-circle" },
};

const JOB_LABELS: Record<JobStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function JobBadge({ status }: { status: JobStatus }) {
  const v = JOB_TONE[status];
  return (
    <Badge tone={v.tone} icon={v.icon}>
      {JOB_LABELS[status]}
    </Badge>
  );
}

const CAND_TONE: Record<CandidateReviewStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: "amber", label: "Pending review" },
  ACCEPTED: { tone: "green", label: "Accepted" },
  ACCEPTED_LINKED: { tone: "teal", label: "Accepted (linked)" },
  REJECTED: { tone: "neutral", label: "Rejected" },
};

export function CandidateBadge({ status }: { status: CandidateReviewStatus }) {
  const v = CAND_TONE[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

/* ------------------------------ industry ----------------------------- */

import { ESSM_INDUSTRIES } from "../../partners/types";
import type { IndustryCode } from "../types";

export function industryLabel(code: IndustryCode): string {
  return ESSM_INDUSTRIES.find((i) => i.code === code)?.label ?? code;
}

export function IndustryChip({ industry }: { industry: IndustryCode }) {
  return <Badge tone="outline">{industryLabel(industry)}</Badge>;
}
