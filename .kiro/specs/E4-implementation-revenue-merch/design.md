# Delivery, revenue, realization reports and merchandise

**Design notes:**

# Design — E4 Partnership Implementation

Implement realization projects, deliverables and actual revenue records with auditable status transitions. Keep `RevenueRecord` and merchandise sale realization in separate tables; dashboard aggregation must name the data source and distinguish categories. Derive totals in `packages/core`, use integer currency precision where appropriate, and test rounding rules explicitly.

Mandatory program-report link gate is separate from an optional Impact Report SLA. Do not present the seven-working-day target as a national mandatory field unless the approved program rules say so.
