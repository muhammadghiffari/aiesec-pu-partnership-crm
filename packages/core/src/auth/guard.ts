/**
 * Single choke point for protected operations (FR-100).
 *
 * `runAuthorized` authenticates the session, authorizes the action, and only then invokes
 * the handler. Routes, server actions, jobs and companion endpoints call this instead of
 * re-implementing checks. The handler receives the server-derived principal; nothing the
 * client sends (role, email, user id) is trusted.
 *
 * `onDecision` is the extension point for the audit service (M0-06) to record denials and
 * allowed decisions without this module owning a second logging system. It must not receive
 * request payloads; only the data below.
 */

import { type AuthorizationContext, authorize } from "./policy";
import type { SessionService } from "./session";
import type { Denial, Principal } from "./types";

export interface DecisionEvent {
  action: string;
  outcome: "ALLOWED" | "DENIED";
  /** Present when the caller was authenticated. */
  actorUserId?: string | undefined;
  denialCode?: Denial["code"] | undefined;
}

export interface GuardDeps {
  sessions: Pick<SessionService, "authenticate">;
  onDecision?: ((event: DecisionEvent) => void | Promise<void>) | undefined;
}

export type GuardedResult<T> = { ok: true; value: T; principal: Principal } | Denial;

export async function runAuthorized<T>(
  deps: GuardDeps,
  sessionToken: string | undefined | null,
  action: string,
  context: AuthorizationContext,
  handler: (principal: Principal) => Promise<T> | T,
): Promise<GuardedResult<T>> {
  const authentication = await deps.sessions.authenticate(sessionToken);
  if (!authentication.ok) {
    await deps.onDecision?.({ action, outcome: "DENIED", denialCode: authentication.code });
    return authentication;
  }

  const { principal } = authentication;
  const decision = authorize(principal, action, context);
  if (!decision.ok) {
    await deps.onDecision?.({
      action,
      outcome: "DENIED",
      actorUserId: principal.userId,
      denialCode: decision.code,
    });
    return decision;
  }

  await deps.onDecision?.({ action, outcome: "ALLOWED", actorUserId: principal.userId });
  // The handler is only reached after both checks passed.
  const value = await handler(principal);
  return { ok: true, value, principal };
}
