/**
 * Outreach draft, lint, approval and send-confirmation service (M2-04, FR-400..403).
 *
 * Gate summary (PRD §6, ARCHITECTURE invariant 6, D-010):
 *  - A draft may exist for an unverified recipient; it can NEVER be approved or sent until the
 *    shared readiness rule (M2-02) passes: contact + exact channel verified, matching type and
 *    partner, not do-not-contact.
 *  - Approval requires zero lint ERRORs and binds actor, time, lint version and a SHA-256 over
 *    message id, cycle, contact, channel row, channel type, canonical address, subject and body.
 *  - `reviewedHash` must equal the hash of the current content: approving a version the human
 *    did not see (stale screen, edit in between) is refused.
 *  - Any edit of subject, body or channel on an APPROVED message returns it to DRAFT and clears
 *    the approval, in the same transaction. SENT/REPLIED messages are immutable.
 *  - Confirming a send re-derives the hash from the CURRENT message, channel and contact and
 *    compares it in constant time; a mismatch or a newly set DNC blocks it.
 *  - This module never sends anything. `confirmSent` records that a HUMAN sent the approved
 *    text through the approved sender profile (manual-only channels included).
 *
 * Every mutation is Zod-validated, authorized through the M0-05 guard and audited through
 * M0-06. Audit metadata never contains message text, subjects, names or addresses.
 */

import { z } from "zod";
import type { AuditService } from "../audit/service";
import { type GuardDeps, runAuthorized } from "../auth/guard";
import { type Clock, type Principal, systemClock } from "../auth/types";
import { assessReadiness, type ReadinessBlocker } from "../contacts/readiness";
import type { ContactRepository } from "../contacts/types";
import { type ApprovalPayload, approvalHash, sameHash } from "./hash";
import { type LintFinding, lintOutreach } from "./lint";
import type { MessagePatch, OutreachMessage, OutreachRepository } from "./types";

export const OUTREACH_ERROR_CODES = [
  "VALIDATION_FAILED",
  "CYCLE_NOT_FOUND",
  "MESSAGE_NOT_FOUND",
  "CONTACT_NOT_FOUND",
  "CHANNEL_NOT_FOUND",
  "CONTACT_DNC",
  "CHANNEL_MISMATCH",
  "NOT_READY",
  "LINT_FAILED",
  "STALE_CONTENT",
  "ALREADY_APPROVED",
  "NOT_APPROVED",
  "HASH_MISMATCH",
  "MESSAGE_IMMUTABLE",
  "NO_CHANGE",
  "CONCURRENT_CHANGE",
] as const;
export type OutreachErrorCode = (typeof OUTREACH_ERROR_CODES)[number];

const HTTP: Record<OutreachErrorCode, number> = {
  VALIDATION_FAILED: 400,
  CYCLE_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  CONTACT_NOT_FOUND: 404,
  CHANNEL_NOT_FOUND: 404,
  CONTACT_DNC: 409,
  CHANNEL_MISMATCH: 409,
  NOT_READY: 422,
  LINT_FAILED: 422,
  STALE_CONTENT: 409,
  ALREADY_APPROVED: 409,
  NOT_APPROVED: 409,
  HASH_MISMATCH: 409,
  MESSAGE_IMMUTABLE: 409,
  NO_CHANGE: 409,
  CONCURRENT_CHANGE: 409,
};

export class OutreachError extends Error {
  constructor(
    readonly code: OutreachErrorCode,
    readonly blockers?: readonly ReadinessBlocker[],
    readonly findings?: readonly LintFinding[],
  ) {
    super(`outreach: ${code}`);
    this.name = "OutreachError";
  }
}

export type OutreachFailure = {
  ok: false;
  code: string;
  httpStatus: number;
  blockers?: readonly ReadinessBlocker[];
  findings?: readonly LintFinding[];
};
export type OutreachResult<T> = { ok: true; value: T } | OutreachFailure;

const uuid = z.uuid();
const subject = z.string().max(150).nullable();
const body = z.string().min(1).max(6000);

