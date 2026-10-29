"use client";

/**
 * Runtime layer for the live demo mode (D-016).
 *
 * Stack: <DemoStoreProvider> (raw reactive store) → <ToastProvider> → <RuntimeBridge>,
 * and the bridge re-provides the public demo context with a *wrapped* dispatch:
 * the six partner/contact flows go through the persisted M1-03 API + PostgreSQL,
 * everything else dispatches to the sandbox reducer unchanged.
 *
 * What the wrapper guarantees:
 * - live mutations never happen without the API succeeding first (server truth),
 * - duplicates land as an explicit human-confirmation step (FR-203),
 * - authorization/audit stay server-side (no UI-only bypass),
 * - sandbox behaviour is byte-for-byte the old prototype behaviour.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sessionId } from "../format";
import {
  type DemoAction,
  DemoContext,
  type DemoDataMode,
  type DemoRuntimeUser,
  DemoStoreProvider,
  type NewContactPayload,
  type NewPartnerPayload,
  type PartnerPatch,
  useDemoStore,
} from "../store";
import type { DemoContact, DemoContactChannel, VerificationStatus } from "../types";
import { ToastProvider, useToast } from "../ui/toast";
import {
  type APIContact,
  type APIPartner,
  ApiError,
  createLivePartner,
  type DemoStatusPayload,
  type DuplicateLike,
  fetchDemoStatus,
  fetchLiveDirectory,
  patchLivePartner,
  sendDevSignIn,
  sendDevSignOut,
} from "./api";
import { toDemoContact, toDemoPartner } from "./map";

/* ------------------------------------------------------------------ */
/* Runtime API surface                                                */
/* ------------------------------------------------------------------ */

export type PartnerActionOutcome = { id: string } | { duplicates: DuplicateLike[] } | null;

export interface VerifyInput {
  partnerId: string;
  contactId: string;
  scope: "identity" | DemoContactChannel["channel"];
  status: VerificationStatus;
  method: string;
  evidenceUrl: string | null;
}

export interface DemoRuntimeApi {
  mode: DemoDataMode;
  signedIn: boolean;
  liveUser: DemoRuntimeUser | null;
  devSignIn: boolean;
  devEmail: string | null;
  unreachable: boolean;
  syncing: boolean;
  /** Re-probe the data mode and, when live+signed-in, reload the DB directory. */
  sync(): Promise<void>;
  devSignInNow(email: string): Promise<boolean>;
  signOutNow(): Promise<boolean>;
  /** Clear the demo session then re-sync (live = fresh read from the database). */
  resetAndSync(): Promise<void>;
  addPartner(
    payload: NewPartnerPayload,
    opts?: { confirmedDuplicates?: boolean },
  ): Promise<PartnerActionOutcome>;
  updatePartner(
    id: string,
    patch: PartnerPatch & { confirmedDuplicates?: boolean },
  ): Promise<"ok" | "dupes" | "failed">;
  addContact(partnerId: string, contact: NewContactPayload): Promise<boolean>;
  verifyContact(input: VerifyInput): Promise<boolean>;
  setDnc(partnerId: string, contactId: string, active: boolean, reason: string): Promise<boolean>;
  acceptCandidate(candidateId: string, partner: NewPartnerPayload): Promise<PartnerActionOutcome>;
}

const RuntimeContext = createContext<DemoRuntimeApi | null>(null);

