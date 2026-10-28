# Data Model Contract — Mirrors the Fixed Class Diagram

**Canonical visual source:** `docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml`, page `2 Class Diagram`.

The implementation schema must be reconciled against that class diagram during M1. Column names may be idiomatic snake_case in SQL, but entity responsibilities, constraints and relationships below must be preserved. If a technical migration needs to adjust the diagram, update the diagram and obtain product-owner approval in the same change; never silently drift.

## Entities and responsibilities

| Entity | Responsibility / important fields |
|---|---|
| `User` | `userId`, email, name, `accessRole`, `isActive`, optional `organizationalTitle`. `CRM_LEAD` applies to TL BD and LCVP PD alike. |
| `TargetCriteria` | ESSM industry category, Project Support, criteria text, minimum AI fit score, version and active flag. |
| `IndustryCategory` | Official ESSM industry category display label, description and active flag. |
| `Partner` | Company/organization master: name, industry category, official email, source, created timestamp. Add the additional approved website/domain, dedupe and DNC metadata as needed by PRD. |
| `PartnershipCycle` | A single sales/partnership attempt linked to a partner: cycle number, sales type/status, approach method, ESSM stage, partnership status, re-raise decision, Project Support, open/close dates. |
| `MarketResearch` | Four ESSM scores (Values, Vision, Current Focus, Program; each 1–5), human Proceed decision, evidence URLs, separate optional AI fit score, human verifier and research date. |
| `ProspectingRecord` | Target criteria used, fit score/rationale, needs insight, source URLs and creation time. It is a research/queue artifact, not the partner master. |
| `Contact` | Partner PIC/contact name, title, email, phone/WhatsApp, verification status, source URL and verification timestamp. Include DNC/provenance controls from PRD. |
| `OutreachMessage` | Partnership cycle and contact, draft body, channel/status, follow-up attempt count, approver/time and send time. Implementation adds approved hash covering content, recipient and channel, plus lint and send audit metadata. |
| `RateCard` | Versioned rate catalog, name, currency, status, effective dates and owner. |
| `RateCardItem` | Benefit category/name, monetized unit value, unit and active status within a Rate Card. |
| `RateCardPackage` | Optional package template with listed price, slot limits and active status. |
| `RateCardPackageBenefit` | Join record between a package and a catalog benefit; includes included quantity and optional item slot limit. |
| `Proposal` | Partnership-cycle proposal, optional package, pricing mode, calculated proposed value/currency, content link/status and sent timestamp. Add immutable price/version snapshots as required by PRD. |
| `ProposalBenefit` | Selected catalog benefit, quantity, agreed unit value, derived line total and contribution type; historic lines must not change when catalog values change. |
| `Meeting` | Cycle, scheduled date, meeting number, meeting type and outcome. Default maximum two meetings per cycle is configurable. |
| `MoM` | One meeting's structured official Minutes of Meeting, summary/action items/decision/document URL and draft/final status. Final text remains human-approved. |
| `MeetingAttendee` | Meeting attendee name, title/function, attendance status and participant type. |
| `LoA` | Proposal/cycle, terms, draft/approval/signature state, submitter/approver and timestamps, document link. Self-approval forbidden. |
| `RealizationProject` | Project generated from a fully signed LoA, status/period, mandatory report URL and submission timestamp, optional Impact Report due date. |
| `DeliveryRecord` | Delivery against realization project and proposal benefit commitment, due/delivered timestamps, status and evidence URL. |
| `RevenueRecord` | Actual receipt linked to cycle and optionally LoA/project; financial or in-kind type, month, program, receipt date, financial amount or in-kind value/type/description and proof URL. |
| `PartnerEngagement` | Newsletter, partner visit, event invitation or greeting card with status, scheduled/sent metadata, approving/sending user and content/MoM link. |
| `PostPartnershipSurvey` | Cycle, canonical official survey URL, status, sent timestamp/user and completion-check timestamp. No response-body storage in the initial release. |
| `MerchandiseItem` | Item name, vendor URL, unit COGS, selling price, derived per-item profit and active flag. |
| `MerchandiseBundle` | Bundle name, bundling price and active flag. |
| `MerchandiseBundleItem` | Bundle composition join: bundle, item, quantity per bundle. |
| `MerchandiseRealization` | Dated item or bundle sale, quantity, actual unit selling price snapshot, derived total COGS/revenue/profit and revenue proof. Item/bundle selector semantics must prevent invalid ambiguous rows. |
| `RateCardAssessment` | Optional per-benefit-line assessment: `retentionRateScore`, `eventSizeScore`, `eventScaleScore`, `partnershipQualityScore`, `partnershipDurationScore` drive derived `monetizeQuality`; `sdgAlignmentScore`, `leadershipValueAlignmentScore`, `partnershipRetainedScore`, `historicalScore`, `communicationScore` drive derived `monetizeValue`. All raw scores are 0–5 as drawn. Formula must remain unconfirmed/configurable until verified against the live workbook. |
| `AuditLog` | Append-only actor, action, entity type/ID, timestamp and minimized metadata. No application update/delete operation. |

