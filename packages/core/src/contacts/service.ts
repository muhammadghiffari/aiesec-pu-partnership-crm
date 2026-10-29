/**
 * Contact verification service (M2-02, FR-200, FR-309-310). Human operations only.
 *
 * - Enrichment results and manual entries become CANDIDATES; a human accepts them into a
 *   contact + channel, both UNVERIFIED.
 * - A channel is verified by a human with a method and, for page-based methods, an evidence
 *   URL. A contact (identity) is verified only when at least one of its channels is verified.
 * - Setting do-not-contact is open to staff; clearing it is a CRM Lead gate override with a
 *   reason, because it reverses a partner's request.
 * - `checkReadiness` exposes the shared readiness rule used by approval and send (M2-04/05).
 *
 * Every input is Zod-validated, every call goes through the M0-05 guard, every mutation is
 * audited through M0-06. Audit metadata never contains names, addresses or emails.
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { type Clock, type Principal, systemClock } from "../auth/types";
import { CONTACT_CHANNELS, emailDomain, normalizeAddress } from "./address";
import { parseEnrichment } from "./enrichment";
import { assessReadiness, type Readiness } from "./readiness";
import {
  type ChannelRecord,
  type ContactCandidate,
  type ContactEnrichmentProvider,
  type ContactRecord,
  type ContactRepository,
  METHODS_WITHOUT_URL,
  VERIFICATION_METHODS,
} from "./types";

export const CONTACT_ERROR_CODES = [
  "VALIDATION_FAILED",
  "PARTNER_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "CHANNEL_NOT_FOUND",
  "CANDIDATE_NOT_FOUND",
  "CANDIDATE_ALREADY_REVIEWED",
  "CANDIDATE_ALREADY_PENDING",
  "CHANNEL_ALREADY_EXISTS",
  "EVIDENCE_REQUIRED",
  "NO_VERIFIED_CHANNEL",
  "ALREADY_VERIFIED",
  "ALREADY_DNC",
  "NOT_DNC",
  "CONTACT_DNC",
  "ENRICHMENT_DISABLED",
  "PROVIDER_FAILED",
  "PROVIDER_OUTPUT_INVALID",
] as const;
export type ContactErrorCode = (typeof CONTACT_ERROR_CODES)[number];

const HTTP: Record<ContactErrorCode, number> = {
  VALIDATION_FAILED: 400,
  PARTNER_NOT_FOUND: 404,
  CONTACT_NOT_FOUND: 404,
  CHANNEL_NOT_FOUND: 404,
  CANDIDATE_NOT_FOUND: 404,
  CANDIDATE_ALREADY_REVIEWED: 409,
  CANDIDATE_ALREADY_PENDING: 409,
  CHANNEL_ALREADY_EXISTS: 409,
  EVIDENCE_REQUIRED: 422,
  NO_VERIFIED_CHANNEL: 422,
  ALREADY_VERIFIED: 409,
  ALREADY_DNC: 409,
  NOT_DNC: 409,
  CONTACT_DNC: 409,
  ENRICHMENT_DISABLED: 409,
  PROVIDER_FAILED: 502,
  PROVIDER_OUTPUT_INVALID: 502,
};

export class ContactError extends Error {
  constructor(readonly code: ContactErrorCode) {
    super(`contacts: ${code}`);
    this.name = "ContactError";
  }
}

export type ContactFailure = { ok: false; code: string; httpStatus: number };
export type ContactResult<T> = { ok: true; value: T } | ContactFailure;

const uuid = z.uuid();
const httpUrl = z
  .string()
  .max(2000)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (
        (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      );
    } catch {
      return false;
    }
  });
const reason = z.string().trim().min(3).max(300);

export const manualCandidateSchema = z.strictObject({
  partnerId: uuid,
  name: z.string().trim().min(2).max(200),
  title: z.string().trim().max(120).optional(),
  channel: z.enum(CONTACT_CHANNELS),
  address: z.string().max(320),
  sourceUrl: httpUrl,
  sourceTier: z.enum(["OFFICIAL", "REFERRAL", "RESEARCH", "UNVERIFIED"]),
});
export const lookupSchema = z.strictObject({ partnerId: uuid });
export const acceptCandidateSchema = z.strictObject({
  candidateId: uuid,
  lawfulBasisNote: z.string().trim().min(3).max(500),
  /** Attach the channel to an existing contact of the same partner instead of a new contact. */
  existingContactId: uuid.optional(),
});
export const rejectCandidateSchema = z.strictObject({ candidateId: uuid, reason });
export const verifyChannelSchema = z.strictObject({
  channelId: uuid,
  method: z.enum(VERIFICATION_METHODS),
  evidenceUrl: httpUrl.optional(),
});
export const failChannelSchema = z.strictObject({ channelId: uuid, reason });
export const contactIdSchema = z.strictObject({ contactId: uuid });
export const dncSchema = z.strictObject({ contactId: uuid, reason });
export const clearDncSchema = z.strictObject({
  contactId: uuid,
  reason: z.string().trim().min(10).max(500),
});
export const readinessSchema = z.strictObject({
  partnerId: uuid,
  contactId: uuid,
  channelId: uuid,
  intendedChannel: z.enum(CONTACT_CHANNELS),
});