export function useDemoRuntime(): DemoRuntimeApi {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error("useDemoRuntime must be used inside <DemoProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Provider stack                                                     */
/* ------------------------------------------------------------------ */

export function DemoProvider({ children }: { children: ReactNode }) {
  return (
    <DemoStoreProvider>
      <ToastProvider>
        <RuntimeBridge>{children}</RuntimeBridge>
      </ToastProvider>
    </DemoStoreProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Bridge                                                             */
/* ------------------------------------------------------------------ */

function RuntimeBridge({ children }: { children: ReactNode }) {
  // Consume the RAW store context and re-provide the public demo context with
  // an async-capable dispatch so `useDemo()` screens keep their existing shape.
  const raw = useDemoStore();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  // Latest-value refs keep callbacks stable without re-subscribing consumers.
  const stateRef = useRef(raw.state);
  stateRef.current = raw.state;
  const dispatchRef = useRef<(action: DemoAction) => void>(raw.dispatch);
  dispatchRef.current = raw.dispatch;

  const sync = useCallback(async () => {
    let status: DemoStatusPayload;
    try {
      status = await fetchDemoStatus();
    } catch {
      // fetchDemoStatus degrades to sandbox itself; this exact return is a guard.
      return;
    }
    dispatchRef.current({
      type: "SET_RUNTIME",
      mode: status.mode === "live" ? "live" : "sandbox",
      liveUser: status.user,
      devSignIn: status.devSignIn,
      devEmail: status.devEmail,
      unreachable: status.unreachable,
    });
    if (status.mode !== "live") return;
    if (!status.signedIn) return;
    setSyncing(true);
    try {
      const partners = await fetchLiveDirectory();
      const loadedAt = new Date().toISOString();
      dispatchRef.current({
        type: "LOAD_LIVE_DIRECTORY",
        partners: partners.map(toDemoPartner),
        contacts: partners.flatMap((p) =>
          p.contacts.map((contact) => toDemoContact(contact, loadedAt)),
        ),
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        console.error("live directory sync failed", error);
      }
      // Keep the local directory as-is; the workspace banner reflects the mode.
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const liveErrorToast = useCallback(
    (error: unknown, fallbackTitle = "Could not save") => {
      if (!(error instanceof ApiError)) {
        toast.err("Could not save", "The CRM API did not respond; nothing was changed.");
        return;
      }
      if (error.status === 401)
        toast.err("Sign in required", "Your session is not active — sign in again to continue.");
      else if (error.status === 403)
        toast.err("Not allowed", "Your role does not permit this change in the CRM policy.");
      else if (error.code === "service_unavailable")
        toast.err(
          "CRM service unavailable",
          "Persistence is not configured; the demo stays in sandbox mode.",
        );
      else if (error.status === 0)
        toast.err(
          "Cannot reach the CRM API",
          "The local service did not respond; nothing was changed.",
        );
      else if (error.code === "validation_failed")
        toast.err(
          "Validation failed",
          error.issues[0]?.message ?? "Check the fields and try again.",
        );
      else if (error.code === "not_found")
        toast.err("Record not found", "The database no longer has this record.");
      else toast.err(fallbackTitle, "The database did not accept the change.");
    },
    [toast],
  );

  const journal = useCallback((kind: string, partnerId: string | null, summary: string) => {
    dispatchRef.current({
      type: "JOURNAL",
      entry: {
        kind,
        partnerId,
        summary,
        href: partnerId ? `/demo/partners/${partnerId}` : "/demo/partners",
      },
    });
  }, []);

  /* ---------------- create partner (live ⇆ sandbox) ---------------- */

  const addPartner = useCallback<DemoRuntimeApi["addPartner"]>(
    async (payload, opts) => {
      if (stateRef.current.mode !== "live") {
        // Sandbox: identical behaviour to the original prototype reducer path.
        const id = sessionId("p", stateRef.current.seq + 1);
        dispatchRef.current({ type: "ADD_PARTNER", partner: payload });
        toast.ok("Partner created", "The new synthetic record is live in this demo session only.");
        return { id };
      }
      try {
        const saved = await createLivePartner({
          name: payload.name,
          industry: payload.industry,
          websiteDomain: payload.websiteDomain,
          officialEmail: payload.officialEmail,
          sourceTier: payload.sourceTier,
          sourceUrl: payload.sourceUrl,
          // lawfulBasisNote is persisted in the M1-03 sourceDescription column.
          sourceDescription: payload.lawfulBasisNote,
          confirmDuplicate: opts?.confirmedDuplicates ?? false,
          contact: payload.contact
            ? {
                name: payload.contact.name,
                title: payload.contact.title,
                email: payload.contact.email,
                phone: payload.contact.phone,
                sourceTier: payload.contact.sourceTier,
                sourceUrl: payload.contact.sourceUrl,
                lawfulBasisNote: payload.contact.lawfulBasisNote,
              }
            : undefined,
        });
        dispatchRef.current({ type: "UPSERT_LIVE_PARTNER", partner: toDemoPartner(saved) });
        journal(
          "created",
          saved.id,
          `Created ${saved.name} from the Add-partner flow (persisted in PostgreSQL).`,
        );
        toast.ok(
          "Partner created",
          "The new record is stored in PostgreSQL (crm_dev) with an audit entry.",
        );
        return { id: saved.id };
      } catch (error) {
        if (error instanceof ApiError) {
          if (
            (error.code === "duplicate_confirmation_required" ||
              error.code === "duplicate_partner") &&
            error.duplicates.length
          )
            return { duplicates: error.duplicates };
          if (error.code === "duplicate_contact")
            toast.err(
              "Duplicate email on file",
              "A contact with this email already exists for the partner on file.",
            );
          else liveErrorToast(error, "Could not create the partner");
        } else liveErrorToast(error, "Could not create the partner");
        return null;
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- edit partner ---------------- */

  const updatePartner = useCallback<DemoRuntimeApi["updatePartner"]>(
    async (id, patch) => {
      const confirmed = patch.confirmedDuplicates ?? false;
      if (stateRef.current.mode !== "live") {
        // Sandbox: notes/owner are session data, so the old reducer path keeps them.
        const partnerPatch: PartnerPatch = {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.websiteDomain !== undefined ? { websiteDomain: patch.websiteDomain } : {}),
          ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
          ...(patch.officialEmail !== undefined ? { officialEmail: patch.officialEmail } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.ownerName !== undefined ? { ownerName: patch.ownerName } : {}),
        };
        dispatchRef.current({ type: "UPDATE_PARTNER", id, patch: partnerPatch });
        toast.ok("Partner updated", "Changed in this demo session only (synthetic record).");
        return "ok";
      }
      try {
        // Live PATCH: notes/ownerName are NOT sent — the M1-03 contract has no
        // column for them yet (documented demo-session-only fields, D-016).
        const saved = await patchLivePartner<APIPartner>(id, "partner", {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.websiteDomain !== undefined ? { websiteDomain: patch.websiteDomain } : {}),
          ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
          ...(patch.officialEmail !== undefined ? { officialEmail: patch.officialEmail } : {}),
          confirmDuplicate: confirmed || undefined,
        });
        dispatchRef.current({ type: "UPSERT_LIVE_PARTNER", partner: toDemoPartner(saved) });
        journal(
          "edited",
          id,
          `Edited organization details after a persisted PATCH (audit entry recorded).`,
        );
        toast.ok(
          "Partner updated",
          "Change stored in PostgreSQL (crm_dev). Notes stay demo-session-only.",
        );
        return "ok";
      } catch (error) {
        if (error instanceof ApiError && error.isDuplicate) {
          const dupe = error.duplicates[0];
          toast.err(
            "Possible duplicate partner",
            dupe?.name
              ? `"${dupe.name}" looks like the same organization for these details - review it before saving.`
              : "Another record looks like the same organization - review it before saving.",
          );
          return "dupes";
        }
        liveErrorToast(error, "Could not update the partner");
        return "failed";
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- add contact ---------------- */

  const addContact = useCallback<DemoRuntimeApi["addContact"]>(
    async (partnerId, contact) => {
      if (stateRef.current.mode !== "live") {
        dispatchRef.current({
          type: "ADD_CONTACT",
          partnerId,
          contact,
        });
        toast.ok(
          "Contact added",
          "The synthetic contact is demo-session only and needs verification.",
        );
        return true;
      }
      try {
        const saved = await patchLivePartner<APIContact>(partnerId, "contact", {
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          sourceTier: contact.sourceTier,
          sourceUrl: contact.sourceUrl,
          lawfulBasisNote: contact.lawfulBasisNote,
        });
        const mapped = toDemoContact(saved, new Date().toISOString());
        dispatchRef.current({ type: "UPSERT_LIVE_CONTACT", contact: mapped });
        journal(
          "contact-added",
          partnerId,
          `Added contact ${saved.name} (persisted; verification pending).`,
        );
        toast.ok(
          "Contact added",
          "Stored in PostgreSQL (crm_dev). Verify the contact before outreach.",
        );
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === "duplicate_contact")
          toast.err(
            "Duplicate email on file",
            "A contact with this email already exists for this partner.",
          );
        else if (error instanceof ApiError && error.code === "duplicate_confirmation_required") {
          const dupe = error.duplicates[0];
          toast.err(
            "Possible duplicate partner",
            dupe?.name ?? "The record looks like an existing partner.",
          );
        } else liveErrorToast(error, "Could not add the contact");
        return false;
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- verification (contact-level) ---------------- */

  const verifyContact = useCallback<DemoRuntimeApi["verifyContact"]>(
    async (input) => {
      const isChannel = input.scope !== "identity";
      const title = isChannel ? `${cap(input.scope)} verification` : "Identity verification";
      if (stateRef.current.mode !== "live") {
        if (isChannel)
          dispatchRef.current({
            type: "SET_CHANNEL_VERIFICATION",
            contactId: input.contactId,
            channel: input.scope as DemoContactChannel["channel"],
            status: input.status,
            method: input.method,
            evidenceUrl: input.evidenceUrl,
          });
        else
          dispatchRef.current({
            type: "SET_IDENTITY_VERIFICATION",
            contactId: input.contactId,
            status: input.status,
            method: input.method,
            evidenceUrl: input.evidenceUrl,
          });
        toast.ok(
          input.status === "verified" ? "Verified" : "Updated",
          "Saved in this demo session only (synthetic record).",
        );
        return true;
      }
      try {
        const saved = await patchLivePartner<APIContact>(input.partnerId, "verify", {
          contactId: input.contactId,
          verification: input.status,
          ...(input.evidenceUrl ? { sourceUrl: input.evidenceUrl } : {}),
        });
        const loadedAt = new Date().toISOString();
        // method is a demo-journal wording only; it is kept in state until refresh.
        const mapped = {
          ...toDemoContact(saved, loadedAt),
          identityMethod: input.method || null,
          channels: toDemoContact(saved, loadedAt).channels.map((c) => ({
            ...c,
            method: input.method || null,
          })),
        };
        dispatchRef.current({ type: "UPSERT_LIVE_CONTACT", contact: mapped });
        journal(
          "verification",
          input.partnerId,
          `Contact verification set to ${input.status} (per-contact fact stored in PostgreSQL).`,
        );
        toast.ok(
          input.status === "verified" ? "Verified" : "Updated",
          "Stored in PostgreSQL (crm_dev) with an audit entry. Verification is a per-contact fact (each demo channel row shows the same status).",
        );
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === "validation_failed") {
          const path = error.issues[0]?.path ?? "";
          const message = error.issues[0]?.message ?? "Check the fields and try again.";
          toast.err(
            "Validation failed",
            path === "sourceUrl"
              ? `Evidence URL is required before ${input.status === "verified" ? "verifying" : "this change"}: ${message}`
              : message,
          );
        } else liveErrorToast(error, `Could not ${isChannel ? "update channel" : "save identity"}`);
        return false;
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- DNC ---------------- */

  const setDnc = useCallback<DemoRuntimeApi["setDnc"]>(
    async (partnerId, contactId, active, reason) => {
      if (stateRef.current.mode !== "live") {
        dispatchRef.current({ type: "SET_DNC", contactId, active, reason });
        toast.ok(
          active ? "Contact marked Do-Not-Contact" : "Do-Not-Contact cleared",
          "Saved in this demo session only (synthetic record).",
        );
        return true;
      }
      try {
        const saved = await patchLivePartner<APIContact>(partnerId, "dnc", {
          contactId,
          doNotContact: active,
          reason,
        });
        const mapped = toDemoContact(saved, new Date().toISOString());
        dispatchRef.current({
          type: "UPSERT_LIVE_CONTACT",
          contact: {
            ...mapped,
            dnc: mapped.dnc
              ? {
                  ...mapped.dnc,
                  by: stateRef.current.liveUser?.email ?? "recorded in the CRM audit trail",
                }
              : null,
          },
        });
        journal(
          "dnc",
          partnerId,
          active
            ? `Do-Not-Contact recorded with a reason (persisted + audited).`
            : `Do-Not-Contact cleared (persisted + audited).`,
        );
        toast.ok(
          active ? "Contact marked Do-Not-Contact" : "Do-Not-Contact cleared",
          "Stored in PostgreSQL (crm_dev) with an audit entry.",
        );
        return true;
      } catch (error) {
        liveErrorToast(error, "Could not update Do-Not-Contact");
        return false;
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- candidate acceptance (prospecting) ---------------- */

  const acceptCandidate = useCallback<DemoRuntimeApi["acceptCandidate"]>(
    async (candidateId, partner) => {
      if (stateRef.current.mode !== "live") {
        // Same reducer path as the prototype: creates partner ⇄ candidate link.
        const resolution = partner.contact ? "LINK" : "NEW";
        dispatchRef.current({
          type: "ACCEPT_CANDIDATE",
          candidateId,
          resolution,
          note: "Accepted after human review.",
        });
        toast.ok("Candidate accepted", "The synthetic candidate became a demo partner record.");
        return { id: sessionId("p", stateRef.current.seq + 1) };
      }
      try {
        const saved = await createLivePartner({
          name: partner.name,
          industry: partner.industry,
          websiteDomain: partner.websiteDomain,
          officialEmail: partner.officialEmail,
          sourceTier: partner.sourceTier,
          sourceUrl: partner.sourceUrl,
          sourceDescription: partner.lawfulBasisNote,
          confirmDuplicate: true, // candidate review already happened in the UI
          contact: partner.contact
            ? {
                name: partner.contact.name,
                title: partner.contact.title,
                email: partner.contact.email,
                phone: partner.contact.phone,
                sourceTier: partner.contact.sourceTier,
                sourceUrl: partner.contact.sourceUrl,
                lawfulBasisNote: partner.contact.lawfulBasisNote,
              }
            : undefined,
        });
        dispatchRef.current({ type: "UPSERT_LIVE_PARTNER", partner: toDemoPartner(saved) });
        const contact = saved.contacts[0];
        if (contact)
          dispatchRef.current({
            type: "UPSERT_LIVE_CONTACT",
            contact: toDemoContact(contact, new Date().toISOString()),
          });
        dispatchRef.current({
          type: "MARK_CANDIDATE_REVIEWED",
          candidateId,
          outcome: partner.contact ? "ACCEPTED_LINKED" : "ACCEPTED",
          note: "Accepted after human review (persisted in PostgreSQL).",
        });
        journal(
          "created",
          saved.id,
          `Candidate became a persisted partner record (audit entry recorded).`,
        );
        toast.ok(
          "Candidate accepted",
          "The record is stored in PostgreSQL (crm_dev) as a partner.",
        );
        return { id: saved.id };
      } catch (error) {
        if (error instanceof ApiError && error.isDuplicate) {
          const dupe = error.duplicates[0];
          toast.err(
            "Possible duplicate partner",
            dupe?.name ?? "This candidate looks like an existing partner.",
          );
        } else liveErrorToast(error, "Could not accept the candidate");
        return null;
      }
    },
    [journal, liveErrorToast, toast],
  );

  /* ---------------- session + reset ---------------- */

  const devSignInNow = useCallback<DemoRuntimeApi["devSignInNow"]>(
    async (email) => {
      try {
        await sendDevSignIn(email);
        await sync();
        toast.ok(
          "Signed in",
          `Local dev session for ${email} — real check-in, RBAC and audit, dev token only.`,
        );
        return true;
      } catch (error) {
        const api401 = error instanceof ApiError && (error.status === 401 || error.status === 403);
        toast.err(
          "Sign-in failed",
          api401
            ? "The dev token was rejected — this email must be in CRM_ALLOWED_EMAILS and exist as an active user."
            : "Could not reach the CRM API to sign in.",
        );
        return false;
      }
    },
    [sync, toast],
  );

  const signOutNow = useCallback<DemoRuntimeApi["signOutNow"]>(async () => {
    try {
      await sendDevSignOut();
      await sync();
      toast.ok("Signed out", "The demo shows synthetic data until you sign in again.");
      return true;
    } catch {
      toast.err("Sign-out failed", "Could not reach the CRM API.");
      return false;
    }
  }, [sync, toast]);

  const resetAndSync = useCallback<DemoRuntimeApi["resetAndSync"]>(async () => {
    dispatchRef.current({ type: "RESET" });
    await sync();
  }, [sync]);

  const runtime = useMemo<DemoRuntimeApi>(
    () => ({
      mode: raw.state.mode,
      signedIn: raw.state.liveUser !== null,
      liveUser: raw.state.liveUser,
      devSignIn: raw.state.devSignIn,
      devEmail: raw.state.devEmail,
      unreachable: raw.state.unreachable,
      syncing,
      sync,
      devSignInNow,
      signOutNow,
      resetAndSync,
      addPartner,
      updatePartner,
      addContact,
      verifyContact,
      setDnc,
      acceptCandidate,
    }),
    [
      raw.state.mode,
      raw.state.liveUser,
      raw.state.devSignIn,
      raw.state.devEmail,
      raw.state.unreachable,
      syncing,
      sync,
      devSignInNow,
      signOutNow,
      resetAndSync,
      addPartner,
      updatePartner,
      addContact,
      verifyContact,
      setDnc,
      acceptCandidate,
    ],
  );

  // Public demo context: same shape as before (state + dispatch). Screens that
  // only read state keep working; flows that mutate call the runtime actions.
  return (
    <RuntimeContext.Provider value={runtime}>
      <DemoContext.Provider value={raw}>{children}</DemoContext.Provider>
    </RuntimeContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
