import { migration0001 } from "./0001_core_domain";
import { migration0002 } from "./0002_sales_close_deal";
import { migration0003 } from "./0003_implementation_revenue_merch";
import { migration0004 } from "./0004_audit_log";
import { migration0005 } from "./0005_user_sessions";
import { migration0006 } from "./0006_research_jobs";
import { migration0007 } from "./0007_contact_verification";
import type { Migration } from "./types";

/**
 * Ordered migration list. Schema-lock: only one schema-changing PR may be in flight; new
 * migrations are APPENDED with the next version. Never edit or reorder an applied entry.
 */
export const MIGRATIONS: readonly Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
  migration0007,
];

export type { Migration } from "./types";
