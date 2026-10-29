/**
 * Append-only audit domain (FR-100; PRD §15; SECURITY_PRIVACY #7, #12).
 *
 * The ports below are the ONLY audit surface. `AuditWriter` can append; `AuditReader` can
 * list. Neither exposes update or delete, so application code has no way to express them.
 * The database layer (M1-01) must additionally enforce immutability with a trigger/grants;
 * this module is the application-policy half of that defence.
 */

export const AUDIT_KINDS = [
  "MUTATION",
  "APPROVAL",
  "EXPORT",
  "GATE_OVERRIDE",
  "ACCESS_DENIED",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** Flat, minimized metadata. Nested objects are not allowed so records cannot be dumped in. */
export type AuditMetadataValue = string | number | boolean | null | readonly string[];
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

export interface AuditEvent {
  readonly eventId: string;
  /** UTC instant. Display conversion to Asia/Jakarta happens in the UI layer. */
  readonly occurredAt: Date;
  readonly kind: AuditKind;
  readonly actorUserId: string;
  /** Authorization action name that governed the operation (e.g. `partner.write`). */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: AuditMetadata;
  /** Present (and mandatory) for GATE_OVERRIDE. */
  readonly reason?: string | undefined;
  /** The named authorized lead for a GATE_OVERRIDE; equals `actorUserId`. */
  readonly authorizedByUserId?: string | undefined;
}

export type NewAuditEvent = Omit<AuditEvent, "eventId" | "occurredAt">;

export interface AuditQuery {
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  kind?: AuditKind;
  from?: Date;
  to?: Date;
  /** Default 100, hard cap 500. */
  limit?: number;
}

export interface AuditWriter {
  /** Appends exactly one event and returns the stored (immutable) copy. */
  append(event: AuditEvent): Promise<AuditEvent>;
}

export interface AuditReader {
  list(query: AuditQuery): Promise<AuditEvent[]>;
}

export type AuditStore = AuditWriter & AuditReader;

/**
 * Runs `work` in a single transactional unit. The DB implementation must commit the
 * domain writes and the audit append together or roll both back. `audit` writes inside the
 * same unit. This is what guarantees "no material mutation without an audit record".
 */
export type AuditedTransaction = <T>(work: (audit: AuditWriter) => Promise<T>) => Promise<T>;