## Relationships (multiplicity follows the diagram)

| Parent / source | Child / target | Multiplicity or rule |
|---|---|---|
| IndustryCategory | Partner | One category can classify many partners; each partner has one primary ESSM category. |
| IndustryCategory | TargetCriteria | One category can be used by many criteria records. |
| TargetCriteria | ProspectingRecord | A criteria version can produce many prospecting records. |
| Partner | Contact | One partner can have many contacts. |
| Partner | PartnershipCycle | One partner can have many distinct cycles over time. |
| PartnershipCycle | MarketResearch / ProspectingRecord / OutreachMessage | One cycle may contain multiple history/research/outreach artifacts. |
| Contact | OutreachMessage | One contact may receive many message drafts/logs. |
| User | OutreachMessage | User approval is recorded; hash must match at send time. |
| RateCard | RateCardItem / RateCardPackage | One catalog version contains many items/packages. |
| RateCardPackage + RateCardItem | RateCardPackageBenefit | Many-to-many through package benefit rows. |
| PartnershipCycle | Proposal / Meeting / LoA / RevenueRecord / PartnerEngagement / PostPartnershipSurvey | Lifecycle evidence links to the cycle without overwriting older cycles. |
| Proposal + RateCardItem | ProposalBenefit | Proposal has line items; each line snapshots selected catalog value. |
| Meeting | MoM | At most one final MoM record per meeting, with draft revisions handled as versions/history. |
| Meeting | MeetingAttendee | One meeting has multiple attendee records. |
| Proposal / PartnershipCycle + User | LoA | LoA is traceable to proposal/cycle and submitter/approver; submitter ≠ approver. |
| LoA | RealizationProject | Project starts only after approved and fully signed LoA. |
| RealizationProject + ProposalBenefit | DeliveryRecord | Delivery records track realization against a commitment line. |
| RealizationProject + PartnershipCycle | RevenueRecord | Actual receipts may be associated with a project and cycle. |
| MerchandiseItem / MerchandiseBundle | MerchandiseRealization | Sale is for an item or a bundle; bundle sale uses snapshotted component costs/prices. |
| MerchandiseBundle + MerchandiseItem | MerchandiseBundleItem | Many-to-many component association. |
| ProposalBenefit | RateCardAssessment | Optional assessment per benefit line (0..1 in the visual model). |
| User | AuditLog | One user may produce many audit events. |

## Controlled values

Use the values in `docs/ESSM_MAPPING.md` for ESSM classifications. Other enums should be defined centrally, including `AccessRole`, `ESSMStage`, `SalesType`, `SalesStatus`, `ApproachMethod`, `PartnershipStatus`, `ReRaiseDecision`, `ContactStatus`, `OutreachChannel`, `OutreachStatus`, `RateCardStatus`, `BenefitCategory`, `PricingMode`, `ProposalStatus`, `ContributionType`, `MeetingType`, `MeetingDecision`, `MoMStatus`, `LoAStatus`, `ProjectStatus`, `DeliverableStatus`, `RevenueType`, `InKindType`, `EngagementType`, `EngagementStatus` and `SurveyStatus`.

## Data-integrity rules

- FK constraints on all relations; unique normalized keys/LoA sequence numbers where configured.
- Market Research four scores are integers 1–5; all four plus human Proceed decision required before the qualification gate passes.
- `OutreachMessage` send status requires approved hash and actor/time; content, recipient or channel changes invalidate that approval.
- `LoA` cannot be approved by its submitter. Do not rely solely on hiding the Approve button.
- Only a fully signed LoA starts `RealizationProject`.
- Finished program requires a report URL. Verified revenue status requires proof URL.
- `MerchandiseRealization` must reference exactly one of item or bundle; component COGS is snapshotted for bundle realization.
- Audit log mutations are append-only. Export and waiver actions are logged.
- Proposal valuations, actual partner receipts and merchandise sales are separately aggregated to prevent false revenue totals.
- RateCardAssessment derived formula stays blocked from production until Q-01 in `docs/DECISIONS.md` is resolved.

## Implementation status (M1-01)

The schema is implemented in `packages/db/src/migrations/`. `packages/db/src/diagram-conformance.test.ts` parses the fixed Class Diagram XML and fails if a class, attribute, nullability, relationship multiplicity or controlled value drifts. Deliberate differences are listed in `docs/DECISIONS.md` Q-13..Q-16. See `docs/MIGRATIONS.md` for how to run, roll back and extend migrations.

