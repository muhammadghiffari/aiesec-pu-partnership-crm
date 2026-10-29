/**
 * Server-side role → action policy (FR-100, D-007, D-008, D-009; PRD §11).
 *
 * - `CRM_LEAD` is ONE permission set. TL BD and LCVP PD both map to it through
 *   `accessRole`; `organizationalTitle` is never read here.
 * - Leads hold every staff capability plus the lead-only set, so they can support staff.
 * - LoA self-approval is denied independent of role (separation of duties is absolute).
 * - Anything not explicitly granted is denied. Unknown actions are denied.
 *
 * Interim, product-owner-pending choices are recorded in docs/DECISIONS.md (Q-09..Q-11).
 */

import { type Action, ALL_ACTIONS, isAction } from "./actions";
import { type AccessRole, type Denial, deny, type Principal } from "./types";

const VIEWER_ACTIONS = [
  "partner.read",
  "cycle.read",
  "ratecard.read",
  "report.view",
] as const satisfies readonly Action[];

const STAFF_ACTIONS = [
  ...VIEWER_ACTIONS,
  "partner.write",
  "contact.read",
  "contact.write",
  "cycle.write",
  "research.work",
  "outreach.draft",
  "outreach.approve",
  "outreach.record_send",
  "meeting.write",
  "mom.finalize",
  "snd.confirm",
  "proposal.write",
  "loa.submit",
  "implementation.write",
  "revenue.record",
  "engagement.write",
  "survey.write",
  "reraise.decide",
  "merchandise.write",
  "internal_notes.read",
  "dashboard.view_own",
] as const satisfies readonly Action[];

const LEAD_ONLY_ACTIONS = [
  "loa.approve",
  "ratecard.edit",
  "package.edit",
  "dashboard.view_all",
  "export.run",
  "import.run",
  "config.manage",
  "taxonomy.configure",
  "user.manage",
  "quota.manage",
  "ai.control",
  "gate.override",
  "audit.read",
] as const satisfies readonly Action[];

export const ROLE_PERMISSIONS: Readonly<Record<AccessRole, ReadonlySet<Action>>> = {
  VIEWER: new Set<Action>(VIEWER_ACTIONS),
  BD_STAFF: new Set<Action>(STAFF_ACTIONS),
  CRM_LEAD: new Set<Action>([...STAFF_ACTIONS, ...LEAD_ONLY_ACTIONS]),
};

export interface AuthorizationContext {
  /** Required for `loa.approve`: the user who submitted the LoA under review. */
  submitterUserId?: string | undefined;
}

export type AuthorizationDecision = { ok: true } | Denial;

/**
 * Pure authorization decision. Fails closed on unknown actions, unknown roles and
 * missing context.
 */
export function authorize(
  principal: Pick<Principal, "userId" | "accessRole">,
  action: string,
  context: AuthorizationContext = {},
): AuthorizationDecision {
  if (!isAction(action)) return deny("ACTION_UNKNOWN");

  const granted = ROLE_PERMISSIONS[principal.accessRole];
  if (!granted?.has(action)) return deny("ACTION_NOT_PERMITTED");

  if (action === "loa.approve") {
    if (!context.submitterUserId) return deny("CONTEXT_REQUIRED");
    if (context.submitterUserId === principal.userId) return deny("SELF_APPROVAL_FORBIDDEN");
  }

  return { ok: true };
}

export function permissionsFor(role: AccessRole): Action[] {
  return ALL_ACTIONS.filter((action) => ROLE_PERMISSIONS[role]?.has(action));
}
