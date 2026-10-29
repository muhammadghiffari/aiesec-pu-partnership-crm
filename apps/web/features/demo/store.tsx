"use client";

/**
 * In-memory demo store for the /demo presentation prototype.
 *
 * React context + useReducer. Nothing is persisted: a page refresh reseeds
 * from the synthetic dataset (this limitation is documented in the UI and the
 * demo guide). Every consequential mutation appends an activity entry so the
 * dashboard timeline and per-partner timelines stay coherent with the data.
 */
import { createContext, useContext, useMemo, useReducer } from "react";
import { sessionId } from "./format";
import { seedDataset } from "./seed";
import type {
  DemoActionItem,
  DemoCandidate,
  DemoContact,
  DemoContactChannel,
  DemoCycle,
  DemoDataset,
  DemoMeeting,
  DemoOutreachDraft,
  DemoPartner,
  DemoPrefs,
  DemoProject,
  IndustryCode,
  LifecycleStage,
  ProjectSupportCode,
  ResearchCriteria,
  SourceTier,
  VerificationStatus,
} from "./types";
import { DEMO_NOW_ISO } from "./types";

export type DemoDataMode = "connecting" | "sandbox" | "live";

/** Signed-in principal reported by /api/demo/status (dev/demo mode only). */
export interface DemoRuntimeUser {
  email: string;
  role: string;
}

export interface DemoState extends DemoDataset {
  prefs: DemoPrefs;
  seq: number;
  /** Where the partner/contact directory is served from ("connecting" before first probe). */
  mode: DemoDataMode;
  liveUser: DemoRuntimeUser | null;
  /** Dev-only local sign-in availability inside the demo gate (D-016). */
  devSignIn: boolean;
  devEmail: string | null;
  /** True when the database is configured but a probe could not reach it. */
  unreachable: boolean;
}

function initialState(): DemoState {
  return {
    ...seedDataset(),
    prefs: { density: "comfortable", dateFormat: "relative" },
    seq: 100,
    mode: "connecting",
    liveUser: null,
    devSignIn: false,
    devEmail: null,
    unreachable: false,
  };
}

interface LogInput {
  kind: string;
  partnerId: string | null;
  summary: string;
  href: string;
}

function log(state: DemoState, entry: LogInput): DemoState {
  const seq = state.seq + 1;
  return {
    ...state,
    seq,
    activities: [
      {
        id: sessionId("a", seq),
        at: new Date().toISOString(),
        actor: state.liveUser?.email ?? "Nadia Prameswari",
        kind: entry.kind,
        partnerId: entry.partnerId,
        summary: entry.summary,
        href: entry.href,
      },
      ...state.activities,
    ],
  };
}

function patchPartner(state: DemoState, partnerId: string, touchOnly = true): DemoState {
  return {
    ...state,
    partners: state.partners.map((p) =>
      p.id === partnerId
        ? { ...p, lastActivityAt: touchOnly ? new Date().toISOString() : p.lastActivityAt }
        : p,
    ),
  };
}

/* ------------------------------- actions ------------------------------- */

