/**
 * @crm/worker — bounded batch processing for research/draft jobs.
 *
 * INVARIANT (D-010 / FR-950): the worker never sends partner communications and
 * never holds outbound messaging credentials or send-capable tools. All AI output
 * it produces is schema-validated draft data written as job/result records.
 *
 * Real job implementations arrive in M2-01 (criteria/research jobs) and M4-03
 * (report reminders). This placeholder only marks the boundary.
 */

export const WORKER_PACKAGE_NAME = "@crm/worker" as const;
