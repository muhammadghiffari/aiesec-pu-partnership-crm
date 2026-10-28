# Partnership CRM — Product Requirements Document v2.0

| Field | Value |
|---|---|
| Product | Partnership CRM for Business Development, AIESEC in President University |
| Version | 2.0 — 28 October 2026 |
| Status | Corrected product baseline for implementation; not a claim of completed software |
| Product owner / repository owner | Muhammad Ghiffari (`@muhammadghiffari`), TL BD |
| Shared CRM Lead permission set | TL BD and LCVP Partnership Development (LCVP PD) |
| Development team | Muhammad Ghiffari; Catalna (GitHub handle to confirm); `hicesse` |
| Repository target | Private `muhammadghiffari/aiesec-pu-partnership-crm` |
| System design | `docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml` |
| Time zone | `Asia/Jakarta` |

## 1. Purpose and product boundary
### 1.1 Initial success measures

Establish a baseline during the first month of UAT/operation; these are product targets, not additional ESSM standards.

| Metric | Initial target / measurement | Source |
|---|---|---|
| Researched prospects accepted per BD staff per week | Baseline first month; then target +100% vs manual baseline | Prospecting records |
| Human review time per accepted lead | Target median ≤ 5 minutes after baseline | Review/approval timestamps |
| Drafts accepted with light edits | Target ≥ 60%, where “light” means ≤30% text changed | Draft versions and approval diff |
| Accepted leads with verified real PIC/contact | Target ≥ 70% | Contact verification provenance |
| Open cycles with a dated next action | Target ≥ 95% | PartnershipCycle next-action fields |
| Mandatory newsletter completion | Target 100% of due months for active partnerships | PartnerEngagement |
| Finished programs with a realization report link | Target ≥ 90% within the agreed program timeframe | RealizationProject |
| Finished partnerships with scorecard status resolved | Target ≥ 80% | PostPartnershipSurvey |
| Platform warnings/restrictions attributable to Companion | Target 0; disable Companion if risk cannot be managed | Companion safety log |


The CRM is an internal BD operating system for partner discovery, market research, sales communication, deal closure, partnership implementation, post-partnership scorecard tracking, and continuation decisions. It supplements the national ESSM workbook by managing operational work; it does not replace the national workbook or the formal AIESEC partnership standards.

The implementation MUST follow the fixed 13-page diagram and the ESSM field model. In particular, industry categories and Project Support are ESSM classifications, not user-invented business verticals.

### Goals

1. Run the official five-stage ESSM lifecycle consistently.
2. Keep partner/company data, contacts, research evidence, sales cycles, structured pricing, proposals, LoA, implementation, receipts, merchandise, engagement, and scorecard tracking connected through explicit entities.
3. Reduce repetitive research and drafting while retaining human responsibility for decisions and communication.
4. Provide reliable actual-revenue records and auditable calculation of proposed partnership value.
5. Support ESSM workbook import/export with a verified mapping and no duplicate-entry traps.
6. Enable team handover through partner history, cycle history, commitments, next actions, and audit trail.

### Out of scope for the initial product

- Media partnerships owned by a different subdivision; the CRM records disposition and hand-off note only.
- Automatic WhatsApp or LinkedIn sending, mass-blasting, auto-connect, or scraping at scale.
- E-signature, payment processing, and bank-transfer execution; signing and payments remain external.
- Public/partner-facing portal, native mobile app, or multi-local-committee tenancy.
- Replacing the official ESSM workbook or importing real operational data into Git.
- Assuming access to national Google Form responses. The initial scope stores the official form URL and dispatch/completion status only.

## 2. Canonical ESSM lifecycle

The top-level lifecycle is fixed:

1. **Prospecting** — target criteria, partner identification, evidence-based research, ESSM industry classification, Project Support, four human alignment scores, `Proceed` decision, and creation of a partnership cycle.
2. **Sales Process** — verified contact, approved outreach, response/follow-up, discovery, structured proposal, sales meeting, official Minutes of Meeting (MoM), and assessment of fit.
3. **Close Deal** — negotiate and confirm mutually agreed Supply and Demand (SnD), prepare LoA from the appropriate template, approval with separation of duties, and record both parties’ signed document.
4. **Partnership Implementation** — obligations and deliverables from signed LoA, project/event realization, partner engagement, program report, actual financial and in-kind receipts, and supporting proof.
5. **Post Survey** — BD Post-Partnership Scorecard link dispatch/completion tracking, close-out checklist, and re-raise decision. A positive re-raise creates a new partnership cycle linked to the same partner.