export const createDraftSchema = z.strictObject({
  cycleId: uuid,
  contactId: uuid,
  channelId: uuid,
  language: z.enum(["id", "en"]),
  subject: subject.default(null),
  body,
  draftSource: z.enum(["HUMAN", "AI"]).default("HUMAN"),
  aiTemplate: z
    .string()
    .regex(/^[a-z][a-z0-9_.]*@[0-9]+$/)
    .nullable()
    .default(null),
});
export const editDraftSchema = z
  .strictObject({
    messageId: uuid,
    subject: subject.optional(),
    body: body.optional(),
    channelId: uuid.optional(),
  })
  .refine((v) => v.subject !== undefined || v.body !== undefined || v.channelId !== undefined);
export const messageIdSchema = z.strictObject({ messageId: uuid });
export const approveSchema = z.strictObject({
  messageId: uuid,
  /** The hash the approver reviewed (from `previewApproval`). */
  reviewedHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export interface OutreachServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  audit: AuditService;
  outreach: OutreachRepository;
  contacts: Pick<ContactRepository, "getContact" | "getChannel">;
  clock?: Clock;
  newId?: () => string;
}

export interface ApprovalPreview {
  messageId: string;
  status: OutreachMessage["status"];
  /** Hash of the content as it is right now; pass it back as `reviewedHash` to approve. */
  contentHash: string;
  lint: { version: number; passed: boolean; findings: LintFinding[] };
  readiness: { ready: boolean; blockers: ReadinessBlocker[]; manualSendOnly: boolean };
}

export function createOutreachService(deps: OutreachServiceDeps) {
  const { outreach: repo, audit } = deps;
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const guardDeps: GuardDeps = {
    sessions: deps.guard.sessions,
    onDecision: (e) => audit.recordDenial(e),
  };

  const fail = (
    code: OutreachErrorCode,
    extra: Partial<OutreachFailure> = {},
  ): OutreachFailure => ({
    ok: false,
    code,
    httpStatus: HTTP[code],
    ...extra,
  });
  const unwrap = <T>(
    r: { ok: true; value: unknown } | { ok: false; code: string; httpStatus: number },
  ): OutreachResult<T> => (r.ok ? { ok: true, value: r.value as T } : (r as OutreachFailure));
  async function settle<T>(run: () => Promise<OutreachResult<T>>): Promise<OutreachResult<T>> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OutreachError) {
        return fail(error.code, {
          ...(error.blockers ? { blockers: error.blockers } : {}),
          ...(error.findings ? { findings: error.findings } : {}),
        });
      }
      throw error;
    }
  }
  function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | OutreachFailure {
    const r = schema.safeParse(input);
    return r.success ? { ok: true, data: r.data } : fail("VALIDATION_FAILED");
  }
  const mutate = <T>(
    token: string | undefined | null,
    action: "outreach.draft" | "outreach.approve" | "outreach.record_send",
    body_: (
      p: Principal,
    ) => Promise<{ value: T; entityId: string; metadata?: Record<string, unknown> }>,
  ) =>
    settle<T>(async () =>
      unwrap(
        await audit.audited(
          token,
          {
            action,
            kind: action === "outreach.approve" ? "APPROVAL" : "MUTATION",
            entityType: "outreach_message",
          },
          body_,
        ),
      ),
    );

  /** Loads everything the gate needs from storage, fresh. */
  async function context(message: OutreachMessage) {
    const [partnerId, contact, channel] = await Promise.all([
      repo.getCyclePartnerId(message.cycleId),
      deps.contacts.getContact(message.contactId),
      deps.contacts.getChannel(message.channelId),
    ]);
    if (!partnerId) throw new OutreachError("CYCLE_NOT_FOUND");
    const readiness = assessReadiness({
      contact,
      channel,
      intendedChannel: message.channel,
      partnerId,
    });
    const payload: ApprovalPayload | null = channel
      ? {
          messageId: message.messageId,
          cycleId: message.cycleId,
          contactId: message.contactId,
          channelId: message.channelId,
          channel: message.channel,
          address: channel.address,
          subject: message.subject,
          body: message.body,
        }
      : null;
    return { readiness, payload, contact, channel };
  }

  async function currentHash(
    message: OutreachMessage,
  ): Promise<{ hash: string | null; ctx: Awaited<ReturnType<typeof context>> }> {
    const ctx = await context(message);
    return { hash: ctx.payload ? await approvalHash(ctx.payload) : null, ctx };
  }

  // ---------------------------------------------------------------------------------------------

  async function createDraft(token: string | undefined | null, input: unknown) {
    const v = parse(createDraftSchema, input);
    if (!v.ok) return v;
    const d = v.data;
    if ((d.draftSource === "AI") !== (d.aiTemplate !== null)) return fail("VALIDATION_FAILED");
    return mutate<OutreachMessage>(token, "outreach.draft", async () => {
      const partnerId = await repo.getCyclePartnerId(d.cycleId);
      if (!partnerId) throw new OutreachError("CYCLE_NOT_FOUND");
      const contact = await deps.contacts.getContact(d.contactId);
      if (!contact || contact.partnerId !== partnerId) throw new OutreachError("CONTACT_NOT_FOUND");
      // PRD: DNC blocks drafting, not just sending.
      if (contact.doNotContact) throw new OutreachError("CONTACT_DNC");
      const channel = await deps.contacts.getChannel(d.channelId);
      if (!channel || channel.contactId !== contact.contactId)
        throw new OutreachError("CHANNEL_NOT_FOUND");
      // Phone is not a written-message channel.
      if (channel.channel === "PHONE") throw new OutreachError("CHANNEL_MISMATCH");
      const message: OutreachMessage = {
        messageId: newId(),
        cycleId: d.cycleId,
        contactId: contact.contactId,
        channelId: channel.channelId,
        channel: channel.channel,
        subject: d.subject,
        body: d.body,
        language: d.language,
        status: "DRAFT",
        followUpAttempt: 0,
        draftSource: d.draftSource,
        aiTemplate: d.aiTemplate,
        approvedBy: null,
        approvedAt: null,
        approvedContentHash: null,
        approvedLintVersion: null,
        sentAt: null,
      };
      await repo.insertMessage(message);
      return {
        value: message,
        entityId: message.messageId,
        metadata: {
          channel: message.channel,
          language: message.language,
          draftSource: message.draftSource,
          aiTemplate: message.aiTemplate,
        },
      };
    });
  }

  async function editDraft(token: string | undefined | null, input: unknown) {
    const v = parse(editDraftSchema, input);
    if (!v.ok) return v;
    const e = v.data;
    return mutate<OutreachMessage>(token, "outreach.draft", async () => {
      const message = await repo.getMessage(e.messageId);
      if (!message) throw new OutreachError("MESSAGE_NOT_FOUND");
      if (
        message.status === "SENT" ||
        message.status === "REPLIED" ||
        message.status === "CANCELLED"
      ) {
        throw new OutreachError("MESSAGE_IMMUTABLE");
      }
      const patch: MessagePatch = {};
      const changed: string[] = [];
      if (e.subject !== undefined && e.subject !== message.subject) {
        patch.subject = e.subject;
        changed.push("subject");
      }
      if (e.body !== undefined && e.body !== message.body) {
        patch.body = e.body;
        changed.push("body");
      }
      if (e.channelId !== undefined && e.channelId !== message.channelId) {
        // A different channel row of the SAME contact only; another recipient is a new message.
        const channel = await deps.contacts.getChannel(e.channelId);
        if (!channel || channel.contactId !== message.contactId)
          throw new OutreachError("CHANNEL_NOT_FOUND");
        if (channel.channel === "PHONE") throw new OutreachError("CHANNEL_MISMATCH");
        patch.channelId = channel.channelId;
        patch.channel = channel.channel;
        changed.push("channel");
      }
      if (changed.length === 0) throw new OutreachError("NO_CHANGE");

      const contact = await deps.contacts.getContact(message.contactId);
      if (contact?.doNotContact) throw new OutreachError("CONTACT_DNC");

      // Any change after approval invalidates it, atomically with the edit.
      const invalidated = message.status === "APPROVED";
      if (invalidated) {
        patch.status = "DRAFT";
        patch.approvedBy = null;
        patch.approvedAt = null;
        patch.approvedContentHash = null;
        patch.approvedLintVersion = null;
      }
      if (!(await repo.updateMessage(message.messageId, message.status, patch))) {
        throw new OutreachError("CONCURRENT_CHANGE");
      }
      return {
        value: (await repo.getMessage(message.messageId)) as OutreachMessage,
        entityId: message.messageId,
        metadata: { changedFields: changed, approvalInvalidated: invalidated },
      };
    });
  }

  /** What an approver must see and echo back: current hash, lint report, readiness. */
  async function previewApproval(token: string | undefined | null, input: unknown) {
    const v = parse(messageIdSchema, input);
    if (!v.ok) return v;
    return settle<ApprovalPreview>(async () =>
      unwrap(
        await runAuthorized(guardDeps, token, "outreach.approve", {}, async () => {
          const message = await repo.getMessage(v.data.messageId);
          if (!message) throw new OutreachError("MESSAGE_NOT_FOUND");
          const { hash, ctx } = await currentHash(message);
          const lint = lintOutreach({
            channel: message.channel,
            language: message.language,
            subject: message.subject,
            body: message.body,
          });
          return {
            messageId: message.messageId,
            status: message.status,
            contentHash: hash ?? "",
            lint: { version: lint.version, passed: lint.passed, findings: lint.findings },
            readiness: ctx.readiness.ready
              ? { ready: true, blockers: [], manualSendOnly: ctx.readiness.manualSendOnly }
              : { ready: false, blockers: ctx.readiness.blockers, manualSendOnly: false },
          };
        }),
      ),
    );
  }

  async function approve(token: string | undefined | null, input: unknown) {
    const v = parse(approveSchema, input);
    if (!v.ok) return v;
    return mutate<OutreachMessage>(token, "outreach.approve", async (principal) => {
      const message = await repo.getMessage(v.data.messageId);
      if (!message) throw new OutreachError("MESSAGE_NOT_FOUND");
      if (message.status === "APPROVED") throw new OutreachError("ALREADY_APPROVED");
      if (message.status !== "DRAFT") throw new OutreachError("MESSAGE_IMMUTABLE");

      const { hash, ctx } = await currentHash(message);
      // DNC first and always: it is reported even when other blockers exist.
      if (!ctx.readiness.ready) throw new OutreachError("NOT_READY", ctx.readiness.blockers);
      if (!hash) throw new OutreachError("CHANNEL_NOT_FOUND");

      const lint = lintOutreach({
        channel: message.channel,
        language: message.language,
        subject: message.subject,
        body: message.body,
      });
      if (!lint.passed)
        throw new OutreachError(
          "LINT_FAILED",
          undefined,
          lint.findings.filter((f) => f.severity === "ERROR"),
        );

      // The human must have reviewed THIS version.
      if (!sameHash(v.data.reviewedHash, hash)) throw new OutreachError("STALE_CONTENT");

      const now = clock.now();
      const patch: MessagePatch = {
        status: "APPROVED",
        approvedBy: principal.userId,
        approvedAt: now,
        approvedContentHash: hash,
        approvedLintVersion: lint.version,
      };
      if (!(await repo.updateMessage(message.messageId, "DRAFT", patch)))
        throw new OutreachError("CONCURRENT_CHANGE");
      return {
        value: (await repo.getMessage(message.messageId)) as OutreachMessage,
        entityId: message.messageId,
        metadata: {
          approvedContentHash: hash,
          lintVersion: lint.version,
          lintWarnings: lint.findings.length,
          channel: message.channel,
          draftSource: message.draftSource,
        },
      };
    });
  }

  /**
   * A human confirms they sent the approved text. Recomputes the hash from the current
   * message, channel and contact; any drift, DNC or lost verification blocks it.
   */
  async function confirmSent(token: string | undefined | null, input: unknown) {
    const v = parse(messageIdSchema, input);
    if (!v.ok) return v;
    return mutate<OutreachMessage>(token, "outreach.record_send", async () => {
      const message = await repo.getMessage(v.data.messageId);
      if (!message) throw new OutreachError("MESSAGE_NOT_FOUND");
      if (message.status !== "APPROVED" || !message.approvedContentHash)
        throw new OutreachError("NOT_APPROVED");

      const { hash, ctx } = await currentHash(message);
      if (!ctx.readiness.ready) throw new OutreachError("NOT_READY", ctx.readiness.blockers);
      if (!hash || !sameHash(hash, message.approvedContentHash))
        throw new OutreachError("HASH_MISMATCH");

      const now = clock.now();
      if (
        !(await repo.updateMessage(message.messageId, "APPROVED", { status: "SENT", sentAt: now }))
      ) {
        throw new OutreachError("CONCURRENT_CHANGE");
      }
      return {
        value: (await repo.getMessage(message.messageId)) as OutreachMessage,
        entityId: message.messageId,
        metadata: {
          approvedContentHash: message.approvedContentHash,
          channel: message.channel,
          manualSend: true,
        },
      };
    });
  }

  return { createDraft, editDraft, previewApproval, approve, confirmSent };
}

export type OutreachService = ReturnType<typeof createOutreachService>;
