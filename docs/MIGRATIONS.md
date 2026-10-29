# Migrations, Rollback and Schema Lock

## Layout

- `packages/db/src/migrations/NNNN_name.ts`: one exported `Migration { version, name, up, down }` per file (typed, plain SQL).
- `packages/db/src/migrations/index.ts`: the ordered `MIGRATIONS` list.
- `packages/db/src/migrate.ts`: `migrateUp(client, MIGRATIONS, target?)` and `migrateDown(client, MIGRATIONS, target?)`.
- Applied versions live in `schema_migrations(version, name, checksum, applied_at)`.

There is deliberately no ORM and no second schema definition. The runner takes a small `SqlClient` (`exec`, `query`) so the production driver is chosen later (ADR 001/002) without changing migrations. It requires one session per run.

## Current migrations

| # | Name | Contents |
|---|---|---|
| 1 | `core_domain` | users, industry categories, Project Support lookup, partners, contacts, cycles, target criteria, market research, prospecting records |
| 2 | `sales_close_deal` | benefit categories, rate cards, items, packages, package benefits, outreach messages (+ guard trigger), proposals, proposal benefits, meetings, MoM, attendees, LoAs (+ guard trigger) |
| 3 | `implementation_revenue_merch` | realization projects, deliveries, revenue records, engagements, surveys, merchandise (items, bundles, bundle items, realizations), rate card assessments |
| 4 | `audit_log` | append-only `audit_log` with UPDATE/DELETE/TRUNCATE guard triggers |
| 5 | `user_sessions` | session store for M0-05 (token hash only) |
| 6 | `research_jobs` | M2-01: immutable criteria snapshots (trigger), research job queue with lease/idempotency/attempt bounds, per-user quotas, prospect candidate drafts |
| 7 | `contact_verification` | M2-02: `contact_channels` (canonical, immutable address with its own source and verification) and `contact_candidates` (provenance-required, human-reviewed) |
| 8 | `outreach_approval` | M2-04: outreach messages bound to an exact `contact_channels` row, subject/language/AI provenance, DB recomputation of the approval hash, stricter guard trigger |
| 9 | `rate_card_versions` | M3-01: version lifecycle trigger (DRAFT -> ACTIVE -> RETIRED, consecutive versions, no overlapping windows), items/packages/benefits editable only in a DRAFT, PROPOSED/CONFIRMED value status, derived assessment values forced NULL (Q-01) |
| 10 | `pricing_snapshots` | M3-02: proposal lines proven equal to a frozen catalog version, single rounding rule as a CHECK, no package/custom double counting, one catalog version and currency per proposal, total check and immutability once a proposal leaves DRAFT |

## Rules

1. **Append only.** Never edit or reorder an applied migration. The runner stores a SHA-256 of each `up` and refuses to run (`CHECKSUM_MISMATCH`) if it changed. Fix forward with a new migration.
2. **Each migration is atomic.** A failure rolls back that migration entirely and leaves earlier ones applied.
3. **Every migration has a real `down`.** Tests assert up, down and up again gives an identical schema, and that `down` leaves no tables or functions behind.
4. **`down` is destructive.** It drops tables and their data. Take a verified backup first and never run it on production without the product owner's approval (see RUNBOOK).
5. **Schema lock.** Only one schema-changing PR may be in flight. New work appends the next version on top of the previous schema PR's branch; do not renumber to resolve a conflict, rebase and renumber the newer PR.
6. **Diagram fidelity.** If the Class Diagram must change, update the diagram XML and `docs/DECISIONS.md` in the same PR and obtain product-owner approval. The conformance test fails otherwise.

## Rollback and backfill notes

- **Fresh install (no data):** `migrateDown(client, MIGRATIONS, 0)` returns the database to empty (plus `schema_migrations`).
- **Production rollback of the latest migration:** restore from the pre-deploy backup, or run `migrateDown(..., N-1)` only if the migration's data loss is acceptable. Migrations 1 to 5 are the initial schema, so there is nothing to back-fill: the database starts empty.
- **Seeds are not migrations.** Industry categories and Project Support values (M1-02) and benefit categories (M3-01) are idempotent seed data, applied after migrating. Tests create their own synthetic rows.
- **Future backfills:** a migration that adds a NOT NULL column must add it nullable, backfill in the same migration, then add the constraint, so `up` is safe on populated tables. Record the backfill and its inverse in the migration comment.
- **Import (M5-04)** writes through the repositories and the import ledger, never by editing migrations.