export type DemoAction =
  | { type: "RESET" }
  | { type: "SET_PREF"; key: keyof DemoPrefs; value: DemoPrefs[keyof DemoPrefs] }
  | {
      type: "SET_RUNTIME";
      mode: DemoDataMode;
      liveUser: DemoRuntimeUser | null;
      devSignIn: boolean;
      devEmail: string | null;
      unreachable: boolean;
    }
  | { type: "LOAD_LIVE_DIRECTORY"; partners: DemoPartner[]; contacts: DemoContact[] }
  | { type: "UPSERT_LIVE_PARTNER"; partner: DemoPartner }
  | { type: "UPSERT_LIVE_CONTACT"; contact: DemoContact }
  | {
      type: "JOURNAL";
      entry: { kind: string; partnerId: string | null; summary: string; href: string };
    }
  | {
      type: "MARK_CANDIDATE_REVIEWED";
      candidateId: string;
      outcome: "ACCEPTED" | "ACCEPTED_LINKED" | "REJECTED";
      note: string;
    }
  | { type: "MARK_NOTIFICATIONS_READ" }
  | { type: "ADD_PARTNER"; partner: NewPartnerPayload }
  | { type: "UPDATE_PARTNER"; id: string; patch: PartnerPatch }
  | { type: "ADD_CONTACT"; partnerId: string; contact: NewContactPayload }
  | {
      type: "SET_IDENTITY_VERIFICATION";
      contactId: string;
      status: VerificationStatus;
      method: string | null;
      evidenceUrl: string | null;
    }
  | {
      type: "SET_CHANNEL_VERIFICATION";
      contactId: string;
      channel: DemoContactChannel["channel"];
      status: VerificationStatus;
      method: string | null;
      evidenceUrl: string | null;
    }
  | { type: "SET_DNC"; contactId: string; active: boolean; reason: string }
  | { type: "TOGGLE_TASK"; taskId: string }
  | { type: "SET_CRITERIA"; criteria: ResearchCriteria }
  | { type: "RUN_JOB"; name: string; criteriaSnippet: string }
  | { type: "UPDATE_JOB"; jobId: string; patch: Partial<DemoResearchJobLike> }
  | { type: "COMPLETE_JOB"; jobId: string; candidates: DemoCandidate[] }
  | { type: "ACCEPT_CANDIDATE"; candidateId: string; resolution: "NEW" | "LINK"; note: string }
  | { type: "REJECT_CANDIDATE"; candidateId: string; reason: string }
  | {
      type: "CREATE_DRAFT";
      draft: Omit<
        DemoOutreachDraft,
        "id" | "approvedAt" | "approvedBy" | "approvedHash" | "createdAt" | "updatedAt"
      >;
    }
  | { type: "UPDATE_DRAFT"; draftId: string; patch: DraftPatch }
  | { type: "STAMP_DRAFT"; draftId: string }
  | { type: "ADD_MEETING"; meeting: NewMeetingPayload }
  | { type: "SET_MEETING_STATUS"; meetingId: string; status: DemoMeeting["status"] }
  | { type: "SET_MINUTES"; meetingId: string; minutes: DemoMeeting["minutes"] }
  | { type: "TOGGLE_MEETING_ITEM"; meetingId: string; itemId: string }
  | { type: "LOA_SUBMIT"; loaId: string }
  | { type: "LOA_APPROVE"; loaId: string; note: string }
  | { type: "LOA_RECORD_SIGNATURE"; loaId: string; signedAt: string; signedRef: string }
  | { type: "ADVANCE_CYCLE_STAGE"; cycleId: string; stage: LifecycleStage }
  | { type: "ADD_PROJECT"; project: NewProjectPayload }
  | { type: "SET_PROJECT_STATUS"; projectId: string; status: DemoProject["status"] }
  | { type: "TOGGLE_PROJECT_ITEM"; projectId: string; itemId: string };

export interface DemoResearchJobLike {
  status: DemoState["jobs"][number]["status"];
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  found: number;
}

export interface NewPartnerPayload {
  name: string;
  websiteDomain: string | null;
  industry: IndustryCode;
  officialEmail: string | null;
  sourceTier: SourceTier;
  sourceUrl: string | null;
  lawfulBasisNote: string;
  notes: string | null;
  contact: NewContactPayload | null;
}

export interface NewContactPayload {
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  sourceTier: SourceTier;
  sourceUrl: string | null;
  lawfulBasisNote: string;
}

export interface PartnerPatch {
  name?: string;
  websiteDomain?: string | null;
  industry?: IndustryCode;
  officialEmail?: string | null;
  notes?: string | null;
  ownerName?: string | null;
}

export interface DraftPatch {
  partnerId?: string;
  contactId?: string;
  channel?: DemoOutreachDraft["channel"];
  subject?: string;
  body?: string;
}

export interface NewMeetingPayload {
  partnerId: string;
  title: string;
  kind: DemoMeeting["kind"];
  at: string;
  location: string;
  attendees: string[];
}

export interface NewProjectPayload {
  partnerId: string;
  cycleId: string;
  name: string;
  projectSupport: ProjectSupportCode;
  owner: string;
  startDate: string;
  endDate: string;
}

/* ------------------------------- reducer ------------------------------- */

function partnerName(dataset: DemoDataset, partnerId: string | null): string {
  if (!partnerId) return "";
  return dataset.partners.find((p) => p.id === partnerId)?.name ?? "the partner";
}

function contactById(state: DemoState, contactId: string): DemoContact | undefined {
  return state.contacts.find((c) => c.id === contactId);
}

