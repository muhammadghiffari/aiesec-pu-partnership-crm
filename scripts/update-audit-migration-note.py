#!/usr/bin/env python3
"""Update the migration comment after Q-13 is resolved in the Class Diagram."""
from pathlib import Path
path = Path("packages/db/src/migrations/0004_audit_log.ts")
if not path.is_file():
    raise SystemExit("ERROR: run this from repository root on demo/postgres-live.")
s = path.read_text()
old = """ * Deviation from the diagram (recorded as Q-13): entity_id is text, not uuid, because M0-06
 * events reference non-row targets (for example the denied authorization action name).
"""
new = """ * Q-13 diagram/schema reconciliation: entity_id is text because M0-06 events may reference
 * non-row targets (for example the denied authorization action name). The Class Diagram uses
 * text as well; retain this physical type unless audit-target semantics change.
"""
if s.count(old) != 1:
    raise SystemExit(f"ERROR: expected one migration-comment anchor, found {s.count(old)}. No file written.")
path.write_text(s.replace(old, new, 1))
print(f"Updated {path}: stale Q-13 comment replaced.")
