# ESSM BD Mapping Contract

This is the implementation mapping contract derived from the supplied **ESSM BD Guideline 2026** and the corrected system design. During the import/export implementation, the actual supplied workbook remains the authority for sheet names, column positions, formulas and dropdown values. The live workbook itself is deliberately excluded from this repository.

## 1. Lifecycle map

| CRM top-level stage | ESSM purpose | Data areas |
|---|---|---|
| 1. Prospecting | Identify and research suitable potential partners | Partner, IndustryCategory, ProjectSupport, Contact, MarketResearch, ProspectingRecord, partnership-cycle creation |
| 2. Sales Process | Sales approach, reply, proposal, meeting, follow-up | Contact, OutreachMessage, Proposal, Meeting, MoM, discovery and sales checkpoints |
| 3. Close Deal | Finalize SnD and formalize contract/LoA | SnDAgreement, LoA, approval event, signed-document reference |
| 4. Partnership Implementation | Deliver signed commitments and maintain partner relationship | RealizationProject, Deliverable, actual financial/in-kind revenue, report, engagement log, merchandise tracker |
| 5. Post Survey | Track BD Post-Partnership Scorecard and continuation decision | SurveyDispatch, completion status, re-raise decision, future PartnershipCycle |

Subactivities do not create new top-level lifecycle stages. `SalesStatus` is different from `PartnershipStatus`.

## 2. Ten official BD industry categories

| Display label | Suggested stable code |
|---|---|
| Energy, Materials & Industrials | `ENERGY_MATERIALS_INDUSTRIALS` |
| Health Care | `HEALTH_CARE` |
| Financial (Bank & Insurance) | `FINANCIAL_BANK_INSURANCE` |
| Tech Company | `TECH_COMPANY` |
| FMCG & FnB | `FMCG_FNB` |
| Communication Services | `COMMUNICATION_SERVICES` |
| E-Commerce and Retail | `ECOMMERCE_RETAIL` |
| Education | `EDUCATION` |
| Consulting | `CONSULTING` |
| Others | `OTHERS` |

Persist both code and original/display label or maintain a mapping table so exports preserve ESSM wording. Avoid renaming source labels in a way that causes unmapped values.

## 3. Project Support dropdown

| Display label | Suggested stable code | Description |
|---|---|---|
| oGX | `OGX` | Outgoing Exchange |
| iGV | `IGV` | Incoming Global Volunteer |
| Membership | `MEMBERSHIP` | Local Conference, office supplies, member merchandise, capacity building |
| LV | `LV` | Local Volunteer |
| AFL | `AFL` | AIESEC Future Leaders |
| Brand Activation | `BRAND_ACTIVATION` | Impact Circle, Youth Today, Global Village and relevant ESSM-defined initiatives |
| BD Project | `BD_PROJECT` | BD project with partners |
| LC Initiatives | `LC_INITIATIVES` | LC initiative/event within the ESSM-defined scope |
| Others | `OTHERS` | Project/product outside listed values |

Exact workbook dropdown spelling and codes are verified as a dedicated mapping task before import/export is marked production-ready.

## 4. Pre-experience sales fields

- Sales Status: `New Sales` / `Re-Raise`.
- Status for new sales: `Active` / `Inactive`.
- Approach Method: `Active` (AIESEC initiates) / `Passive` (partner initiates).
- Partnership Alignment: Values, Vision, Current Focus and Program, each 1–5; human `Proceed` decision.
- Market Research date formatted `yyyy/mm/dd` where the ESSM export requires that representation.
- Sales approach checkpoints: Outreaching, Reply, Proposal Created & Sent + link, Sales Meeting + MoM link, Follow-Up, Contract Signed + LoA link, invoice link, month signed/end, final Project Support. Map each checkpoint to an auditable CRM timestamp/status and link rather than compressing the full workflow into one text cell.

## 5. During/post-experience fields

- Established/continued partnership status: `Active`, `Break`, `Finish`.
- Re-Raise: `Yes`, `No`, `Planning To`.
- SnD implementation and event/program finished status.
- Realization/program report link is mandatory when finished.
- Newsletter: mandatory monthly during active partnership.
- Partner visit, invitation to external AIESEC events, greeting cards: optional under ESSM; track completion without turning them into mandatory gates.
- Post-Partnership Scorecard: mandatory; store link, dispatched timestamp, dispatch actor and response/completion status.

## 6. Revenue Financial and In-Kind

Each actual receipt row must retain month, partner, program/Project Support, date received, value/amount and supporting evidence URL. Financial and in-kind are separate classifications. In-kind additionally records Added Value or Cost Reduction and the items/details received. No record can be treated as verified without the proof link required by the applicable row/status.

## 7. Rate Card and pricing

Model Rate Card header, version, benefit categories, benefits, monetized unit value, unit, and pricing/packages as relational data. User selects a category/benefit; the CRM resolves the approved monetized values and computes totals deterministically. Keep the workbook's scoring inputs/formulas as configurable mappings until the denominator discrepancy is confirmed; do not reverse-engineer an assumed formula into production.

## 8. Merchandise Tracker

Map item name, vendor/supplier link, COGS per unit, selling price, unit profit, quantity sold, total COGS, total revenue, total profit, bundle name, bundle price, profit calculation and revenue-proof link. Formula outputs are derived in the application; import/export should preserve source cell values for comparison but should not treat formula output as independent manually editable amounts.

## 9. Official BD Post-Partnership Scorecard

Canonical URL: `https://s.aiesec.or.id/AIESECPartnershipSurvey-BD`

Initial release is **link/status tracking only** because the provided PRD says response-content access is not available/approved. Do not automate access to response data without authorization from the national form owner.

## 10. Import/export controls

1. A mapping is versioned data, not scattered column indexes in code.
2. Import always previews row counts, duplicate matches, invalid dropdowns and row-level errors.
3. Import is idempotent using source sheet + source row fingerprint.
4. Export order and formatting are tested against a synthetic golden workbook; test fixtures must contain no real partner data.
5. Unknown dropdown values are surfaced for review; do not map them silently to `Others`.
6. The actual ESSM workbook is supplied locally by an authorized user and is never copied into the repository/CI.
