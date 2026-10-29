/**
 * @crm/core — domain core.
 *
 * Lifecycle state machine, RBAC policy, gates (market research, outreach approval,
 * SnD, LoA separation of duties, report gate) and deterministic money calculations
 * live here. Nothing in this package may import UI, DB, AI or worker code.
 *
 * Implemented in later issues: M1-02 (seeds), M1-04 (lifecycle), M2-04 (linter/hash),
 * M3-02 (pricing snapshots), M4-03..05. This file only proves the workspace boundary.
 */

export const CORE_PACKAGE_NAME = "@crm/core" as const;

export * from "./audit/index";
export * from "./auth/index";
export * from "./contacts/index";
export * from "./lifecycle/index";
export * from "./outreach/index";
export * from "./ratecard/index";
export * from "./research/index";
