#!/usr/bin/env python3
"""Close the diagram/database reconciliation notes in docs/DECISIONS.md safely.

Run once from repository root after extracting this overlay. Only three specific Q rows are
rewritten. If the source differs, the script refuses to save any changes.
"""
from pathlib import Path

path = Path("docs/DECISIONS.md")
if not path.is_file():
    raise SystemExit("ERROR: run this from the repository root on the shared demo branch.")
s = path.read_text()
updates = [
    (
        "| Q-13 | Class Diagram types `AuditLog.entityId` as UUID, but M0-06 events also target non-row things (for example the denied action name for `ACCESS_DENIED`) | `audit_log.entity_id` is `text`. Approval requested to update the diagram in the same change (AGENTS.md rule); every other AuditLog attribute matches | Product owner |",
        "| Q-13 | Class Diagram types `AuditLog.entityId` as UUID, but M0-06 events also target non-row things (for example the denied action name for `ACCESS_DENIED`) | `audit_log.entity_id` is `text`; the reconciled Class Diagram now uses `text` for the same reason. The database type is intentionally unchanged. | Resolved in the requested diagram-alignment change; revisit only if audit target semantics change |",
        "Q-13 AuditLog entityId",
    ),
    (
        '| Q-15 | Diagram says `decimal` for money; AGENTS.md says integer rupiah unless a decimal need is agreed | Money columns are `bigint` rupiah; `quantity` is `numeric(12,3)` (fractional quantities). "Derived" proposal/line totals are stored calculator snapshots; the rounding rule is owned by M3-02, not hard-coded in SQL. Merchandise totals are DB-generated integer arithmetic | Product owner / M3-02 |',
        '| Q-15 | Diagram says `decimal` for money; AGENTS.md says integer rupiah unless a decimal need is agreed | The reconciled Class Diagram now uses `bigint` for IDR money, `numeric(12,3)` for fractional quantities, and `numeric(5,2)` / `numeric(10,4)` for scores and assessments to match PostgreSQL. "Derived" proposal/line totals remain stored calculator snapshots; rounding is still owned by M3-02. | Physical type alignment documented; formula/rounding approval remains with Product owner / M3-02 |',
        "Q-15 monetary types",
    ),
    (
        '| Q-16 | Additions beyond the diagram needed by PRD/DATA_MODEL | Lookups `project_support_types`, `benefit_categories` (not seeded: M1-02/M3-01); Contact DNC/provenance columns; Partner `website_domain`/`normalized_name`; cycle `previous_cycle_id` + `re_raise_review_date`; LoA `template_kind` and numbering columns; `user_sessions`. One benefit per proposal (`proposal_benefits` unique per proposal+item) to prevent double counting | Product owner |',
        '| Q-16 | Additions beyond the original diagram needed by PRD/DATA_MODEL | The reconciled Class Diagram now includes `project_support_types`, `benefit_categories`, `user_sessions`, and `schema_migrations` (the last is explicitly technical metadata, not a business entity), plus the persisted Partner/Contact/Cycle/LoA/Outreach/ProposalBenefit/Merchandise/AuditLog fields. The one-benefit-per-proposal uniqueness rule remains enforced in PostgreSQL. Authoritative production lookup values still require the approved M1-02/M3-01 seed process; local demo seeds are synthetic. | Diagram coverage updated; production taxonomy remains a milestone/release gate |',
        "Q-16 missing classes and fields",
    ),
]
for old, new, label in updates:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: expected one anchor for {label}, found {count}. No file written.")
    s = s.replace(old, new, 1)
path.write_text(s)
print(f"Updated {path}: Q-13, Q-15 and Q-16 now explain the schema/diagram alignment.")
