import type { Migration } from "./types";

/**
 * Class Diagram class: AuditLog. Persistence half of the M0-06 contract.
 *
 * Immutability is enforced in the database (row UPDATE/DELETE and TRUNCATE all raise), so it
 * holds even for code paths that bypass @crm/core. Production must additionally REVOKE
 * UPDATE, DELETE and TRUNCATE on this table from the application role (docs/RUNBOOK.md); a
 * superuser or table owner can still drop triggers, which is why role separation is required.
 *
 * Q-13 diagram/schema reconciliation: entity_id is text because M0-06 events may reference
 * non-row targets (for example the denied authorization action name). The Class Diagram uses
 * text as well; retain this physical type unless audit-target semantics change.
 */
export const migration0004: Migration = {
  version: 4,
  name: "audit_log",
  up: `
CREATE TABLE audit_log (
  audit_id              uuid PRIMARY KEY,
  occurred_at           timestamptz NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('MUTATION','APPROVAL','EXPORT','GATE_OVERRIDE','ACCESS_DENIED')),
  actor_user_id         uuid NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  action                text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_type           text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id             text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  metadata              jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  reason                text,
  authorized_by_user_id uuid REFERENCES users (user_id) ON DELETE RESTRICT,
  -- Gate waivers need a reason and the named lead who authorised them (SECURITY_PRIVACY #12).
  CONSTRAINT audit_override_requires_reason CHECK (
    kind <> 'GATE_OVERRIDE'
    OR (length(btrim(coalesce(reason, ''))) >= 10 AND authorized_by_user_id = actor_user_id)
  )
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at);
CREATE INDEX audit_log_time_idx ON audit_log (occurred_at);

CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_log_no_row_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
`,
  down: `
DROP TABLE audit_log;
DROP FUNCTION audit_log_immutable();
`,
};