function mapContact(
  state: DemoState,
  contactId: string,
  fn: (c: DemoContact) => DemoContact,
): DemoContact[] {
  return state.contacts.map((c) => (c.id === contactId ? fn(c) : c));
}

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "RESET":
      return initialState();
    case "SET_PREF":
      return { ...state, prefs: { ...state.prefs, [action.key]: action.value } };
    case "MARK_NOTIFICATIONS_READ":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };

    case "SET_RUNTIME":
      return {
        ...state,
        mode: action.mode,
        liveUser: action.liveUser,
        devSignIn: action.devSignIn,
        devEmail: action.devEmail,
        unreachable: action.unreachable,
      };

    /* Live-directory actions (D-016): the payload is already mapped to demo shapes
     * by the runtime layer; the reducer only normalises state. Dependent demo slices
     * are pruned to partner ids the database actually has, so references stay coherent. */
    case "LOAD_LIVE_DIRECTORY": {
      const partnerIds = new Set(action.partners.map((p) => p.id));
      return {
        ...state,
        partners: action.partners,
        contacts: action.contacts,
        meetings: state.meetings.filter((m) => partnerIds.has(m.partnerId)),
        agreements: state.agreements.filter((a) => partnerIds.has(a.partnerId)),
        projects: state.projects.filter((p) => partnerIds.has(p.partnerId)),
        drafts: state.drafts.filter((d) => partnerIds.has(d.partnerId)),
        candidates: state.candidates.map((c) =>
          c.duplicateOf && !partnerIds.has(c.duplicateOf) ? { ...c, duplicateOf: null } : c,
        ),
        tasks: state.tasks.filter((t) => !t.partnerId || partnerIds.has(t.partnerId)),
      };
    }

    case "UPSERT_LIVE_PARTNER": {
      const existing = state.partners.find((p) => p.id === action.partner.id);
      // notes / ownerName are demo-session fields with no persisted column yet
      // (D-016 scope); keep the session's copy so an API refresh cannot wipe them.
      const incoming = existing
        ? {
            ...action.partner,
            ownerName: action.partner.ownerName ?? existing.ownerName,
            notes: action.partner.notes ?? existing.notes,
            lastActivityAt: new Date().toISOString(),
          }
        : action.partner;
      return {
        ...state,
        partners: existing
          ? state.partners.map((p) => (p.id === incoming.id ? incoming : p))
          : [...state.partners, incoming],
      };
    }

    case "UPSERT_LIVE_CONTACT": {
      const existing = state.contacts.find((c) => c.id === action.contact.id);
      // addedAt is a demo-session timestamp (no stored column); keep it stable.
      const contact = existing ? { ...action.contact, addedAt: existing.addedAt } : action.contact;
      const next: DemoState = {
        ...state,
        contacts: existing
          ? state.contacts.map((c) => (c.id === contact.id ? contact : c))
          : [...state.contacts, contact],
      };
      return patchPartner(next, contact.partnerId);
    }

    case "JOURNAL":
      return log(state, action.entry);

    case "MARK_CANDIDATE_REVIEWED": {
      const now = new Date().toISOString();
      return {
        ...state,
        candidates: state.candidates.map((c) =>
          c.id === action.candidateId
            ? {
                ...c,
                reviewStatus: action.outcome,
                reviewReason: action.note || "Accepted after human review (demo).",
                reviewedBy: state.liveUser?.email ?? "Demo session",
                reviewedAt: now,
              }
            : c,
        ),
      };
    }

    case "ADD_PARTNER": {
      const seq = state.seq + 1;
      const pid = sessionId("p", seq);
      const now = new Date().toISOString();
      const contact: DemoContact | null = action.partner.contact
        ? {
            id: sessionId("c", seq),
            partnerId: pid,
            name: action.partner.contact.name,
            title: action.partner.contact.title,
            identityVerification: "unverified",
            identityMethod: null,
            identityEvidenceUrl: null,
            channels: [
              {
                channel: "email",
                value: action.partner.contact.email,
                verification: "unverified",
                method: null,
                evidenceUrl: null,
                verifiedAt: null,
              },
              ...(action.partner.contact.phone
                ? [
                    {
                      channel: "whatsapp" as const,
                      value: action.partner.contact.phone,
                      verification: "unverified" as const,
                      method: null,
                      evidenceUrl: null,
                      verifiedAt: null,
                    },
                  ]
                : []),
            ],
            sourceTier: action.partner.contact.sourceTier,
            sourceUrl: action.partner.contact.sourceUrl,
            lawfulBasisNote: action.partner.contact.lawfulBasisNote,
            dnc: null,
            addedAt: now,
          }
        : null;
      const partner: DemoPartner = {
        id: pid,
        name: action.partner.name,
        websiteDomain: action.partner.websiteDomain,
        industry: action.partner.industry,
        officialEmail: action.partner.officialEmail,
        ownerName: null,
        sourceTier: action.partner.sourceTier,
        sourceUrl: action.partner.sourceUrl,
        lawfulBasisNote: action.partner.lawfulBasisNote,
        notes: action.partner.notes,
        createdAt: now,
        lastActivityAt: now,
      };
      let next: DemoState = {
        ...state,
        seq,
        partners: [...state.partners, partner],
        contacts: contact ? [...state.contacts, contact] : state.contacts,
      };
      next = log(next, {
        kind: "partner_created",
        partnerId: pid,
        summary: `Added ${partner.name} to the partner directory (demo session record).`,
        href: `/demo/partners/${pid}`,
      });
      return next;
    }

    case "UPDATE_PARTNER": {
      let next: DemoState = {
        ...state,
        partners: state.partners.map((p) =>
          p.id === action.id
            ? { ...p, ...action.patch, lastActivityAt: new Date().toISOString() }
            : p,
        ),
      };
      next = log(next, {
        kind: "edited",
        partnerId: action.id,
        summary: `Edited organization details for ${partnerName(next, action.id)}.`,
        href: `/demo/partners/${action.id}`,
      });
      return next;
    }

    case "ADD_CONTACT": {
      const seq = state.seq + 1;
      const now = new Date().toISOString();
      const contact: DemoContact = {
        id: sessionId("c", seq),
        partnerId: action.partnerId,
        name: action.contact.name,
        title: action.contact.title,
        identityVerification: "unverified",
        identityMethod: null,
        identityEvidenceUrl: null,
        channels: [
          {
            channel: "email",
            value: action.contact.email,
            verification: "unverified",
            method: null,
            evidenceUrl: null,
            verifiedAt: null,
          },
          ...(action.contact.phone
            ? [
                {
                  channel: "whatsapp" as const,
                  value: action.contact.phone,
                  verification: "unverified" as const,
                  method: null,
                  evidenceUrl: null,
                  verifiedAt: null,
                },
              ]
            : []),
        ],
        sourceTier: action.contact.sourceTier,
        sourceUrl: action.contact.sourceUrl,
        lawfulBasisNote: action.contact.lawfulBasisNote,
        dnc: null,
        addedAt: now,
      };
      let next: DemoState = patchPartner(
        { ...state, seq, contacts: [...state.contacts, contact] },
        action.partnerId,
      );
      next = log(next, {
        kind: "contact",
        partnerId: action.partnerId,
        summary: `Added contact ${contact.name} to ${partnerName(state, action.partnerId)}.`,
        href: "/demo/contacts",
      });
      return next;
    }

    case "SET_IDENTITY_VERIFICATION": {
      const contact = contactById(state, action.contactId);
      if (!contact) return state;
      let next: DemoState = {
        ...state,
        contacts: mapContact(state, action.contactId, (c) => ({
          ...c,
          identityVerification: action.status,
          identityMethod: action.method,
          identityEvidenceUrl: action.evidenceUrl,
        })),
      };
      next = patchPartner(next, contact.partnerId);
      next = log(next, {
        kind: "verified",
        partnerId: contact.partnerId,
        summary: `Identity verification for ${contact.name} set to ${action.status}${action.method ? ` via ${action.method}` : ""}.`,
        href: "/demo/contacts",
      });
      return next;
    }

    case "SET_CHANNEL_VERIFICATION": {
      const contact = contactById(state, action.contactId);
      if (!contact) return state;
      let next: DemoState = {
        ...state,
        contacts: mapContact(state, action.contactId, (c) => ({
          ...c,
          channels: c.channels.map((ch) =>
            ch.channel === action.channel
              ? {
                  ...ch,
                  verification: action.status,
                  method: action.method,
                  evidenceUrl: action.evidenceUrl,
                  verifiedAt: action.status === "verified" ? new Date().toISOString() : null,
                }
              : ch,
          ),
        })),
      };
      next = patchPartner(next, contact.partnerId);
      next = log(next, {
        kind: "verified",
        partnerId: contact.partnerId,
        summary: `${contact.name}'s ${action.channel} channel set to ${action.status}${action.method ? ` via ${action.method}` : ""}.`,
        href: "/demo/contacts",
      });
      return next;
    }

    case "SET_DNC": {
      const contact = contactById(state, action.contactId);
      if (!contact) return state;
      let next: DemoState = {
        ...state,
        contacts: mapContact(state, action.contactId, (c) => ({
          ...c,
          dnc: action.active
            ? {
                active: true,
                reason: action.reason,
                at: new Date().toISOString(),
                by: "Nadia Prameswari",
              }
            : null,
        })),
      };
      next = patchPartner(next, contact.partnerId);
      next = log(next, {
        kind: "dnc",
        partnerId: contact.partnerId,
        summary: action.active
          ? `Marked ${contact.name} as Do-Not-Contact: ${action.reason}`
          : `Cleared Do-Not-Contact for ${contact.name}: ${action.reason}`,
        href: "/demo/contacts",
      });
      return next;
    }

    case "TOGGLE_TASK":
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.taskId ? { ...t, done: !t.done } : t)),
      };

    case "SET_CRITERIA":
      return { ...state, criteria: { ...action.criteria, updatedAt: new Date().toISOString() } };

    case "RUN_JOB": {
      const seq = state.seq + 1;
      const job = {
        id: sessionId("job", seq),
        name: action.name,
        status: "RUNNING" as const,
        progress: 4,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        criteriaSnippet: action.criteriaSnippet,
        found: 0,
      };
      return { ...state, seq, jobs: [job, ...state.jobs] };
    }

    case "UPDATE_JOB":
      return {
        ...state,
        jobs: state.jobs.map((j) => (j.id === action.jobId ? { ...j, ...action.patch } : j)),
      };

    case "COMPLETE_JOB": {
      let next: DemoState = {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                status: "COMPLETED",
                progress: 100,
                completedAt: new Date().toISOString(),
                found: action.candidates.length,
              }
            : j,
        ),
        candidates: [...action.candidates, ...state.candidates],
      };
      next = log(next, {
        kind: "research",
        partnerId: null,
        summary: `Simulated research job completed with ${action.candidates.length} candidate(s) for review.`,
        href: "/demo/research",
      });
      return next;
    }

    case "ACCEPT_CANDIDATE": {
      const cand = state.candidates.find((c) => c.id === action.candidateId);
      if (cand?.reviewStatus !== "PENDING") return state;
      const seq = state.seq + 1;
      const now = new Date().toISOString();
      let next: DemoState = { ...state, seq };
      if (action.resolution === "NEW") {
        const pid = sessionId("p", seq);
        const partner: DemoPartner = {
          id: pid,
          name: cand.orgName,
          websiteDomain: cand.websiteDomain,
          industry: cand.industry,
          officialEmail: null,
          ownerName: null,
          sourceTier: cand.sourceTier,
          sourceUrl: cand.sourceUrl,
          lawfulBasisNote: `Accepted from simulated research job ${cand.jobId}. Verify provenance before use.`,
          notes: cand.notes,
          createdAt: now,
          lastActivityAt: now,
        };
        const cycle: DemoCycle = {
          id: sessionId("cy", seq),
          partnerId: pid,
          stage: "PROSPECTING",
          salesType: "NEW_SALES",
          salesStatus: "ACTIVE",
          approachMethod: "ACTIVE",
          projectSupport: "OTHERS",
          partnershipStatus: null,
          agreedValueIdr: null,
          alignment: null,
          stageHistory: [{ stage: "PROSPECTING", at: now }],
          startedAt: now,
          updatedAt: now,
          nextAction: { label: "Verify provenance and contact channels", dueDate: now },
        };
        const contact: DemoContact | null = cand.contactDraft.name
          ? {
              id: sessionId("c", seq),
              partnerId: pid,
              name: cand.contactDraft.name,
              title: cand.contactDraft.title,
              identityVerification: "unverified",
              identityMethod: null,
              identityEvidenceUrl: null,
              channels: [
                {
                  channel: "email",
                  value: cand.contactDraft.email,
                  verification: "unverified",
                  method: null,
                  evidenceUrl: null,
                  verifiedAt: null,
                },
              ],
              sourceTier: cand.sourceTier,
              sourceUrl: cand.sourceUrl,
              lawfulBasisNote: `Lifted from simulated research candidate ${cand.id}; verify before outreach.`,
              dnc: null,
              addedAt: now,
            }
          : null;
        next = {
          ...next,
          partners: [...next.partners, partner],
          cycles: [...next.cycles, cycle],
          contacts: contact ? [...next.contacts, contact] : next.contacts,
        };
        next = log(next, {
          kind: "research",
          partnerId: pid,
          summary: `Accepted research candidate '${cand.orgName}' — created partner record in Prospecting.${action.note ? ` Note: ${action.note}` : ""}`,
          href: `/demo/partners/${pid}`,
        });
      } else {
        next = log(next, {
          kind: "research",
          partnerId: cand.duplicateOf,
          summary: `Accepted candidate '${cand.orgName}' as the same organization as ${partnerName(state, cand.duplicateOf)} — linked, no duplicate created.${action.note ? ` Note: ${action.note}` : ""}`,
          href: cand.duplicateOf ? `/demo/partners/${cand.duplicateOf}` : "/demo/research",
        });
        if (cand.duplicateOf) next = patchPartner(next, cand.duplicateOf);
      }
      next = {
        ...next,
        candidates: next.candidates.map((c) =>
          c.id === action.candidateId
            ? {
                ...c,
                reviewStatus: action.resolution === "NEW" ? "ACCEPTED" : "ACCEPTED_LINKED",
                reviewReason: action.note || "Accepted after human review (prototype).",
                reviewedBy: "Nadia Prameswari",
                reviewedAt: now,
              }
            : c,
        ),
      };
      return next;
    }

    case "REJECT_CANDIDATE": {
      const cand = state.candidates.find((c) => c.id === action.candidateId);
      if (cand?.reviewStatus !== "PENDING") return state;
      let next: DemoState = {
        ...state,
        candidates: state.candidates.map((c) =>
          c.id === action.candidateId
            ? {
                ...c,
                reviewStatus: "REJECTED",
                reviewReason: action.reason,
                reviewedBy: "Nadia Prameswari",
                reviewedAt: new Date().toISOString(),
              }
            : c,
        ),
      };
      next = log(next, {
        kind: "research",
        partnerId: null,
        summary: `Rejected research candidate '${cand.orgName}': ${action.reason}`,
        href: "/demo/research",
      });
      return next;
    }

    case "CREATE_DRAFT": {
      const seq = state.seq + 1;
      const now = new Date().toISOString();
      const draft: DemoOutreachDraft = {
        ...action.draft,
        id: sessionId("d", seq),
        approvedAt: null,
        approvedBy: null,
        approvedHash: null,
        createdAt: now,
        updatedAt: now,
      };
      let next: DemoState = { ...state, seq, drafts: [draft, ...state.drafts] };
      next = log(next, {
        kind: "outreach",
        partnerId: draft.partnerId,
        summary: `Created outreach draft for ${partnerName(state, draft.partnerId)} (synthetic template, not sent).`,
        href: "/demo/outreach",
      });
      return next;
    }

    case "UPDATE_DRAFT": {
      const before = state.drafts.find((d) => d.id === action.draftId);
      let next: DemoState = {
        ...state,
        drafts: state.drafts.map((d) =>
          d.id === action.draftId
            ? {
                ...d,
                ...action.patch,
                approvedAt: null,
                approvedBy: null,
                approvedHash: null,
                updatedAt: new Date().toISOString(),
              }
            : d,
        ),
      };
      if (before?.approvedAt) {
        next = log(next, {
          kind: "outreach",
          partnerId: before.partnerId,
          summary:
            "Edited a previously reviewed draft — review stamp invalidated (exact-version approval rule).",
          href: "/demo/outreach",
        });
      }
      return next;
    }

    case "STAMP_DRAFT": {
      const draft = state.drafts.find((d) => d.id === action.draftId);
      if (!draft) return state;
      let next: DemoState = {
        ...state,
        drafts: state.drafts.map((d) =>
          d.id === action.draftId
            ? {
                ...d,
                approvedAt: new Date().toISOString(),
                approvedBy: "Nadia Prameswari",
                approvedHash: `demo-stamp-${Math.abs(hashCode(d.id + d.updatedAt)).toString(16)}`,
              }
            : d,
        ),
      };
      next = log(next, {
        kind: "outreach",
        partnerId: draft.partnerId,
        summary: `Human reviewed the exact version of the draft for ${partnerName(state, draft.partnerId)} (demo stamp — nothing is ever sent).`,
        href: "/demo/outreach",
      });
      return next;
    }

    case "ADD_MEETING": {
      const seq = state.seq + 1;
      const cycleId =
        state.cycles.find(
          (c) => c.partnerId === action.meeting.partnerId && c.salesStatus === "ACTIVE",
        )?.id ??
        state.cycles.find((c) => c.partnerId === action.meeting.partnerId)?.id ??
        "none";
      const meeting: DemoMeeting = {
        id: sessionId("m", seq),
        partnerId: action.meeting.partnerId,
        cycleId,
        title: action.meeting.title,
        kind: action.meeting.kind,
        at: action.meeting.at,
        location: action.meeting.location,
        attendees: action.meeting.attendees,
        status: "SCHEDULED",
        minutes: null,
      };
      let next: DemoState = patchPartner(
        { ...state, seq, meetings: [meeting, ...state.meetings] },
        action.meeting.partnerId,
      );
      next = log(next, {
        kind: "meeting",
        partnerId: action.meeting.partnerId,
        summary: `Scheduled ${action.meeting.kind.toLowerCase()} meeting '${action.meeting.title}' (synthetic record).`,
        href: "/demo/meetings",
      });
      return next;
    }

    case "SET_MEETING_STATUS": {
      const m = state.meetings.find((x) => x.id === action.meetingId);
      let next: DemoState = {
        ...state,
        meetings: state.meetings.map((x) =>
          x.id === action.meetingId ? { ...x, status: action.status } : x,
        ),
      };
      if (m) {
        next = log(next, {
          kind: "meeting",
          partnerId: m.partnerId,
          summary: `Meeting '${m.title}' marked ${action.status.toLowerCase()}.`,
          href: "/demo/meetings",
        });
      }
      return next;
    }

    case "SET_MINUTES": {
      const m = state.meetings.find((x) => x.id === action.meetingId);
      let next: DemoState = {
        ...state,
        meetings: state.meetings.map((x) =>
          x.id === action.meetingId ? { ...x, minutes: action.minutes } : x,
        ),
      };
      if (m) {
        next = log(next, {
          kind: "meeting",
          partnerId: m.partnerId,
          summary: `Recorded minutes of meeting for '${m.title}' (demo MoM).`,
          href: "/demo/meetings",
        });
      }
      return next;
    }

    case "TOGGLE_MEETING_ITEM":
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.minutes && hasItem(m.minutes.actionItems, action.itemId)
            ? {
                ...m,
                minutes: {
                  ...m.minutes,
                  actionItems: toggleItem(m.minutes.actionItems, action.itemId),
                },
              }
            : m,
        ),
      };

    case "LOA_SUBMIT": {
      const loa = state.agreements.find((a) => a.id === action.loaId);
      let next: DemoState = {
        ...state,
        agreements: state.agreements.map((a) =>
          a.id === action.loaId
            ? {
                ...a,
                status: "IN_REVIEW",
                history: [
                  ...a.history,
                  {
                    actor: "Nadia Prameswari",
                    action: "SUBMITTED" as const,
                    at: new Date().toISOString(),
                    note: "Submitted for approval (metadata only).",
                  },
                ],
              }
            : a,
        ),
      };
      if (loa) {
        next = log(next, {
          kind: "loa",
          partnerId: loa.partnerId,
          summary: `Submitted ${loa.number} for approval (recorded workflow step only).`,
          href: "/demo/loa",
        });
      }
      return next;
    }

    case "LOA_APPROVE": {
      const loa = state.agreements.find((a) => a.id === action.loaId);
      let next: DemoState = {
        ...state,
        agreements: state.agreements.map((a) =>
          a.id === action.loaId
            ? {
                ...a,
                status: "APPROVED",
                history: [
                  ...a.history,
                  {
                    actor: "Nadia Prameswari",
                    action: "APPROVED" as const,
                    at: new Date().toISOString(),
                    note: `${action.note || "Approved"} — recorded in prototype; no legal effect.`,
                  },
                ],
              }
            : a,
        ),
      };
      if (loa) {
        next = log(next, {
          kind: "loa",
          partnerId: loa.partnerId,
          summary: `Approved ${loa.number} — recorded prototype approval, not a legal act.`,
          href: "/demo/loa",
        });
      }
      return next;
    }

    case "LOA_RECORD_SIGNATURE": {
      const loa = state.agreements.find((a) => a.id === action.loaId);
      let next: DemoState = {
        ...state,
        agreements: state.agreements.map((a) =>
          a.id === action.loaId
            ? {
                ...a,
                status: "SIGNED",
                signedRef: action.signedRef,
                signedAt: action.signedAt,
                history: [
                  ...a.history,
                  {
                    actor: "Nadia Prameswari",
                    action: "SIGNATURE_RECORDED" as const,
                    at: new Date().toISOString(),
                    note: "External signed-copy reference recorded; CRM does not sign documents.",
                  },
                ],
              }
            : a,
        ),
      };
      if (loa) {
        next = log(next, {
          kind: "loa",
          partnerId: loa.partnerId,
          summary: `Recorded external signed-copy reference for ${loa.number}.`,
          href: "/demo/loa",
        });
      }
      return next;
    }

    case "ADVANCE_CYCLE_STAGE": {
      const cycle = state.cycles.find((c) => c.id === action.cycleId);
      let next: DemoState = {
        ...state,
        cycles: state.cycles.map((c) =>
          c.id === action.cycleId
            ? {
                ...c,
                stage: action.stage,
                stageHistory: [
                  ...c.stageHistory,
                  { stage: action.stage, at: new Date().toISOString() },
                ],
                updatedAt: new Date().toISOString(),
                partnershipStatus:
                  action.stage === "PARTNERSHIP_IMPLEMENTATION" ? "ACTIVE" : c.partnershipStatus,
              }
            : c,
        ),
      };
      if (cycle) {
        next = patchPartner(next, cycle.partnerId);
        next = log(next, {
          kind: "stage_change",
          partnerId: cycle.partnerId,
          summary: `${partnerName(state, cycle.partnerId)} moved to ${action.stage.replaceAll("_", " ").toLowerCase()} (demo transition).`,
          href: `/demo/partners/${cycle.partnerId}`,
        });
      }
      return next;
    }

    case "ADD_PROJECT": {
      const seq = state.seq + 1;
      const project: DemoProject = {
        id: sessionId("pr", seq),
        partnerId: action.project.partnerId,
        cycleId: action.project.cycleId,
        name: action.project.name,
        projectSupport: action.project.projectSupport,
        status: "PLANNING",
        owner: action.project.owner,
        progress: 0,
        startDate: action.project.startDate,
        endDate: action.project.endDate,
        nextMilestone: null,
        milestones: [],
        actionItems: [],
      };
      let next: DemoState = patchPartner(
        { ...state, seq, projects: [project, ...state.projects] },
        action.project.partnerId,
      );
      next = log(next, {
        kind: "project",
        partnerId: action.project.partnerId,
        summary: `Created implementation project '${action.project.name}' (demo record).`,
        href: "/demo/projects",
      });
      return next;
    }

    case "SET_PROJECT_STATUS": {
      const p = state.projects.find((x) => x.id === action.projectId);
      let next: DemoState = {
        ...state,
        projects: state.projects.map((x) =>
          x.id === action.projectId ? { ...x, status: action.status } : x,
        ),
      };
      if (p) {
        next = log(next, {
          kind: "project",
          partnerId: p.partnerId,
          summary: `Project '${p.name}' marked ${action.status.toLowerCase().replaceAll("_", " ")}.`,
          href: "/demo/projects",
        });
      }
      return next;
    }

    case "TOGGLE_PROJECT_ITEM": {
      return {
        ...state,
        projects: state.projects.map((p) =>
          hasItem(p.actionItems, action.itemId)
            ? { ...p, actionItems: toggleItem(p.actionItems, action.itemId) }
            : p,
        ),
      };
    }

    default:
      return state;
  }
}

function hasItem(items: DemoActionItem[] | undefined, id: string): items is DemoActionItem[] {
  return Boolean(items?.some((i) => i.id === id));
}

function toggleItem(items: DemoActionItem[], id: string): DemoActionItem[] {
  return items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/* ------------------------------- context ------------------------------- */

export interface DemoContextValue {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
}

/** Raw store context. The public demo context (re-provided by the runtime layer with
 * a wrapped dispatch) is `DemoContext` below; `useDemo` consumers never see this. */
export const StoreContext = createContext<DemoContextValue | null>(null);

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): DemoContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used inside <DemoStoreProvider>");
  return ctx;
}

export { DemoContext };

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}

export const DEMO_DATE_LABEL = "29 Oct 2026";
export { DEMO_NOW_ISO };
