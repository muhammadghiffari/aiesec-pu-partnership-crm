/**
 * In-memory append-only audit store for tests and local development. It is the reference
 * behaviour the PostgreSQL repository (M1-01) must match: append only, no update/delete
 * methods, unique event ids, defensive copies on both write and read.
 */

import type { AuditEvent, AuditQuery, AuditStore } from "./types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function freezeEvent(event: AuditEvent): AuditEvent {
  return Object.freeze({
    ...event,
    occurredAt: new Date(event.occurredAt),
    metadata: Object.freeze({
      ...Object.fromEntries(
        Object.entries(event.metadata).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
      ),
    }),
  });
}

export class DuplicateAuditEventError extends Error {
  constructor() {
    super("audit event id already exists; audit records are immutable");
    this.name = "DuplicateAuditEventError";
  }
}

export function createInMemoryAuditStore(): AuditStore & { readonly size: number } {
  const events: AuditEvent[] = [];
  const ids = new Set<string>();

  return {
    get size() {
      return events.length;
    },
    async append(event) {
      if (ids.has(event.eventId)) throw new DuplicateAuditEventError();
      const stored = freezeEvent(event);
      ids.add(stored.eventId);
      events.push(stored);
      return freezeEvent(stored);
    },
    async list(query: AuditQuery) {
      const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
      return events
        .filter(
          (e) =>
            (query.actorUserId === undefined || e.actorUserId === query.actorUserId) &&
            (query.entityType === undefined || e.entityType === query.entityType) &&
            (query.entityId === undefined || e.entityId === query.entityId) &&
            (query.action === undefined || e.action === query.action) &&
            (query.kind === undefined || e.kind === query.kind) &&
            (query.from === undefined || e.occurredAt >= query.from) &&
            (query.to === undefined || e.occurredAt <= query.to),
        )
        .slice(-limit)
        .map(freezeEvent);
    },
  };
}
