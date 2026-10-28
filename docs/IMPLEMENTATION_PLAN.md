# Implementation Plan and Issue Backlog

Work strictly in order unless product owner authorizes a dependency-aware reorder. Each row is an issue template: create one GitHub Issue per task. Keep FR IDs in issue title and PR.

## M0 — Repository and platform foundation

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M0-01 | Bootstrap private GitHub repo and invite team | Target repo private under `muhammadghiffari`; `hicesse` invitation issued; Catalna handle captured before invite | Muhammad |
| M0-02 | Create pnpm TypeScript monorepo | `apps/web`, `apps/worker`, optional `apps/companion`, `packages/core`, `db`, `ai`, `docs`, `config`; reproducible install | hicesse |
| M0-03 | CI baseline and code quality | Lint, typecheck, unit test, diagram validation and dependency audit are required on PR | Catalna |
| M0-04 | Environment/config contract and secrets policy | `.env.example` has placeholders only; startup validation; no secrets in CI output | hicesse + Muhammad review |
| M0-05 | Auth foundation and central RBAC policy (FR-100) | Google sign-in + email allowlist; inactive users denied; server-side role matrix; TL BD/LCVP PD identical CRM Lead permissions | Muhammad |
| M0-06 | Append-only activity log and audit service | Every mutation/gate waiver has actor, action, entity, timestamp; append-only tested | Muhammad |

## M1 — Core ESSM partner/cycle model

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M1-01 | DB schema and migrations for diagram entities | Entities/relationships conform to fixed Class Diagram; schema-lock review and rollback notes | Muhammad |
| M1-02 | Seed ten industry categories and Project Support | Codes + original labels seeded idempotently; no legacy vertical taxonomy | hicesse |
| M1-03 | Partner/contact CRUD and dedupe (FR-200) | Partner master, contacts, source/provenance, verified status, DNC, search/dedupe | Catalna |
| M1-04 | PartnershipCycle + lifecycle API | Five-stage enum, distinct sales/partnership statuses, historic cycles retained | Muhammad |
| M1-05 | ESSM Market Research form/gate (FR-304) | Four required scores integer 1–5, evidence, human Proceed decision; AI fit score separate | Catalna |

## M2 — Prospecting and outreach

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M2-01 | Criteria and prospecting record workflow (FR-300–308) | Criteria version snapshot; sourced evidence; review/accept/reject; idempotent jobs and quotas | hicesse |
| M2-02 | Contact verification and enrichment boundary (FR-309–310) | Provenance/source tier and contact/channel verification; no unreviewed scraping | hicesse |
| M2-03 | AI adapter and research evals (FR-950) | Provider config externalized; typed output, sources, cost/latency logs, injection fixtures | hicesse; Muhammad review |
| M2-04 | Outreach draft linter and approval hash (FR-400–403) | deterministic lint; text/recipient/channel mutation invalidates approval; no DNC draft/send | Muhammad |
| M2-05 | Assisted send UX and response statuses (FR-404–408) | verified recipient + approved exact text; LinkedIn/WhatsApp require human send; max 3 follow-ups; stop on reply | Catalna |

## M3 — Sales process and close deal

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M3-01 | Structured Rate Card entities and catalog UI (FR-500) | Versioned catalog/items/benefit categories; edit rights limited to CRM Leads | Muhammad |
| M3-02 | Packages, ProposalBenefit, pricing snapshots (FR-501–503) | deterministic total calculation; snapshot unaffected by later rate changes; no package/benefit double counting | Muhammad + independent review |
| M3-03 | Discovery, meetings and final MoM export (FR-504–506) | max meetings config; structured official MoM; finalization gate; transcript retention | Catalna |
| M3-04 | Supply & Demand agreement and fit outcome (FR-507–510) | structured both-side commitments; confirmation method/date; cannot draft LoA before confirmed SnD | Muhammad |
| M3-05 | LoA templates, numbering, approval and signing (FR-600) | monetary/valued + non-monetary; sequential unique number; self-approval blocked; signed link required | Muhammad + Catalna review |

## M4 — Partnership implementation, revenue and merchandise

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M4-01 | Signed LoA starts realization project | Cannot open active implementation without fully signed LoA; deliverables mirror obligations | Catalna |
| M4-02 | Revenue Financial/In-Kind tracking (FR-700) | separate actual receipt records, month/program/date/value/items/proof, source and audit | Muhammad |
| M4-03 | Mandatory report gate and working-day reminder | finish is blocked without report URL; distinguish ESSM report from optional Impact Report target | hicesse |
| M4-04 | Merchandise Tracker (FR-750) | entity model, items/vendors/bundles/sales, derived COGS/revenue/profit formulas and proof links | hicesse + Muhammad review |
| M4-05 | Financial formula and duplicate-revenue tests | rate-card value, actual partner revenue and merchandise sales cannot be confused/double-counted | Muhammad |

## M5 — Engagement, Post Survey, ESSM import/export and reports

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M5-01 | Partner engagement calendar/log (FR-800) | newsletter monthly mandatory while active; visit/invite/greeting optional with MoM where required | Catalna |
| M5-02 | Official survey URL and tracking | canonical URL seeded; dispatch and response/completion status tracked; no response-content integration without approval | Catalna |
| M5-03 | Re-raise creates a new cycle | `YES` creates new linked cycle; `NO` closes decision; `PLANNING_TO` requires review date | Muhammad |
| M5-04 | ESSM import preview + mapping contract (FR-850) | local workbook; row validation/errors; idempotency; no workbook tracked/committed | hicesse |
| M5-05 | ESSM export in exact order + golden file | authorized workbook mapping verified; totals/checksums/synthetic fixture match expected output | hicesse + independent review |
| M5-06 | Dashboard, handover report and exports | permission-controlled; every export audit logged; metrics derived from data | Catalna |

## M6 — Hardening, UAT and handover

| Issue | Task | Acceptance criteria | Owner suggestion |
|---|---|---|---|
| M6-01 | Full authz matrix and security review | Every route/action/job and user state tested, including shared CRM Lead policy and self-approval refusal | Muhammad + second reviewer |
| M6-02 | AI golden evals and cost budget | Indonesian/English outreach, no unsupported claims, schema validity, injection and DNC tests | hicesse + second reviewer |
| M6-03 | Backup/restore and incident runbook | encrypted backup, restore drill evidence, rotation/access procedure | hicesse |
| M6-04 | Accessibility, performance, and browser E2E | WCAG core checks; agreed synthetic golden path and failed-gate tests pass | Catalna |
| M6-05 | Privacy/product-owner UAT and deployment ADR | data region/provider terms, retention, contact basis, participant notice, costs approved | Muhammad |
| M6-06 | Release and term-handover package | RUNBOOK, HANDOVER, migrations, seeds, exports and unresolved blockers documented | All; Muhammad sign-off |

## Gate to start production

No production data or outbound sends until M0/M1 security, the relevant sales gates, an approved hosting/provider ADR, backup restore, privacy review, verified workbook mapping, and human-in-loop tests pass. A working development preview is not production approval.
