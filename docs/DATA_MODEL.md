# Data Model Contract — Mirrors the Fixed Class Diagram

**Canonical visual source:** `docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml`, page `2 Class Diagram`.

The implementation schema must be reconciled against that class diagram during M1. Column names may be idiomatic snake_case in SQL, but entity responsibilities, constraints and relationships below must be preserved. If a technical migration needs to adjust the diagram, update the diagram and obtain product-owner approval in the same change; never silently drift.

## Entities and responsibilities

| Entity | Responsibility / important fields |
|---|---|
| `User` | `userId`, email, name, `accessRole`, `isActive`, optional `organizationalTitle`. `CRM_LEAD` applies to TL BD and LCVP PD alike. |
| `UserSession` | Persistent session record owned by a user; stores an opaque session-token hash, created/expiry timestamps, and optional revocation timestamp (never the raw session token). |
| `TargetCriteria` | ESSM industry category, Project Support lookup, criteria text, numeric minimum AI fit score, version and active flag. |
| `ProjectSupportType` | Canonical lookup for supported project types. `PartnershipCycle` and `TargetCriteria` reference its code rather than duplicating labels. |
| `IndustryCategory` | Official ESSM industry category code, display label, description and active flag. |
| `Partner` | Company/organization master: name plus generated `normalizedName`, ESSM category, official email, `websiteDomain?`, source/provenance (`sourceUrl?`, `sourceTier`) and creation timestamp. |
| `PartnershipCycle` | A single sales/partnership attempt linked to a partner: cycle number, optional `previousCycleId` for re-raise history, sales type/status, approach method, ESSM stage, optional partnership status/re-raise decision, optional re-raise review date, Project Support, open/close dates. |
| `MarketResearch` | Four ESSM scores (Values, Vision, Current Focus, Program; each 1–5), human Proceed decision, evidence URLs, separate optional AI fit score, human verifier and research date. |
| `ProspectingRecord` | Target criteria used, fit score/rationale, needs insight, source URLs and creation time. It is a research/queue artifact, not the partner master. |
| `Contact` | Partner PIC/contact name, title, email, phone/WhatsApp, verification status, source URL/tier, lawful-basis note, optional verifying user/time, and DNC flag with optional reason/setter/time. Verification/DNC safeguards are enforced by the service and database constraints where defined. |
| `OutreachMessage` | Partnership cycle and contact, draft body, channel/status, follow-up attempt count, approver/time, fixed-length approved content hash covering content/recipient/channel, and send time. |
| `RateCard` | Versioned rate catalog, name, `char(3)` currency code, status, effective dates and owner. IDR monetary amounts use integer rupiah (`bigint`). |
| `RateCardItem` | Benefit category/name, monetized unit value (`bigint`), unit and active status within a Rate Card. Benefit category is a foreign key to `BenefitCategory`. |
| `BenefitCategory` | Lookup for rate-card benefit categories: stable code, display label and active flag. |
| `RateCardPackage` | Optional package template with listed price, slot limits and active status. |
| `RateCardPackageBenefit` | Join record between a package and a catalog benefit; includes included quantity and optional item slot limit. |
| `Proposal` | Partnership-cycle proposal, optional package, pricing mode, calculated proposed value in integer rupiah (`bigint`), `char(3)` currency code, content link/status and sent timestamp. |
| `ProposalBenefit` | Selected catalog benefit, fractional quantity (`numeric(12,3)`), agreed unit value and line total (`bigint`), contribution type, and benefit-name/unit/rate-card-version snapshots so catalog edits cannot rewrite history. |
| `Meeting` | Cycle, scheduled date, meeting number, meeting type and outcome. Default maximum two meetings per cycle is configurable. |
| `MoM` | One meeting's structured official Minutes of Meeting, summary/action items/decision/document URL and draft/final status. Final text remains human-approved. |
| `MeetingAttendee` | Meeting attendee name, title/function, attendance status and participant type. |
| `LoA` | Proposal/cycle, template kind, terms, draft/approval/signature state, submitter/approver and timestamps, document link, and optional generated year/sequence/number. Self-approval is forbidden. |
| `RealizationProject` | Project generated from a fully signed LoA, status/period, mandatory report URL and submission timestamp, optional Impact Report due date. |
| `DeliveryRecord` | Delivery against realization project and proposal benefit commitment, due/delivered timestamps, status and evidence URL. |
| `RevenueRecord` | Actual receipt linked to cycle and optionally LoA/project; financial or in-kind type, month, program, receipt date, financial amount or in-kind value/type/description and proof URL. |
| `PartnerEngagement` | Newsletter, partner visit, event invitation or greeting card with status, scheduled/sent metadata, approving/sending user and content/MoM link. |
| `PostPartnershipSurvey` | Cycle, canonical official survey URL, status, sent timestamp/user and completion-check timestamp. No response-body storage in the initial release. |
| `MerchandiseItem` | Item name, vendor URL, unit COGS, selling price, derived per-item profit and active flag. |
| `MerchandiseBundle` | Bundle name, bundling price and active flag. |
| `MerchandiseBundleItem` | Bundle composition join: bundle, item, quantity per bundle. |
| `MerchandiseRealization` | Dated item or bundle sale, quantity, actual unit selling-price snapshot, unit COGS snapshot, generated total COGS/revenue/profit, and revenue proof. Item/bundle selector semantics prevent ambiguous rows. |
| `RateCardAssessment` | Optional per-benefit-line assessment: `retentionRateScore`, `eventSizeScore`, `eventScaleScore`, `partnershipQualityScore`, `partnershipDurationScore` drive derived `monetizeQuality`; `sdgAlignmentScore`, `leadershipValueAlignmentScore`, `partnershipRetainedScore`, `historicalScore`, `communicationScore` drive derived `monetizeValue`. All raw scores are 0–5 as drawn. Formula must remain unconfirmed/configurable until verified against the live workbook. |
| `AuditLog` | Append-only event kind, actor/action, entity type/ID, timestamp, optional reason/authorizing user and minimized `jsonb` metadata. `entityId` is PostgreSQL `text` because some denied-action targets are not row UUIDs. No application update/delete operation. |

