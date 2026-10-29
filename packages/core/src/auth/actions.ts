/**
 * Central catalog of authorizable actions (FR-100).
 *
 * Every route, server action, job and companion endpoint must authorize one of these
 * actions through `authorize()` / `runAuthorized()`. `mutates` drives invariant tests
 * (for example: VIEWER must never hold a mutating action).
 *
 * Adding an action here without deciding its role mapping in `policy.ts` fails the
 * exhaustive policy test, so new capabilities cannot silently default to "allowed".
 */

export const ACTION_CATALOG = {
  // Partner master, contacts and cycles
  "partner.read": { mutates: false },
  "partner.write": { mutates: true },
  "contact.read": { mutates: false },
  "contact.write": { mutates: true },
  "cycle.read": { mutates: false },
  "cycle.write": { mutates: true },
  // Prospecting / research / outreach (humans own scores, approvals and sends)
  "research.work": { mutates: true },
  "outreach.draft": { mutates: true },
  "outreach.approve": { mutates: true },
  "outreach.record_send": { mutates: true },
  // Sales process, close deal
  "meeting.write": { mutates: true },
  "mom.finalize": { mutates: true },
  "snd.confirm": { mutates: true },
  "proposal.write": { mutates: true },
  "loa.submit": { mutates: true },
  "loa.approve": { mutates: true },
  // Implementation, revenue, engagement, survey, re-raise, merchandise
  "implementation.write": { mutates: true },
  "revenue.record": { mutates: true },
  "engagement.write": { mutates: true },
  "survey.write": { mutates: true },
  "reraise.decide": { mutates: true },
  "merchandise.write": { mutates: true },
  // Rate card
  "ratecard.read": { mutates: false },
  "ratecard.edit": { mutates: true },
  "package.edit": { mutates: true },
  // Restricted internal notes (negotiation limit / BATNA / risk flags)
  "internal_notes.read": { mutates: false },
  // Dashboards, reports, import/export
  "dashboard.view_own": { mutates: false },
  "dashboard.view_all": { mutates: false },
  "report.view": { mutates: false },
  "export.run": { mutates: false },
  "import.run": { mutates: true },
  // Administration and governance
  "config.manage": { mutates: true },
  "taxonomy.configure": { mutates: true },
  "user.manage": { mutates: true },
  "quota.manage": { mutates: true },
  "ai.control": { mutates: true },
  "gate.override": { mutates: true },
  "audit.read": { mutates: false },
} as const satisfies Record<string, { mutates: boolean }>;

export type Action = keyof typeof ACTION_CATALOG;

export const ALL_ACTIONS = Object.keys(ACTION_CATALOG) as Action[];

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && Object.hasOwn(ACTION_CATALOG, value);
}

export function isMutatingAction(action: Action): boolean {
  return ACTION_CATALOG[action].mutates;
}
