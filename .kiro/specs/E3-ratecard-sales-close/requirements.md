# Rate Card, proposal, meetings, SnD and LoA

**Requirement group:** FR-500, FR-600

# Requirements — E3 Sales and Close Deal

- Rate Card, RateCardItem, RateCardPackage and package benefits are structured/versioned entities.
- Proposal includes selected package and/or benefit lines with quantity and value snapshots.
- Pricing is deterministic, tested and prevents double-counting package and benefit lines.
- Sales meeting and final structured MoM are recorded for each meeting.
- Confirmed SnD is mandatory before LoA submission.
- LoA supports monetary/valued and non-monetary templates, unique numbering, independent approval and signed-document reference.
- TL BD and LCVP PD have same permissions; submitter cannot approve own LoA.

## Acceptance criteria
- Catalog edit never mutates previously created proposal snapshots.
- No assumed rate card scoring formula is hard-coded until verified against the live workbook.
- Missing final MoM/SnD/LoA required fields block the relevant stage transition.
- Self-approval denial is tested in UI and server/domain layers.
