/** FR-100: append-only audit implementation over migration 0004. One connection per transaction. */
import type {
  AuditEvent,
  AuditedTransaction,
  AuditReader,
  AuditWriter,
} from "../../core/src/audit/types";
import type { SqlClient } from "./migrate";

export function createAuditSqlStore(db: SqlClient): {
  writer: AuditWriter;
  reader: AuditReader;
  transaction: AuditedTransaction;
} {
  const writer: AuditWriter = {
    async append(event) {
      await db.query(
        `INSERT INTO audit_log (audit_id, occurred_at, kind, actor_user_id, action, entity_type, entity_id, metadata, reason, authorized_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [
          event.eventId,
          event.occurredAt,
          event.kind,
          event.actorUserId,
          event.action,
          event.entityType,
          event.entityId,
          JSON.stringify(event.metadata),
          event.reason ?? null,
          event.authorizedByUserId ?? null,
        ],
      );
      return event;
    },
  };
  const reader: AuditReader = {
    async list(query) {
      const filters: string[] = [];
      const values: unknown[] = [];
      const keys = {
        actorUserId: "actor_user_id",
        entityType: "entity_type",
        entityId: "entity_id",
        action: "action",
        kind: "kind",
        from: "occurred_at",
        to: "occurred_at",
      } as const;
      for (const [key, column] of Object.entries(keys)) {
        const value = query[key as keyof typeof keys];
        if (value === undefined) continue;
        values.push(value);
        filters.push(
          `${column} ${key === "from" ? ">=" : key === "to" ? "<=" : "="} $${values.length}`,
        );
      }
      values.push(Math.max(1, Math.min(query.limit ?? 100, 500)));
      const result = await db.query<Record<string, unknown>>(
        `SELECT * FROM audit_log ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY occurred_at DESC LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(
        (row): AuditEvent => ({
          eventId: String(row.audit_id),
          occurredAt: new Date(String(row.occurred_at)),
          kind: row.kind as AuditEvent["kind"],
          actorUserId: String(row.actor_user_id),
          action: String(row.action),
          entityType: String(row.entity_type),
          entityId: String(row.entity_id),
          metadata: row.metadata as AuditEvent["metadata"],
          ...(row.reason ? { reason: String(row.reason) } : {}),
          ...(row.authorized_by_user_id
            ? { authorizedByUserId: String(row.authorized_by_user_id) }
            : {}),
        }),
      );
    },
  };
  const transaction: AuditedTransaction = async (work) => {
    await db.exec("BEGIN");
    try {
      const value = await work(writer);
      await db.exec("COMMIT");
      return value;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  };
  return { writer, reader, transaction };
}