A top-level stage is not a sales tactic, communication channel, meeting type, or individual checklist item. Those are substages, records, events, or status fields.

### Sales and partnership statuses must remain distinct

- `sales_type`: `NEW_SALES` or `RE_RAISE` (whether the organization is new or previously partnered).
- `sales_status`: `ACTIVE` or `INACTIVE` for the pre-experience sales attempt.
- `approach_method`: `ACTIVE` (AIESEC approaches) or `PASSIVE` (partner approaches AIESEC).
- `partnership_status`: `ACTIVE`, `BREAK`, or `FINISH` for an established/continued partnership, matching ESSM semantics.
- `re_raise_decision`: `YES`, `NO`, or `PLANNING_TO`.
- `essm_stage`: one of the five canonical top-level stages. Internal event/status values must not replace it.

## 3. ESSM classification and Market Research

### 3.1 Ten industry categories

Seed exactly these categories, preserving official labels as display labels:

1. Energy, Materials & Industrials
2. Health Care
3. Financial (Bank & Insurance)
4. Tech Company
5. FMCG & FnB
6. Communication Services
7. E-Commerce and Retail
8. Education
9. Consulting
10. Others

The CRM may store a normalized internal code, but the source label must be retained for workbook export/import. Do not use B2B, B2C, MSME, CSR, or similar operating strategies as an industry-category substitute.

### 3.2 ESSM Project Support values

Seed the following Project Support values, with original label retained for exports:

- oGX (Outgoing Exchange)
- iGV (Incoming Global Volunteer)
- Membership
- LV (Local Volunteer)
- AFL (AIESEC Future Leaders)
- Brand Activation
- BD Project
- LC Initiatives
- Others

Use the supplied workbook as the final dropdown/column-order authority during the implementation mapping task. Do not silently invent additional production dropdown values. New values require a configuration/data migration and mapping review.

### 3.3 Partnership Alignment

`MarketResearch` requires four scores, each an integer from 1 to 5, entered/confirmed by a human:

- `valuesScore`
- `visionScore`
- `currentFocusScore`
- `programScore`

The record also stores the research date, researcher, evidence/source URLs, the `Proceed` decision, and notes. AI can extract evidence and suggest questions but MUST NOT finalize or write the four ESSM scores or the Proceed decision on the user's behalf.

A separate `aiFitScore` (if enabled) is for ranking prospects and MUST never be presented as the ESSM Partnership Alignment Score. No hidden threshold may automatically make the `Proceed` decision. The product owner may configure a recommended review band, but the final decision stays human.

### 3.4 Partner and cycle model

`Partner` is the company/organization master record. `PartnershipCycle` represents a particular sales/partnership attempt for that partner, with the official stage, sales type, sales status, approach method, Project Support, and partnership status. A partner may have multiple cycles, including re-raise cycles; never overwrite the previous cycle's sales and outcome history.

Required contact data includes official company email (when available), PIC name, PIC email and phone/WhatsApp, the AIESEC PIC/owner, research date, source/provenance, contact-verification status, and `doNotContact` control.

## 4. Structured Rate Card, proposals, and contributions

Rate Card is an independent domain module, not text embedded in Proposal.

### Entities

- `RateCard`: versioned catalog with owner, currency, effective dates, and status.
- `RateCardItem`: benefit category, benefit name, monetized unit value, unit, active status, and version linkage.
- `RateCardPackage`: optional named template (e.g., Community, Brand, Engagement, Impact), listed price if approved, slot limits, version, and active status.
- `RateCardPackageBenefit`: package-to-benefit association including quantity and slot limit.
- `Proposal`: one proposal version for a partnership cycle, with pricing mode, currency, calculated proposed value, status, sent link, and immutable pricing snapshot.
- `ProposalBenefit`: the exact selected item/package line, quantity, agreed unit value, and derived line total captured at proposal time.
- `Contribution`: one side and one commitment/value record: AIESEC supply versus partner contribution/demand; supported forms include cash, in-kind product, voucher, service, content, performance-based and hybrid arrangements.
- `SnDAgreement`: structured final supply list, demand list, confirmation date/method and confirmation evidence/actors. It is a mandatory gate before LoA submission.

