# Rate Card, proposal, meetings, SnD and LoA

**Design notes:**

# Design — E3 Sales and Close Deal

Rate card formulas live in a tested domain service, not SQL fragments inside UI components. Maintain currency/unit/effective dates and snapshots for past proposal versions. The national workbook formula issue is a documented release blocker; preserve raw factor values and an explicit formula version.

Store two-sided supply/demand lines and confirmed-by metadata before LoA. Document generation operates on authorized tagged templates and generates draft links only. External signature is recorded as a signed document reference and date; the app does not e-sign.