## Database-enforced gates (defence in depth)

The domain services in `@crm/core` remain the primary enforcement and own user-facing messages. The database additionally refuses:

- LoA approved by its submitter, or by a non-CRM-Lead / inactive user; changes to a SIGNED LoA.
- A realization project whose LoA is not SIGNED; a FINISHED project without report link and time.
- Outreach APPROVED/SENT to a do-not-contact or unverified contact; any text, channel or recipient edit on an APPROVED message (approval is cleared back to DRAFT); edits to a SENT message.
- Revenue rows that are not exactly financial or in-kind, or have no proof link; a LoA or project from another cycle.
- Merchandise sales that reference both or neither of item and bundle.
- Any UPDATE, DELETE or TRUNCATE on `audit_log`; gate overrides without a reason and named lead.

## Production hardening still required

- The application database role must have `INSERT, SELECT` only on `audit_log` (REVOKE `UPDATE, DELETE, TRUNCATE`); a table owner or superuser can still drop triggers, so migrations must run under a separate role (M6-03 / ADR 002).
- Prevent AI/worker roles from writing `market_research` (human-only scores and Proceed): grant them `prospecting_records` and job tables only.
- Implement `AuditedTransaction` (see `packages/core/src/audit`) with a real DB transaction that spans domain writes and the `audit_log` insert.

## Migration 0008 notes (M2-04)

- **Backfill:** existing `outreach_messages` rows keep `channel_id = NULL`. They remain valid drafts but cannot be approved or sent until a channel row is set; there is no automatic guess of the recipient channel.
- **Behaviour change in the guard:** APPROVED/SENT now require a VERIFIED `contact_channels` row of the same contact and channel type, an active approver who is not a VIEWER, and `approved_content_hash` equal to the hash the database recomputes. M1-01's outreach tests were updated to use real hashes and channel rows.
- **Hash parity:** `crm_outreach_approval_hash()` must stay byte-identical to `packages/core/src/outreach/hash.ts` (`APPROVAL_HASH_VERSION`). `integrity-outreach.test.ts` checks multi-byte text, null/empty subjects and field-injection strings. Changing the canonical form needs a new version and a migration that invalidates open approvals.
- **Rollback:** `down` re-installs the exact 0002 guard function (extracted from migration 0002) and drops the columns, functions and constraints; tested.


## Migration 0009 notes (M3-01)

- **Behaviour change:** rows of an ACTIVE or RETIRED rate card version, and everything under them (items, packages, package benefits), can no longer be updated or deleted, even by direct SQL. A price change is a new version. M1-01's fixture and rate card tests were updated to the real lifecycle (create DRAFT, add items, activate).
- **Backfill:** existing items become `value_status = 'PROPOSED'` (never silently confirmed). Because the migration is for an empty initial schema, no production backfill is needed.
- **Rollback:** drops the triggers, functions, index, constraints and columns added here; tested by up/down/up.
- **Q-01:** `rate_card_assessments.monetize_quality/monetize_value` are constrained to NULL. A later migration removes `rate_card_assessments_formula_unconfirmed` once the formula is confirmed against the live workbook and approved.


## Migration 0010 notes (M3-02)

- **Behaviour change:** proposals are created as DRAFT; lines may only reference ACTIVE/RETIRED catalog versions and must equal the catalog (name, unit, version, optional catalog value); the stored line total must follow the rounding rule; leaving DRAFT needs at least one line and a total equal to package price + custom lines; a sent proposal and its lines are immutable. M1-01's proposal tests were adapted (packages come from activated catalogs; zero-quantity rows carry a consistent total).
- **Rounding parity:** the CHECK `line_total_value = ((quantity*1000)::bigint * agreed_unit_value + 500) / 1000` is identical to `lineTotal()` in `packages/core/src/pricing/calc.ts`; `integrity-pricing.test.ts` sweeps both and compares.
- **Backfill:** `source` defaults to `CUSTOM` and the catalog snapshot to NULL for rows predating this migration (none in the initial schema). Rollback drops the triggers, functions, constraint and columns.

