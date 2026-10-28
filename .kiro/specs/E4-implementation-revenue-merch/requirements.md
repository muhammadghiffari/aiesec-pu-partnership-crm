# Delivery, revenue, realization reports and merchandise

**Requirement group:** FR-700, FR-750

# Requirements — E4 Partnership Implementation

- A valid signed LoA starts a realization project; deliverables derive from agreed commitments.
- Financial and in-kind actual receipt records are separate and require receipt date, amount/value, program, items/details as relevant and proof URL.
- Partnership proposal value and Rate Card value are not actual revenue.
- Merchandise items, vendor, COGS, selling price, quantity, bundle and revenue proof are tracked separately; profit totals are derived.
- Program finish requires the mandatory realization report link.

## Acceptance criteria
- Signed LoA requirement blocks project start.
- Missing receipt proof blocks the status that marks revenue as verified/complete.
- Financial/in-kind and merchandise income are never silently combined/double-counted.
- COGS/revenue/profit calculations match fixtures for individual item, bundle and discount cases.
