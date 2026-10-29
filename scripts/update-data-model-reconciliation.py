#!/usr/bin/env python3
"""Refresh DATA_MODEL.md so its entity catalogue reflects the PostgreSQL schema.

Run from repository root after extracting this overlay. Exact anchors make the change safe to
apply once; if the source doc has changed, it stops instead of clobbering edits.
"""
from pathlib import Path

path = Path("docs/DATA_MODEL.md")
if not path.is_file():
    raise SystemExit("ERROR: run this from the repository root on demo/postgres-live.")
s = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: expected one anchor for {label}, found {count}. No file written.")
    s = s.replace(old, new, 1)

updates = [
(
'''| `IndustryCategory` | Official ESSM industry category display label, description and active flag. |''',
'''| `IndustryCategory` | Official ESSM industry category code, display label, description and active flag. |''',
"IndustryCategory code"),
(
'''| `Partner` | Company/organization master: name, industry category, official email, source, created timestamp. Add the additional approved website/domain, dedupe and DNC metadata as needed by PRD. |''',
'''| `Partner` | Company/organization master: name plus generated `normalizedName`, ESSM category, official email, `websiteDomain?`, source/provenance (`sourceUrl?`, `sourceTier`) and creation timestamp. |''',
"Partner actual persisted fields"),
(
'''| `PartnershipCycle` | A single sales/partnership attempt linked to a partner: cycle number, sales type/status, approach method, ESSM stage, partnership status, re-raise decision, Project Support, open/close dates. |''',
'''| `PartnershipCycle` | A single sales/partnership attempt linked to a partner: cycle number, optional `previousCycleId` for re-raise history, sales type/status, approach method, ESSM stage, optional partnership status/re-raise decision, optional re-raise review date, Project Support, open/close dates. |''',
"PartnershipCycle actual persisted fields"),
(
'''| `Contact` | Partner PIC/contact name, title, email, phone/WhatsApp, verification status, source URL and verification timestamp. Include DNC/provenance controls from PRD. |''',
'''| `Contact` | Partner PIC/contact name, title, email, phone/WhatsApp, verification status, source URL/tier, lawful-basis note, optional verifying user/time, and DNC flag with optional reason/setter/time. Verification/DNC safeguards are enforced by the service and database constraints where defined. |''',
"Contact actual persisted fields"),
(
'''| `User` | `userId`, email, name, `accessRole`, `isActive`, optional `organizationalTitle`. `CRM_LEAD` applies to TL BD and LCVP PD alike. |''',
'''| `User` | `userId`, email, name, `accessRole`, `isActive`, optional `organizationalTitle`. `CRM_LEAD` applies to TL BD and LCVP PD alike. |\n| `UserSession` | Persistent session record owned by a user; stores an opaque session-token hash, created/expiry timestamps, and optional revocation timestamp (never the raw session token). |''',
"UserSession persisted entity"),
(
'''| `TargetCriteria` | ESSM industry category, Project Support, criteria text, minimum AI fit score, version and active flag. |''',
'''| `TargetCriteria` | ESSM industry category, Project Support lookup, criteria text, numeric minimum AI fit score, version and active flag. |\n| `ProjectSupportType` | Canonical lookup for supported project types. `PartnershipCycle` and `TargetCriteria` reference its code rather than duplicating labels. |''',
"ProjectSupportType persisted lookup"),
(
'''| `OutreachMessage` | Partnership cycle and contact, draft body, channel/status, follow-up attempt count, approver/time and send time. Implementation adds approved hash covering content, recipient and channel, plus lint and send audit metadata. |''',
'''| `OutreachMessage` | Partnership cycle and contact, draft body, channel/status, follow-up attempt count, approver/time, fixed-length approved content hash covering content/recipient/channel, and send time. |''',
"OutreachMessage hash field"),
(
'''| `RateCard` | Versioned rate catalog, name, currency, status, effective dates and owner. |''',
'''| `RateCard` | Versioned rate catalog, name, `char(3)` currency code, status, effective dates and owner. IDR monetary amounts use integer rupiah (`bigint`). |''',
"RateCard persisted type"),
(
'''| `RateCardItem` | Benefit category/name, monetized unit value, unit and active status within a Rate Card. |''',
'''| `RateCardItem` | Benefit category/name, monetized unit value (`bigint`), unit and active status within a Rate Card. Benefit category is a foreign key to `BenefitCategory`. |\n| `BenefitCategory` | Lookup for rate-card benefit categories: stable code, display label and active flag. |''',
"BenefitCategory persisted lookup"),
(
'''| `Proposal` | Partnership-cycle proposal, optional package, pricing mode, calculated proposed value/currency, content link/status and sent timestamp. Add immutable price/version snapshots as required by PRD. |''',
'''| `Proposal` | Partnership-cycle proposal, optional package, pricing mode, calculated proposed value in integer rupiah (`bigint`), `char(3)` currency code, content link/status and sent timestamp. |''',
"Proposal physical types"),
(
'''| `ProposalBenefit` | Selected catalog benefit, quantity, agreed unit value, derived line total and contribution type; historic lines must not change when catalog values change. |''',
'''| `ProposalBenefit` | Selected catalog benefit, fractional quantity (`numeric(12,3)`), agreed unit value and line total (`bigint`), contribution type, and benefit-name/unit/rate-card-version snapshots so catalog edits cannot rewrite history. |''',
"ProposalBenefit snapshots"),
(
'''| `LoA` | Proposal/cycle, terms, draft/approval/signature state, submitter/approver and timestamps, document link. Self-approval forbidden. |''',
'''| `LoA` | Proposal/cycle, template kind, terms, draft/approval/signature state, submitter/approver and timestamps, document link, and optional generated year/sequence/number. Self-approval is forbidden. |''',
"LoA actual persisted fields"),
(
'''| `MerchandiseRealization` | Dated item or bundle sale, quantity, actual unit selling price snapshot, derived total COGS/revenue/profit and revenue proof. Item/bundle selector semantics must prevent invalid ambiguous rows. |''',
'''| `MerchandiseRealization` | Dated item or bundle sale, quantity, actual unit selling-price snapshot, unit COGS snapshot, generated total COGS/revenue/profit, and revenue proof. Item/bundle selector semantics prevent ambiguous rows. |''',
"MerchandiseRealization cost snapshot"),
(
'''| `AuditLog` | Append-only actor, action, entity type/ID, timestamp and minimized metadata. No application update/delete operation. |''',
'''| `AuditLog` | Append-only event kind, actor/action, entity type/ID, timestamp, optional reason/authorizing user and minimized `jsonb` metadata. `entityId` is PostgreSQL `text` because some denied-action targets are not row UUIDs. No application update/delete operation. |''',
"AuditLog schema alignment"),
(
'''## Relationships (multiplicity follows the diagram)''',
'''`schema_migrations` is a 34th physical table in the local schema, created by the migration runner to record migration version/name/checksum/applied time. It is technical metadata, not a CRM business entity; it is drawn as a separately labelled technical class only to make physical table counts auditable. The complete table/column reconciliation is in `docs/DATABASE_DIAGRAM_RECONCILIATION.md`.

## Relationships (multiplicity follows the diagram)''',
"schema metadata note"),
(
'''| IndustryCategory | TargetCriteria | One category can be used by many criteria records. |''',
'''| IndustryCategory | TargetCriteria | One category can be used by many criteria records. |\n| ProjectSupportType | TargetCriteria / PartnershipCycle | A canonical Project Support code can be referenced by many criteria and partnership cycles. |\n| BenefitCategory | RateCardItem | A benefit category can classify many rate-card items. |\n| User | UserSession | A user can have multiple sessions; stored session values are token hashes, not raw tokens. |\n| PartnershipCycle (previous cycle) | PartnershipCycle | An optional self-reference preserves the earlier cycle when a partner is re-raised. |''',
"support relationships"),
(
"| User | AuditLog | One user may produce many audit events. |",
"| User | AuditLog | One user may produce many events as actor and may also be the named authorizer for gate overrides; these are separate nullable/required FK roles in the schema. |",
"AuditLog actor/authorizer roles"),
(
"| Proposal / PartnershipCycle + User | LoA | LoA is traceable to proposal/cycle and submitter/approver; submitter ≠ approver. |",
"| Proposal / PartnershipCycle + User | LoA | LoA is traceable to proposal/cycle and submitter/approver; submitter ≠ approver. The User–LoA association represents both user roles. |",
"LoA user roles"),
(
"| RealizationProject + PartnershipCycle | RevenueRecord | Actual receipts may be associated with a project and cycle. |",
"| RealizationProject + PartnershipCycle + LoA | RevenueRecord | Actual receipts may be associated with a project and cycle, and optionally linked to an LoA. |",
"RevenueRecord optional LoA link"),
(
"The schema is implemented in `packages/db/src/migrations/`. `packages/db/src/diagram-conformance.test.ts` parses the fixed Class Diagram XML and fails if a class, attribute, nullability, relationship multiplicity or controlled value drifts. Deliberate differences are listed in `docs/DECISIONS.md` Q-13..Q-16. See `docs/MIGRATIONS.md` for how to run, roll back and extend migrations.",
"The schema is implemented in `packages/db/src/migrations/`. `packages/db/src/diagram-conformance.test.ts` compares the Class Diagram and database in both directions: every mapped diagram field/table must exist in PostgreSQL, and no PostgreSQL table or column may be omitted from the diagram. Remaining product questions and release gates are listed in `docs/DECISIONS.md`; the field-by-field reconciliation is in `docs/DATABASE_DIAGRAM_RECONCILIATION.md`. See `docs/MIGRATIONS.md` for migration workflows.",
"bidirectional schema status"),
]
for old, new, label in updates:
    replace_once(old, new, label)

path.write_text(s)
print(f"Updated {path}: support entities, persisted fields and physical type notes are aligned.")