### Pricing rules

- Monetized values are editable only by the CRM Lead permission set. Initial seed values must be explicitly marked as proposed/unconfirmed until verified; never present examples as official national prices.
- Pricing calculations are deterministic domain logic and tested. They use active, effective catalog records and selected quantities; package and explicit benefit lines must not be double-counted.
- Store currency and pricing snapshot on the proposal so a catalog update cannot change a historical proposal.
- The proposed/calculated value is not actual revenue received and must never be written to actual revenue records automatically.
- No fixed deal approval threshold is implied. Custom proposals are allowed and must still record both parties' supply/demand.

### ESSM formula ambiguity

The supplied ESSM materials describe score inputs on a 0–5 scale for Rate Card monetization but at least one workbook-derived formula reference appears to divide a five-factor total by 15. Do not hard-code an inferred correction. Implement the raw input fields/configurable formulas only after comparing the live workbook formulas and obtaining product-owner/national-standard confirmation. Keep that formula as a release blocker for production Rate Card monetization.

## 5. Merchandise Tracker

Merchandise is an in-scope ESSM tracker and a separate domain from the partnership Rate Card.

`MerchandiseItem` includes item name, vendor/supplier URL, cost of goods sold (COGS) per unit, selling price, calculated profit per unit, quantity sold, total COGS, total revenue, total profit, and revenue-proof URL. `MerchandiseBundle` includes bundle name, bundle components/quantities, and bundle price. `MerchandiseRealization` stores a dated sales/realization record, quantity and proof where needed.

Derived values:

- `profitPerUnit = sellingPrice - cogsPerUnit`
- `totalCogs = cogsPerUnit × quantitySold`
- `totalRevenue = realizedSellingPrice × quantitySold` (use bundle-specific price/components when applicable)
- `totalProfit = totalRevenue - totalCogs`

Validate the treatment of discounts, returns, tax, and bundle component COGS before production accounting. Do not double-count merchandise sale income in the partnership financial/in-kind revenue tracker unless it is genuinely a separate partner contribution and has separate evidence.

## 6. Sales process, contact verification, and communication

### Outreach gate

Before an outreach message can be sent, the exact recipient and channel must be verified to the required level, the draft must pass deterministic linting, and a human must approve the exact text version. Approval stores actor, time, and a content hash. Any content/recipient/channel change invalidates the approval. All outgoing communication is sent by a human through the approved sender profile; no LLM worker has sending credentials or a send-capable tool.

- `INTERESTED`: continue to discovery.
- `NOT_INTERESTED`: close this approach with reason; preserve partner history.
- `NO_RESPONSE`: schedule only the configured maximum of three approved follow-up attempts and stop if a reply or do-not-contact state occurs.
- Other reply categories (e.g. requests for information) are recorded as reply subtype/task, not new top-level lifecycle stage.

AI can draft first-touch, follow-up, newsletter and greeting content. Every AI output is validated against schema, logged with model/provider/prompt version and sources, and reviewed by a person. No unsourced claim about a partner may be stated as fact.

### Sales meetings and MoM

Sales meetings remain human-led. Default maximum is two per cycle unless the CRM Lead increases the configuration. Every recorded meeting must have a final MoM using the official template structure: meeting metadata, attendance list, meeting location, meeting time/countdown, agenda/process rows with speakers and bullet points, meeting results, evidence screenshot reference, and signature status where required. AI may draft from a transcript; a staff user must review and finalize. Raw transcripts must have a documented retention/purge schedule and must not be stored in Git.

## 7. Close Deal and Letter of Agreement (LoA)