`schema_migrations` is a 34th physical table in the local schema, created by the migration runner to record migration version/name/checksum/applied time. It is technical metadata, not a CRM business entity; it is drawn as a separately labelled technical class only to make physical table counts auditable. The complete table/column reconciliation is in `docs/DATABASE_DIAGRAM_RECONCILIATION.md`.

## Relationships (multiplicity follows the diagram)

| Parent / source | Child / target | Multiplicity or rule |
|---|---|---|
| IndustryCategory | Partner | One category can classify many partners; each partner has one primary ESSM category. |
| IndustryCategory | TargetCriteria | One category can be used by many criteria records. |
| ProjectSupportType | TargetCriteria / PartnershipCycle | A canonical Project Support code can be referenced by many criteria and partnership cycles. |
| BenefitCategory | RateCardItem | A benefit category can classify many rate-card items. |
| User | UserSession | A user can have multiple sessions; stored session values are token hashes, not raw tokens. |
| PartnershipCycle (previous cycle) | PartnershipCycle | An optional self-reference preserves the earlier cycle when a partner is re-raised. |
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
| Proposal / PartnershipCycle + User | LoA | LoA is traceable to proposal/cycle and submitter/approver; submitter ≠ approver. The User–LoA association represents both user roles. |
| LoA | RealizationProject | Project starts only after approved and fully signed LoA. |
| RealizationProject + ProposalBenefit | DeliveryRecord | Delivery records track realization against a commitment line. |
| RealizationProject + PartnershipCycle + LoA | RevenueRecord | Actual receipts may be associated with a project and cycle, and optionally linked to an LoA. |
| MerchandiseItem / MerchandiseBundle | MerchandiseRealization | Sale is for an item or a bundle; bundle sale uses snapshotted component costs/prices. |
| MerchandiseBundle + MerchandiseItem | MerchandiseBundleItem | Many-to-many component association. |
| ProposalBenefit | RateCardAssessment | Optional assessment per benefit line (0..1 in the visual model). |
| User | AuditLog | One user may produce many events as actor and may also be the named authorizer for gate overrides; these are separate nullable/required FK roles in the schema. |

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

The schema is implemented in `packages/db/src/migrations/`. `packages/db/src/diagram-conformance.test.ts` compares the Class Diagram and database in both directions: every mapped diagram field/table must exist in PostgreSQL, and no PostgreSQL table or column may be omitted from the diagram. Remaining product questions and release gates are listed in `docs/DECISIONS.md`; the field-by-field reconciliation is in `docs/DATABASE_DIAGRAM_RECONCILIATION.md`. See `docs/MIGRATIONS.md` for migration workflows.

