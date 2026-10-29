/**
 * Audit service (FR-100): the single place that turns an authorized operation into an
 * append-only audit record.
 *
 * Guarantees:
 * 1. Authorization is enforced by the M0-05 guard (`runAuthorized`); this module does not
 *    duplicate policy. Handlers run only for authorized principals.
 * 2. Audit metadata is validated inside the same transaction as the mutation. Unsafe metadata
 *    (PII, secrets, bodies) therefore rolls the mutation back instead of reaching the log.
 * 3. The handler's domain writes and the audit append run inside one `AuditedTransaction`.
 *    If the audit append fails, the transaction fails and the mutation is not committed.
 * 4. Gate overrides require `gate.override` (CRM Lead) and a reason; the named lead is
 *    recorded as `authorizedByUserId`.
 * 5. Denials of authenticated actors are recorded as ACCESS_DENIED via the guard's
 *    `onDecision` hook (anonymous failures are not stored, to avoid unauthenticated log
 *    flooding; they belong in rate-limited operational logs).
 * 6. Audit reads require `audit.read`. There is no update or delete operation anywhere.
 */

import type { Action } from "../auth/actions";
import { isAction } from "../auth/actions";
import {
  type DecisionEvent,
  type GuardDeps,
  type GuardedResult,
  runAuthorized,
} from "../auth/guard";
import type { AuthorizationContext } from "../auth/policy";
import { type Clock, type Principal, systemClock } from "../auth/types";
import { assertSafeText, validateAuditMetadata } from "./metadata";
import type { AuditEvent, AuditedTransaction, AuditKind, AuditQuery, AuditReader } from "./types";

export interface AuditServiceDeps {
  guard: Pick<GuardDeps, "sessions">;
  transaction: AuditedTransaction;
  reader: AuditReader;
  /** Used for denial recording, which happens outside a domain transaction. */
  denialWriter: { append(event: AuditEvent): Promise<AuditEvent> };
  clock?: Clock;
  newId?: () => string;
}

export interface AuditedOutcome<T> {
  value: T;
  entityId: string;
  /** Minimized metadata (see metadata.ts). Prefer `changedFieldNames` over values. */
  metadata?: Record<string, unknown>;
}

export interface AuditedOperation {
  action: Action;
  kind: Exclude<AuditKind, "ACCESS_DENIED" | "GATE_OVERRIDE">;
  entityType: string;
  context?: AuthorizationContext;
}

const MIN_REASON = 10;
const MAX_REASON = 500;

export class AuditWriteError extends Error {
  constructor(cause?: unknown) {
    super("audit write failed; operation was not committed");
    this.name = "AuditWriteError";
    this.cause = cause;
  }
}

export function createAuditService(deps: AuditServiceDeps) {
  const clock = deps.clock ?? systemClock;
  const newId = deps.newId ?? (() => crypto.randomUUID());

  function buildEvent(
    principal: Principal,
    base: Pick<AuditEvent, "kind" | "action" | "entityType" | "entityId">,
    metadata: unknown,
    extra: Pick<AuditEvent, "reason" | "authorizedByUserId"> = {},
  ): AuditEvent {
    return {
      eventId: newId(),
      occurredAt: clock.now(),
      actorUserId: principal.userId,
      ...base,
      metadata: validateAuditMetadata(metadata ?? {}),
      ...extra,
    };
  }

  /**
   * Execute `handler` for an authorized caller and append one audit event atomically with it.
   */
  async function audited<T>(
    sessionToken: string | undefined | null,
    operation: AuditedOperation,
    handler: (principal: Principal) => Promise<AuditedOutcome<T>> | AuditedOutcome<T>,
  ): Promise<GuardedResult<T>> {
    return runAuthorized(
      { sessions: deps.guard.sessions, onDecision: recordDenial },
      sessionToken,
      operation.action,
      operation.context ?? {},
      async (principal) => {
        // If anything below throws, the transaction implementation rolls the mutation back.
        return deps.transaction(async (audit) => {
          const outcome = await handler(principal);
          const event = buildEvent(
            principal,
            {
              kind: operation.kind,
              action: operation.action,
              entityType: operation.entityType,
              entityId: outcome.entityId,
            },
            outcome.metadata,
          );
          try {
            await audit.append(event);
          } catch (error) {
            throw new AuditWriteError(error);
          }
          return outcome.value;
        });
      },
    );
  }

  /**
   * Gate override (PRD §15, SECURITY_PRIVACY #12): requires `gate.override` and a reason.
   * The reason is validated before the handler runs; a missing reason never performs the work.
   */
  async function overrideGate<T>(
    sessionToken: string | undefined | null,
    override: { gate: string; entityType: string; reason: string; entityId: string },
    handler: (principal: Principal) => Promise<T> | T,
    context: AuthorizationContext = {},
  ): Promise<GuardedResult<T> | { ok: false; code: "REASON_REQUIRED"; httpStatus: 400 }> {
    const reason = typeof override.reason === "string" ? override.reason.trim() : "";
    // Authorization first, so unauthorized callers learn nothing about validation rules.
    return runAuthorized(
      { sessions: deps.guard.sessions, onDecision: recordDenial },
      sessionToken,
      "gate.override",
      context,
      async (principal) => {
        if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
          return { reasonRejected: true } as const;
        }
        assertSafeText("reason", reason);
        const event = buildEvent(
          principal,
          {
            kind: "GATE_OVERRIDE",
            action: "gate.override",
            entityType: override.entityType,
            entityId: override.entityId,
          },
          { gate: override.gate },
          { reason, authorizedByUserId: principal.userId },
        );
        return deps.transaction(async (audit) => {
          const value = await handler(principal);
          try {
            await audit.append(event);
          } catch (error) {
            throw new AuditWriteError(error);
          }
          return { reasonRejected: false, value } as const;
        });
      },
    ).then((result) => {
      if (!result.ok) return result;
      if (result.value.reasonRejected) {
        return { ok: false as const, code: "REASON_REQUIRED" as const, httpStatus: 400 as const };
      }
      return { ok: true as const, value: result.value.value, principal: result.principal };
    });
  }

  async function listEvents(sessionToken: string | undefined | null, query: AuditQuery) {
    return runAuthorized(
      { sessions: deps.guard.sessions, onDecision: recordDenial },
      sessionToken,
      "audit.read",
      {},
      () => deps.reader.list(query),
    );
  }

  /** Guard hook: persist denials for authenticated actors only. */
  async function recordDenial(event: DecisionEvent): Promise<void> {
    if (event.outcome !== "DENIED" || !event.actorUserId) return;
    const attempted = isAction(event.action) ? event.action : "unknown";
    try {
      await deps.denialWriter.append({
        eventId: newId(),
        occurredAt: clock.now(),
        kind: "ACCESS_DENIED",
        actorUserId: event.actorUserId,
        action: attempted,
        entityType: "authorization",
        entityId: attempted,
        metadata: validateAuditMetadata({ denialCode: event.denialCode ?? "UNKNOWN" }),
      });
    } catch {
      // Denial logging is best-effort: it must never turn a denial into an allow or crash.
    }
  }

  return { audited, overrideGate, listEvents, recordDenial };
}

export type AuditService = ReturnType<typeof createAuditService>;
