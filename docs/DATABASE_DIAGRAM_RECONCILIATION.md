# Class Diagram ↔ PostgreSQL Reconciliation

**Scope:** the `2 Class Diagram` page in `docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml` and the PostgreSQL schema defined by migrations `0001`–`0005` on `demo/postgres-live`.

## Counts

| Item | Before alignment | After alignment | Notes |
|---|---:|---:|---|
| Core business/domain classes | 30 | 30 | Existing ESSM/business model is retained |
| Persisted support classes/tables | 0 shown | 3 | `ProjectSupportType`, `BenefitCategory`, `UserSession` |
| Technical migration metadata | 0 shown | 1 | `SchemaMigration` represents `schema_migrations`; not a business entity |
| Drawn table-backed classes | 30 | 34 | Includes the technical metadata class with a clear label |
| PostgreSQL base tables (expected after migrations) | 34 | 34 | 33 application/support tables + `schema_migrations` |
| Original domain attributes | 239 | — | Original diagram baseline |
| Newly added columns on the original 30 classes | 0 | 27 | Fields implemented in PostgreSQL but missing from their original class boxes |
| Attributes in the 4 newly added table classes | 0 | 17 | 13 fields over three persistence/support classes + 4 migration metadata fields |
| Total attributes / physical columns | 239 | 283 | 239 + 27 + 13 + 4 = 283 |
| Diagram association lines | 37 | 51 | Adds persisted lookup/session relationships, omitted FK roles, cycle self-reference, RevenueRecord→LoA, and AuditLog authorizer |

`schema_migrations` is created by the migration runner rather than by migrations `0001`–`0005`. It is included for table accounting, but explicitly tagged as technical metadata so nobody confuses migration history with an ESSM business entity.

## Tables not represented as classes in the original diagram

| PostgreSQL table | Kind | What should be added to the diagram | Why |
|---|---|---|---|
| `project_support_types` | Domain lookup | `ProjectSupportType(code, label, description?, active)` and relationships to `TargetCriteria` and `PartnershipCycle` | Both tables use a foreign key to the canonical Project Support taxonomy |
| `benefit_categories` | Domain lookup | `BenefitCategory(code, label, active)` and relationship to `RateCardItem` | `rate_card_items.category` references this lookup |
| `user_sessions` | Authentication/persistence support | `UserSession(sessionId, userId, tokenHash, createdAt, expiresAt, revokedAt?)`, connected to `User` | Session tokens are persisted as hashes; each session belongs to a user |
| `schema_migrations` | Migration tooling metadata | `SchemaMigration(version, name, checksum, appliedAt)` shown separately as a technical class | The runner records applied migration versions/checksums; it is not a product-domain entity |

## Columns present in PostgreSQL but absent from the original class diagram

These were added to the Draw.io page so the inverse comparison covers actual schema columns as well as “diagram fields exist in DB”.

| Class/table | Fields added to diagram |
|---|---|
| `IndustryCategory` / `industry_categories` | `code` |
| `Partner` / `partners` | `normalizedName` (generated), `websiteDomain?`, `sourceUrl?`, `sourceTier` |
| `PartnershipCycle` / `partnership_cycles` | `previousCycleId?`, `reRaiseReviewDate?` |
| `Contact` / `contacts` | `sourceTier`, `lawfulBasisNote`, `verifiedBy?`, `doNotContact`, `dncReason?`, `dncSetAt?`, `dncSetBy?` |
| `RateCardPackageBenefit` / `rate_card_package_benefits` | `rateCardId` (part of composite FKs ensuring package/item belong to the same rate-card version) |
| `OutreachMessage` / `outreach_messages` | `approvedContentHash?` |
| `ProposalBenefit` / `proposal_benefits` | `benefitNameSnapshot`, `unitSnapshot`, `rateCardVersionSnapshot` |
| `LoA` / `loas` | `templateKind`, `loaYear?`, `loaSequence?`, `loaNumber?` |
| `MerchandiseRealization` / `merchandise_realizations` | `unitCogsSnapshot` |
| `AuditLog` / `audit_log` | `kind`, `reason?`, `authorizedByUserId?` |

## Type and nullability reconciliations

- `AuditLog.entityId` is `text`, not UUID. The field can reference a denied/non-row authorization target, so the diagram is updated to `text` (Q-13 resolved at the data-model level).
- IDR monetary amounts are `bigint` integer rupiah in PostgreSQL. `ProposalBenefit.quantity` is `numeric(12,3)`; fit scores remain numeric; `RateCardAssessment.monetizeQuality` and `monetizeValue` are nullable `numeric(10,4)` values until the formula decision is resolved (Q-15 clarified).
- `PartnershipCycle.partnershipStatus` and `reRaiseDecision` are nullable until their lifecycle decisions exist. `RateCardAssessment.monetizeQuality` and `monetizeValue` are nullable until Q-01 is resolved. `Meeting.outcome` was already optional in the original diagram and is not a true mismatch.
- URL fields/URL arrays are physically `text`/`text[]` with URL validation checks where required; the diagram now uses those PostgreSQL storage types. Fixed-length hashes/currency use `char(64)`/`char(3)`, and audit metadata uses `jsonb`.
- Enumerated domain values are implemented with `text` plus `CHECK` constraints, not PostgreSQL native `ENUM` types. Diagram enum labels express permitted values, while physical storage uses `text`; the check-domain test verifies the values.

## Relationship changes

The Draw.io page now includes the previously unshown relationships for Project Support lookup, Benefit Category lookup, persisted user sessions, a cycle's optional previous-cycle reference, Contact verifier/DNC actor, MarketResearch verifier, RateCard owner, PartnerEngagement approver/sender, survey sender, `RevenueRecord.loaId`, and the AuditLog authorizer role. The 37 original associations remain intact, with 14 added lines for the schema edges omitted before. The resulting 51 association lines cover the 48 distinct directed table-pair types represented by the 52 PostgreSQL foreign-key constraints: the `User`–`LoA` line labels both submitter and approver roles, while Contact, PartnerEngagement, and AuditLog show their separate user roles as separate lines.

## Important scope distinction for the lecturer

- `/demo` in this branch can use the **LIVE DB** mode for partner/contact workflows via the real API, authentication/RBAC, and audit path when the environment is configured.
- Other demo modules are still synthetic presentation data unless their API wiring explicitly says otherwise. Do not claim that all dashboard/research/outreach/LoA/project screens persist to PostgreSQL just because the “LIVE DB” pill appears.
- The expected schema is based on the migrations; the final live proof still needs to be run on Radith's own local PostgreSQL instance. Use `scripts/check-live-schema.sql` in pgAdmin and the schema-conformance tests after applying the patch.

## Verification checklist

1. Apply migrations using `pnpm tsx apps/web/scripts/dev-db-setup.mts` with `DATABASE_URL` pointing to the local DB.
2. In pgAdmin run `scripts/check-live-schema.sql` and verify counts: 34 public base tables, 283 total columns (including migration metadata), and 52 foreign-key constraints for the current migration set.
3. Run `pnpm test -- packages/db/src/diagram-conformance.test.ts` after applying the accompanying test patch.
4. Through `/demo`, sign in with a seeded synthetic allowlisted account, create/edit a synthetic partner/contact, refresh, and verify the row and audit event are in the same PostgreSQL database shown in pgAdmin.
5. Do not run `docker compose down -v`; that deletes the local database volume.