- Confirmed, mutually agreed SnD is required before a LoA draft can be submitted for approval.
- The system supports monetary/valued and non-monetary LoA templates. Voucher/product/in-kind cases with a monetized value use the monetary/valued template only when confirmed by the approved LoA rules; pure non-monetary collaboration uses the non-monetary template.
- LoA numbering is sequential per year and collision-safe. The exact number pattern remains configurable until the official local template owner confirms it.
- LoA is signed outside the system. Store draft/document link, approval history, signed document link, signature dates, submitter, and authorized signatories.
- The LoA submitter cannot approve their own LoA. TL BD and LCVP PD share permission to review/approve, but the separation-of-duties rule is absolute.
- Stage cannot advance to implementation without the approved and fully signed LoA record.

## 8. Partnership Implementation, actual revenue, and engagements

Implementation tracks the signed LoA obligations and the project/event period. Deliverable records should show expected commitment, owner, due date, evidence/status, and whether it is complete.

### Actual revenue

`RevenueRecord` stores actual receipt only:

- `revenueType`: Financial or In-Kind.
- Month, partner, Project Support/program, date received, numeric actual amount/value, details/items, proof URL, and recording user.
- In-kind records additionally classify `inKindType` as `Added Value` or `Cost Reduction` as appropriate.
- Required evidence link at the status that counts the record as verified/complete.
- Financial and in-kind totals are reported separately and together only with clear labels and currency/value methodology.

The system must never imply that a promised contribution, proposal valuation, merchandise sales, and received revenue are interchangeable.

### Mandatory and optional ESSM implementation activities

- Monthly partner newsletter during the active partnership: **mandatory**.
- Program/event realization report link when the event/program is finished: **mandatory**.
- Partner visit with evaluation/next collaboration/impact measurement recorded in MoM: optional under ESSM.
- Invitation to external-participation AIESEC events: optional under ESSM.
- Greeting cards: optional under ESSM.
- Impact Report timing target of seven working days is a product reminder/target only if the local program requires it; distinguish this from the ESSM mandatory realization-report link.

### Partner status

`ACTIVE`, `BREAK`, and `FINISH` describe the continuing partnership. They are not the same as pre-experience sales status. A break/finish requires date and reason when relevant; the historical cycle stays intact.

## 9. Post Survey and re-raise

Use the official BD Post-Partnership Scorecard URL: `https://s.aiesec.or.id/AIESECPartnershipSurvey-BD`. Initial implementation stores the canonical URL, dispatch date/by whom, completion confirmation/status, follow-up reminder and any formally authorized waiver with reason. Do not store or scrape responses unless national owners authorize a supported integration.

The ESSM materials describe the survey in the post-experience portion and also refer to spreading it during implementation. Use stage 5 `Post Survey` as the CRM lifecycle stage; configure dispatch trigger based on confirmed current national guidance and document the operational timing. Until clarified, the default trigger is program completion/report submission, while dispatch earlier during implementation remains an allowed explicit action with audit trail.

When survey and close-out requirements are handled, record `Re-Raise = YES / NO / PLANNING_TO`. `YES` creates a new cycle linked to the same Partner; `NO` closes the renewal decision; `PLANNING_TO` requires a review date. Never overwrite the previous cycle.

## 10. Import, export, reports and data governance

- Support a one-time/multi-batch import from the existing national ESSM workbook using a preview, exact column map, row-level validation/error report, deduplication and an idempotent import ledger.
- Export to the workbook's approved column order, preserving official dropdown labels and dates. Compare export against a synthetic golden file before launch.
- The source workbook must not be committed. The implementation must produce a data mapping manifest/version rather than hard-coding unknown column indices throughout application code.
- Reports include the five-stage pipeline, alignment score distribution, source/contact verification, sales status, proposals and calculated value, signed partnerships, deliverables, actual financial/in-kind receipts with proof status, merchandise profit, monthly engagement compliance, survey completion and re-raise decisions.
- All exports are permission-checked and audited. Sensitive notes (e.g. internal negotiation limit/BATNA) must be kept out of partner-facing exports and viewer roles.

## 11. Roles and permissions