export interface ContactServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  repository: ContactRepository;
  /** null = ENRICH_PROVIDER=none: lookups are refused; manual entry still works. */
  enrichment: ContactEnrichmentProvider | null;
  clock?: Clock;
  newId?: () => string;
  enrichmentTimeoutMs?: number;
}

export function createContactService(deps: ContactServiceDeps) {
  const { repository: repo, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const timeoutMs = deps.enrichmentTimeoutMs ?? 20_000;
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (e) => audit.recordDenial(e),
  };

  const fail = (code: ContactErrorCode): ContactFailure => ({
    ok: false,
    code,
    httpStatus: HTTP[code],
  });
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): ContactResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as ContactFailure));
  async function settle<T>(run: () => Promise<ContactResult<T>>): Promise<ContactResult<T>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ContactError) return fail(error.code);
      throw error;
    }
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | ContactFailure {
    const r = schema.safeParse(input);
    return r.success ? { ok: true, data: r.data } : fail("VALIDATION_FAILED");
  }

  function mutate<T>(
    token: string | undefined | null,
    entityType: string,
    body: (
      p: Principal,
    ) => Promise<{ value: T; entityId: string; metadata?: Record<string, unknown> }>,
  ) {
    return settle<T>(async () =>
      unwrap(
        await audit.audited(token, { action: "contact.write", kind: "MUTATION", entityType }, body),
      ),
    );
  }

  async function storeCandidate(
    principal: Principal,
    partnerId: string,
    row: Omit<
      ContactCandidate,
      | "candidateId"
      | "partnerId"
      | "requestedBy"
      | "retrievedAt"
      | "reviewStatus"
      | "reviewedBy"
      | "reviewedAt"
      | "reviewReason"
      | "acceptedContactId"
    >,
  ): Promise<ContactCandidate | null> {
    if (await repo.hasPendingCandidate(partnerId, row.channel, row.address)) return null;
    const candidate: ContactCandidate = {
      ...row,
      candidateId: newId(),
      partnerId,
      requestedBy: principal.userId,
      retrievedAt: clock.now(),
      reviewStatus: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedContactId: null,
    };
    await repo.insertCandidate(candidate);
    return candidate;
  }

  // ---------------------------------------------------------------------------------------------

  async function addManualCandidate(token: string | undefined | null, input: unknown) {
    const v = parse(manualCandidateSchema, input);
    if (!v.ok) return v;
    const address = normalizeAddress(v.data.channel, v.data.address);
    if (!address) return fail("VALIDATION_FAILED");
    return mutate<ContactCandidate>(token, "contact_candidate", async (p) => {
      const partner = await repo.getPartner(v.data.partnerId);
      if (!partner) throw new ContactError("PARTNER_NOT_FOUND");
      const domain = v.data.channel === "EMAIL" ? emailDomain(address) : null;
      const created = await storeCandidate(p, partner.partnerId, {
        name: v.data.name,
        title: v.data.title ?? null,
        channel: v.data.channel,
        address,
        sourceUrl: v.data.sourceUrl,
        sourceTier: v.data.sourceTier,
        provider: "MANUAL",
        offDomain:
          domain !== null && partner.websiteDomain !== null && domain !== partner.websiteDomain,
      });
      if (!created) throw new ContactError("CANDIDATE_ALREADY_PENDING");
      return {
        value: created,
        entityId: created.candidateId,
        metadata: {
          partnerId: partner.partnerId,
          channel: created.channel,
          provider: "MANUAL",
          sourceTier: created.sourceTier,
        },
      };
    });
  }

  /** One partner per call, capped results, human-triggered. Never a crawl. */
  async function lookupContacts(token: string | undefined | null, input: unknown) {
    const v = parse(lookupSchema, input);
    if (!v.ok) return v;
    const provider = deps.enrichment;

    // Authorize and resolve the partner before any provider call.
    const pre = await settle(async () =>
      unwrap<{ name: string; websiteDomain: string | null }>(
        await runAuthorized(guardDeps, token, "contact.write", {}, async () => {
          if (!provider) throw new ContactError("ENRICHMENT_DISABLED");
          const partner = await repo.getPartner(v.data.partnerId);
          if (!partner) throw new ContactError("PARTNER_NOT_FOUND");
          return { name: partner.name, websiteDomain: partner.websiteDomain };
        }),
      ),
    );
    if (!pre.ok || !provider) return pre as ContactFailure;

    let raw: unknown;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      raw = await Promise.race([
        provider.lookup(
          { partnerName: pre.value.name, websiteDomain: pre.value.websiteDomain },
          { signal: controller.signal },
        ),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener("abort", () =>
            reject(new ContactError("PROVIDER_FAILED")),
          ),
        ),
      ]);
    } catch {
      return fail("PROVIDER_FAILED"); // provider messages are never surfaced or stored
    } finally {
      clearTimeout(timer);
    }

    const parsed = parseEnrichment(raw, pre.value.websiteDomain);
    if (!parsed) return fail("PROVIDER_OUTPUT_INVALID");

    return mutate<{
      stored: number;
      skippedDuplicates: number;
      rejected: number;
      truncated: boolean;
    }>(token, "contact_lookup", async (p) => {
      let stored = 0;
      let skipped = 0;
      for (const row of parsed.rows) {
        const created = await storeCandidate(p, v.data.partnerId, {
          ...row,
          provider: provider.code,
        });
        if (created) stored++;
        else skipped++;
      }
      return {
        value: {
          stored,
          skippedDuplicates: skipped,
          rejected: parsed.rejected,
          truncated: parsed.truncated,
        },
        entityId: v.data.partnerId,
        metadata: {
          provider: provider.code,
          stored,
          skipped,
          rejected: parsed.rejected,
          truncated: parsed.truncated,
        },
      };
    });
  }

  async function acceptCandidate(token: string | undefined | null, input: unknown) {
    const v = parse(acceptCandidateSchema, input);
    if (!v.ok) return v;
    return mutate<{ contactId: string; channelId: string }>(
      token,
      "contact_candidate",
      async (p) => {
        const candidate = await repo.getCandidate(v.data.candidateId);
        if (!candidate) throw new ContactError("CANDIDATE_NOT_FOUND");
        if (candidate.reviewStatus !== "PENDING")
          throw new ContactError("CANDIDATE_ALREADY_REVIEWED");

        let contactId: string;
        if (v.data.existingContactId) {
          const existing = await repo.getContact(v.data.existingContactId);
          // The existing contact must belong to the same partner.
          if (!existing || existing.partnerId !== candidate.partnerId)
            throw new ContactError("CONTACT_NOT_FOUND");
          if (await repo.findChannel(existing.contactId, candidate.channel, candidate.address)) {
            throw new ContactError("CHANNEL_ALREADY_EXISTS");
          }
          contactId = existing.contactId;
        } else {
          contactId = newId();
          await repo.insertContact({
            contactId,
            partnerId: candidate.partnerId,
            name: candidate.name,
            title: candidate.title,
            verificationStatus: "UNVERIFIED",
            verifiedBy: null,
            verifiedAt: null,
            lawfulBasisNote: v.data.lawfulBasisNote,
            doNotContact: false,
            dncReason: null,
            dncSetBy: null,
            dncSetAt: null,
          });
        }
        const channelId = newId();
        await repo.insertChannel({
          channelId,
          contactId,
          channel: candidate.channel,
          address: candidate.address,
          sourceUrl: candidate.sourceUrl,
          sourceTier: candidate.sourceTier,
          verificationStatus: "UNVERIFIED",
          verificationMethod: null,
          evidenceUrl: null,
          verifiedBy: null,
          verifiedAt: null,
          createdAt: clock.now(),
        });
        const marked = await repo.markCandidate(candidate.candidateId, {
          reviewStatus: "ACCEPTED",
          reviewedBy: p.userId,
          reviewedAt: clock.now(),
          reviewReason: null,
          acceptedContactId: contactId,
        });
        if (!marked) throw new ContactError("CANDIDATE_ALREADY_REVIEWED");
        return {
          value: { contactId, channelId },
          entityId: candidate.candidateId,
          metadata: {
            contactId,
            channelId,
            channel: candidate.channel,
            newContact: !v.data.existingContactId,
          },
        };
      },
    );
  }

  async function rejectCandidate(token: string | undefined | null, input: unknown) {
    const v = parse(rejectCandidateSchema, input);
    if (!v.ok) return v;
    return mutate<{ candidateId: string }>(token, "contact_candidate", async (p) => {
      const candidate = await repo.getCandidate(v.data.candidateId);
      if (!candidate) throw new ContactError("CANDIDATE_NOT_FOUND");
      const marked = await repo.markCandidate(candidate.candidateId, {
        reviewStatus: "REJECTED",
        reviewedBy: p.userId,
        reviewedAt: clock.now(),
        reviewReason: v.data.reason,
        acceptedContactId: null,
      });
      if (!marked) throw new ContactError("CANDIDATE_ALREADY_REVIEWED");
      return { value: { candidateId: candidate.candidateId }, entityId: candidate.candidateId };
    });
  }

  async function verifyChannel(token: string | undefined | null, input: unknown) {
    const v = parse(verifyChannelSchema, input);
    if (!v.ok) return v;
    if (!METHODS_WITHOUT_URL.has(v.data.method) && !v.data.evidenceUrl)
      return fail("EVIDENCE_REQUIRED");
    return mutate<ChannelRecord>(token, "contact_channel", async (p) => {
      const channel = await repo.getChannel(v.data.channelId);
      if (!channel) throw new ContactError("CHANNEL_NOT_FOUND");
      if (channel.verificationStatus === "VERIFIED") throw new ContactError("ALREADY_VERIFIED");
      const contact = await repo.getContact(channel.contactId);
      if (!contact) throw new ContactError("CONTACT_NOT_FOUND");
      // Verification activity on a DNC contact would be a pretext for contacting them.
      if (contact.doNotContact) throw new ContactError("CONTACT_DNC");
      const patch = {
        verificationStatus: "VERIFIED" as const,
        verificationMethod: v.data.method,
        evidenceUrl: v.data.evidenceUrl ?? null,
        verifiedBy: p.userId,
        verifiedAt: clock.now(),
      };
      await repo.updateChannelVerification(channel.channelId, patch);
      return {
        value: { ...channel, ...patch },
        entityId: channel.channelId,
        metadata: {
          method: v.data.method,
          channel: channel.channel,
          from: channel.verificationStatus,
        },
      };
    });
  }

  async function markChannelFailed(token: string | undefined | null, input: unknown) {
    const v = parse(failChannelSchema, input);
    if (!v.ok) return v;
    return mutate<ChannelRecord>(token, "contact_channel", async (p) => {
      const channel = await repo.getChannel(v.data.channelId);
      if (!channel) throw new ContactError("CHANNEL_NOT_FOUND");
      const patch = {
        verificationStatus: "FAILED" as const,
        verificationMethod: null,
        evidenceUrl: null,
        verifiedBy: p.userId,
        verifiedAt: clock.now(),
      };
      await repo.updateChannelVerification(channel.channelId, patch);
      return {
        value: { ...channel, ...patch },
        entityId: channel.channelId,
        metadata: {
          channel: channel.channel,
          from: channel.verificationStatus,
          reason: v.data.reason,
        },
      };
    });
  }

  async function verifyContact(token: string | undefined | null, input: unknown) {
    const v = parse(contactIdSchema, input);
    if (!v.ok) return v;
    return mutate<ContactRecord>(token, "contact", async (p) => {
      const contact = await repo.getContact(v.data.contactId);
      if (!contact) throw new ContactError("CONTACT_NOT_FOUND");
      if (contact.doNotContact) throw new ContactError("CONTACT_DNC");
      if (contact.verificationStatus === "VERIFIED") throw new ContactError("ALREADY_VERIFIED");
      const channels = await repo.listChannels(contact.contactId);
      if (!channels.some((c) => c.verificationStatus === "VERIFIED"))
        throw new ContactError("NO_VERIFIED_CHANNEL");
      const patch = {
        verificationStatus: "VERIFIED" as const,
        verifiedBy: p.userId,
        verifiedAt: clock.now(),
      };
      await repo.updateContact(contact.contactId, patch);
      return {
        value: { ...contact, ...patch },
        entityId: contact.contactId,
        metadata: { from: contact.verificationStatus },
      };
    });
  }

  async function setDoNotContact(token: string | undefined | null, input: unknown) {
    const v = parse(dncSchema, input);
    if (!v.ok) return v;
    return mutate<ContactRecord>(token, "contact", async (p) => {
      const contact = await repo.getContact(v.data.contactId);
      if (!contact) throw new ContactError("CONTACT_NOT_FOUND");
      if (contact.doNotContact) throw new ContactError("ALREADY_DNC");
      const patch = {
        doNotContact: true,
        dncReason: v.data.reason,
        dncSetBy: p.userId,
        dncSetAt: clock.now(),
      };
      await repo.updateContact(contact.contactId, patch);
      return {
        value: { ...contact, ...patch },
        entityId: contact.contactId,
        metadata: { doNotContact: true },
      };
    });
  }

  /** Reverses a partner's opt-out: CRM Lead gate override with a recorded reason only. */
  async function clearDoNotContact(token: string | undefined | null, input: unknown) {
    const v = parse(clearDncSchema, input);
    if (!v.ok) return v;
    return settle<ContactRecord>(async () => {
      const r = await audit.overrideGate(
        token,
        {
          gate: "do_not_contact",
          entityType: "contact",
          entityId: v.data.contactId,
          reason: v.data.reason,
        },
        async () => {
          const contact = await repo.getContact(v.data.contactId);
          if (!contact) throw new ContactError("CONTACT_NOT_FOUND");
          if (!contact.doNotContact) throw new ContactError("NOT_DNC");
          const patch = { doNotContact: false, dncReason: null, dncSetBy: null, dncSetAt: null };
          await repo.updateContact(contact.contactId, patch);
          return { ...contact, ...patch };
        },
      );
      return unwrap<ContactRecord>(r);
    });
  }

  async function checkReadiness(token: string | undefined | null, input: unknown) {
    const v = parse(readinessSchema, input);
    if (!v.ok) return v;
    return settle<Readiness>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "contact.read", {}, async () =>
          assessReadiness({
            contact: await repo.getContact(v.data.contactId),
            channel: await repo.getChannel(v.data.channelId),
            intendedChannel: v.data.intendedChannel,
            partnerId: v.data.partnerId,
          }),
        ),
      ),
    );
  }

  return {
    addManualCandidate,
    lookupContacts,
    acceptCandidate,
    rejectCandidate,
    verifyChannel,
    markChannelFailed,
    verifyContact,
    setDoNotContact,
    clearDoNotContact,
    checkReadiness,
  };
}

export type ContactService = ReturnType<typeof createContactService>;