| Permission set | Assigned to | Capabilities |
|---|---|---|
| `CRM_LEAD` | TL BD and LCVP PD | Same CRM permission set: perform staff workflows and support staff; read/update partner and cycle records; manage users/config/quotas and AI controls; configure industry/Project Support mapping; edit Rate Card and package prices; view all dashboards; approve LoA if not submitter; authorize documented gate waivers |
| `BD_STAFF` | BD staff/PICs | Work assigned research/cycles, create/edit outreach, approve their own exact outbound content, log replies/meetings/MoM/SnD, prepare proposals and LoA, implement deliverables, record receipts/evidence, engagement, survey and re-raise; read partner master/history as permitted |
| `VIEWER` | Optional named audit/transition users | Read-only approved records and reports only; disabled until explicitly enabled |

TL BD and LCVP PD are equivalent for application authorization; the organizational level difference does not translate into reduced CRM permissions. A CRM Lead can help a staff member by taking ownership/working on an assigned item. Approval actor identity is always logged. Separation of duties, do-not-contact and gate invariants apply equally to both lead roles.

All access starts from a Google-authenticated email allowlist. Server-side authorization is mandatory on every page/API/action/job/Companion route. An inactive user immediately loses access and tokens.

## 12. Functional requirement groups

Each requirement will become a tracked ticket with tests. Keep these groups stable unless the product owner approves a change.

| ID prefix | Group | Minimum acceptance result |
|---|---|---|
| FR-100 | Auth, CRM Lead roles, allowlist, audit, config | Unauthorized access rejected server-side; TL BD/LCVP PD policy matrix is identical; self-approval blocked |
| FR-200 | Partner, contact, cycle and dedupe | Partner master persists; multiple cycles preserve history; contact provenance and DNC are enforced |
| FR-300 | ESSM prospecting and Market Research | Correct category/program fields; source URL and human scoring/Proceed validation; audit trail |
| FR-400 | Outreach and contact verification | Exact recipient/channel verification + lint + text hash approval; max-three follow-up rule; no auto-send for LinkedIn/WhatsApp |
| FR-500 | Rate Card, proposal, discovery, meeting, MoM, SnD | Rate Card is structured; proposal snapshot and total calculation deterministic; final MoM and confirmed SnD gates work |
| FR-600 | LoA and close deal | Correct template, sequential unique number, independent approval, signed link required |
| FR-700 | Implementation, deliverables, financial/in-kind revenue | Actual receipts separated by type and evidence; mandatory report gate; stage/status modeled separately |
| FR-750 | ESSM merchandise tracker | Item, vendor, COGS, selling price, quantity, bundles, formula totals/profit and evidence tested; no double counting |
| FR-800 | Engagement, Post Survey and re-raise | Mandatory monthly newsletter tracking, optional engagement types, official survey URL, status tracking, new cycle for re-raise |
| FR-850 | ESSM import/export | Dry-run preview, row errors, idempotency, column mapping version, golden-file test; no real workbook in Git |
| FR-900 | Dashboards, handover, reporting | Metrics trace to domain rows, export is permission-checked/audited, handover list is complete |
| FR-950 | AI jobs, model adapter, Companion safety | Structured outputs, source grounding, model usage/cost logs, hard caps, stop-on-warning, no send tool/credentials in worker |

Full functional behavior and acceptance cases are expanded in epic specs under `.kiro/specs/` and `docs/IMPLEMENTATION_PLAN.md`.

## 13. Recommended technical architecture

Initial architecture should remain intentionally simple and modular:

- TypeScript strict mode, Next.js App Router for authenticated web UI and server actions/API.
- PostgreSQL for operational data, migrations, audit log, idempotent job queue and relational constraints.
- Drizzle ORM (or a replacement only through an ADR) with SQL migrations reviewed independently.
- `packages/core` for domain policies, lifecycle transition guards, pricing calculations, permissions and deterministic linter.
- `packages/db` for schema, access layer and migration utilities.
- `packages/ai` for model-provider adapter, prompts, schema validators, prompt versioning and regression evals.
- `apps/worker` for bounded jobs. AI worker has no outbound messaging credentials or send tools.
- `apps/companion` (Chrome Manifest V3) is only implemented after safe/legal research workflow has been reviewed; it is read-only/assisted and bounded. If platform terms or policy risk cannot be controlled, deliver a manual evidence/contact-entry workflow instead of browser automation.
- `packages/docs` for DOCX export using approved/tagged copies of MoM and LoA templates.
- pnpm workspace, Biome, TypeScript, Vitest, Playwright, and CI.

Keep integrations behind adapters. Deployment target, live data region, SMTP/Gmail OAuth, model provider and paid-plan constraints must be verified in ADRs before production. A zero-cost plan is not assumed to meet privacy, availability, or data-retention needs.

## 14. AI and agent design

### Development-agent models vs product-runtime models

These are separate concerns. Models that developers use inside ZCode IDE or Hermes are coding assistants and are not automatically product-runtime models. The application must not depend on local IDE logins or on these tools being installed on staff machines.

Product runtime must use an explicit provider adapter configured by environment variables, with model ID and provider validated in staging. The user has indicated access to GLM-5.3 and GLM-5.3-Flash in ZCode IDE; that does not by itself establish API endpoint access or runtime licensing. Choose a runtime model only after a provider smoke test, cost test, and Indonesian-language/structured-output evaluation.

### Human-control rules

1. AI outputs are drafts with provenance, model ID, prompt version, source references, token counts and error/cost metadata.
2. AI may propose prospect ranking, but humans enter ESSM alignment scores and `Proceed`.
3. LLM is not authorized to execute state changes without domain guards; tool calls to send messages, approve LoA, sign, waive gates or edit actual revenue are forbidden.
4. Output JSON is parsed and validated; one bounded repair attempt is allowed, then fail closed into a review queue.
5. Prompt injection in imported documents/websites/transcripts is treated as untrusted content.
6. Quality is enforced by golden examples, source-grounding evals, linter tests, and human approvals rather than model claims.

## 15. Security, privacy and operational constraints

- Private GitHub repository. No real contact/partner data, secrets, transcripts, signed contracts, actual workbook or exports in Git/CI artifacts/issues.
- Google OAuth + allowlist, secure HttpOnly cookies, CSRF protection where relevant, rate limits, session revocation, least-privilege service credentials, role matrix tests.
- Append-only audit log: actor, timestamp, entity, action, before/after metadata; avoid storing unnecessary PII in logs.
- Contact source, verification, purpose/lawful-basis note, DNC status, retention/erase request. Do not claim all contacts are consented merely because they appear in a source.
- Encrypt database/backups where supported; restrict production access; document breach response and restore procedure.
- Raw transcripts are minimized and purged on a configured schedule; provide deletion evidence without retaining transcript body.
- Companion stops on CAPTCHA, login/security checkpoint, warning or restriction. Never bypass controls or automate prohibited access. Manual workflow is fallback.
- All gate waivers require a named authorized lead, reason, timestamp, and audit event.

## 16. Delivery approach and definition of done

Deliver incrementally: M0 foundation; M1 domain/ESSM core; M2 research/outreach; M3 sales/close deal; M4 implementation/revenue/merchandise; M5 engagement/post survey/import-export/reports; M6 security/UAT/hand-over. The full order and non-overlapping file ownership are in `docs/IMPLEMENTATION_PLAN.md`.

A requirement is complete only when: acceptance criteria pass; negative and authorization cases pass; migration and rollback/backfill are considered; audit behavior is tested; docs are updated; synthetic UAT passes; no real data/secrets are present; and an independent developer reviews the change.

## 17. Open decisions / release blockers

Track each item in `docs/DECISIONS.md`; do not block safe work that can be built behind configuration.

- Confirm the ESSM Rate Card scoring formulas against the live workbook; apparent denominator inconsistency must not be hard-coded.
- Confirm exact workbook column positions, sheet names and dropdown codes during the mapping spike. The workbook is the authority for export.
- Confirm the current survey dispatch timing with the national ESSM owner; CRM lifecycle remains Stage 5 Post Survey.
- Confirm exact LoA numbering pattern, signatory labels and approved DOCX templates.
- Confirm transcript purge duration and participant notice wording.
- Confirm provider/runtime API access separately from the coding-assistant models.
- Confirm hosting region, legal/privacy review, backup destination, budget and service terms before production.
- Confirm Catalna’s actual GitHub handle before inviting/adding her to `CODEOWNERS`.
