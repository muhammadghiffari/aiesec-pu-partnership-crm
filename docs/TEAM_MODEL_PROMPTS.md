# Team Model & Prompt Playbook (v1.0)

**Purpose.** Every implementation/review prompt has a named owner, a concrete model choice, a reasoning-effort target, a Kiro workflow mode where applicable, a reviewer, and a bounded acceptance target. Model choice is set in the host UI/CLI before pasting the prompt; prose cannot force the harness to switch model or effort.

## 1. Important: secure the current Kiro session first

The current CLI was launched with `--trust-all-tools`, which disables tool confirmations. Exit that session with `/quit` and relaunch without that flag before running GitHub creation/push/invite operations:

```bash
cd ~/projects/aiesec-pu-partnership-crm
kiro-cli --v3 chat
```

Allow Kiro to ask for confirmation when it performs material external actions. Do not use `--trust-all-tools` for bootstrap, credentials, migration, deployment or any command that changes remote state.

## 2. How to set model, effort and mode

- In Kiro CLI V3, run `/model`, choose the exact model in the picker, and use its **Thinking/Effort** controls if available. `/effort medium` or `/effort high` changes the current session when that level is supported. Do not assume every model supports every level.
- Kiro V3 Plan mode is separate from model effort. Toggle Plan mode with `Shift+Tab` for read-only inspection/plan; review it, then switch to Default mode for bounded execution.
- The user's Kiro picker multipliers are relative to Auto=1.00x and may change: Qwen3 Coder Next 0.05x; MiniMax M2.5 0.25x; GLM-5 0.50x; Claude Sonnet 5.5 1.30x; Claude Opus 5.5 2.00x; GPT-5.6 Terra 2.20x; GPT-5.6 Sol 4.40x; other user-provided entries in `docs/AI_MODEL_ROUTING.md`. Verify the actual picker before choosing; these are user-observed values, not guarantees.
- For ZCode and Hermes, choose the named model shown by that host. Set its High/Reasoning setting only if the host exposes it. If no effort control exists, use the listed model, narrow file scope, tests and reviewer; never claim a setting was set when it is unavailable.
- High-risk logic (authorization, life-cycle gates, LoA separation of duties, pricing, actual revenue, data import/erasure) must not be implemented or approved solely by the cheapest model. Use a stronger model and independent reviewer.
- Escalate after two failed attempts, contradictory behavior, unexplained test failures or any untested high-impact invariant. Save credits by reducing scope and context, not by lowering the quality bar.

## 3. Developer profiles and model routing

### A. Muhammad Ghiffari — owner/architecture/domain

- **Kiro CLI:** MiniMax M2.5 (0.25x), Medium for repository bootstrap and small routine work; Qwen3 Coder Next (0.05x), Low/Medium only for bounded validation/status/formatting; GLM-5 (0.50x), Medium for ordinary implementation if available; Claude Sonnet 5.5 (1.30x), High for architecture integration, difficult debugging and serious review; Claude Opus 5.5 (2.00x), XHigh only for unresolved, high-risk reasoning. GPT-5.6 Terra/Sol are escalation alternatives, not routine defaults.
- **ZCode IDE:** GLM-5.3-Flash, Medium for docs, repetitive UI scaffolding and small test/fixture changes; GLM-5.3, High for schema, lifecycle, RBAC, approval integrity, Rate Card and money calculations.
- **Owns:** decisions, shared schema lock, authorization and domain invariants, formula sign-off, merge/release. Do not edit the same files concurrently with another developer.

### B. Catalna — web UI/product flows/testing

- **ZCode:** GLM-5.3-Flash, Medium for scoped forms/CRUD/accessibility polish; GLM-5.3, High for complex multi-component state, gated workflows, browser E2E or ambiguous integration.
- **ChatGPT/OpenAI:** for independent reviews of sensitive PRs, choose the strongest reasoning/coding model currently available in her model picker, set High/maximum appropriate reasoning if exposed, and review the diff rather than re-implementing it. The exact OpenAI model list was not supplied, so this playbook does not invent a model alias.
- **Owns:** accessible UI, dashboard, user flows, Playwright/browser checks. Never treat hiding a button as server-side authorization.

### C. hicesse — Hermes worker/AI/import/export/ops

- GLM-5.3-Flash, Medium for seed data, docs, small jobs/CRUD and routine fixtures.
- DeepSeek-V4.1-Flash-1017, Medium for routine worker/provider tasks and High for complex AI adapter, source-grounding, evaluation and import/export logic. Use the checkpoint/alias actually exposed by Hermes.
- GLM-5.3, High for complex multi-file code and business-sensitive worker logic. Kimi-K3, High, for long-context/independent review only when needed. Nemotron-3.5-Super-VL-120B-A12B is for screenshot/visual inspection, not normal code authoring.
- **Owns:** worker/AI adapter/evaluations, import/export tooling, scheduled jobs, technical runbooks. Worker must never receive partner-send credentials.

## 4. Mandatory prompt skeleton

Use this structure in any host if a particular issue card below is not present:

```text
Read AGENTS.md and only the referenced PRD/spec sections for this issue.
Implement only the named issue/FR and the files in scope. Do not edit another developer's active branch or introduce a second schema implementation.
Preserve the fixed ESSM-aligned diagram and all existing gates. Add passing success, negative, authorization and failure-path tests appropriate to the risk. Never weaken/remove tests to make CI green.
Run focused tests first, then the project checks available. Report changed files, exact commands/results, migration/security impact and unresolved decisions. If a material business rule is unclear, document it in docs/DECISIONS.md and stop before hard-coding it.
```

## 5. Ready-to-paste task cards

Run only one task card per owner/branch/PR. Model and effort are listed before the prompt so the human can set them in the correct UI first.

### M0-01 — Bootstrap private GitHub repository

- **Owner:** Ghiffari
- **Model:** Kiro CLI · MiniMax M2.5 (0.25×)
- **Effort:** Medium
- **Workflow mode:** Plan for preflight, then Default for execution
- **Independent review:** Ghiffari verifies output manually
- **Read:** `AGENTS.md; README.md; docs/DEVELOPER_WORKFLOW.md; scripts/bootstrap-github.sh`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-01: Bootstrap private GitHub repository.
Read only: AGENTS.md; README.md; docs/DEVELOPER_WORKFLOW.md; scripts/bootstrap-github.sh.
Verify GitHub CLI identity is exactly `muhammadghiffari`, required permissions and Git identity, and that the remote does not exist. Inspect the bootstrap script and current tree before side effects. Execute `scripts/bootstrap-github.sh` only after preflight is clean. Keep the repository private; invite `hicesse` with write access; do not guess Catalna’s handle. Report exact URL, commit, remote, and invitation result from command output.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M0-02 — Create pnpm TypeScript monorepo scaffold

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: Kiro MiniMax M2.5, Medium
- **Read:** `AGENTS.md; docs/PRD.md §13–16; .kiro/specs/E0-foundation/{requirements,design,tasks}.md`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-02: Create pnpm TypeScript monorepo scaffold.
Read only: AGENTS.md; docs/PRD.md §13–16; .kiro/specs/E0-foundation/{requirements,design,tasks}.md.
Implement only M0-02. Create the specified pnpm workspace and package boundaries, strict TypeScript configuration, and minimal runnable health path. Do not implement feature workflows or add dependencies without need. Add a smoke test for workspace/package resolution, run install and scaffold checks, and open a focused PR with exact commands/results.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M0-03 — CI baseline and quality checks

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: Kiro Qwen3 Coder Next, Low/Medium for bounded review
- **Read:** `AGENTS.md; .github/workflows/ci.yml; docs/TESTING_UAT.md`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-03: CI baseline and quality checks.
Read only: AGENTS.md; .github/workflows/ci.yml; docs/TESTING_UAT.md.
Implement only M0-03. Configure CI to install from the lockfile and run formatting, lint, typecheck, unit tests, handover/XML validation and dependency audit when the corresponding scripts exist. Make failures actionable, avoid printing secrets, and verify with a local run plus a deliberately failing test in a temporary/uncommitted check if feasible. Do not silently skip absent scripts; document scaffold dependencies.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M0-04 — Environment/config contract and secrets policy

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; .env.example; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-04: Environment/config contract and secrets policy.
Read only: AGENTS.md; .env.example; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/.
Implement only M0-04. Define typed startup config validation for database, auth, LLM adapter and app runtime, with safe placeholder values only. Add no real secret, never echo secret values in logs or errors, and test missing/malformed required variables plus safe development defaults. Keep app-runtime model configuration separate from coding-agent model names.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M0-05 — Authentication foundation and server-side RBAC

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT, strongest available reasoning model, High for independent review
- **Read:** `AGENTS.md; docs/PRD.md auth/RBAC requirements; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-05: Authentication foundation and server-side RBAC.
Read only: AGENTS.md; docs/PRD.md auth/RBAC requirements; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/.
Implement only M0-05. Build Google sign-in/identity boundary and email allowlist with server-side authorization. TL BD and LCVP PD must map to the same CRM Lead permission set; do not infer access from organizational title. Deny inactive/non-allowlisted users by default. Add positive and negative tests for each role/action and session state; do not implement UI-only authorization.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M0-06 — Append-only audit service

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** hicesse: Hermes Kimi-K3, High if available
- **Read:** `AGENTS.md; docs/PRD.md audit requirements; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/`

**Prompt (paste after setting the model/effort):**

```text
Work on M0-06: Append-only audit service.
Read only: AGENTS.md; docs/PRD.md audit requirements; docs/SECURITY_PRIVACY.md; .kiro/specs/E0-foundation/.
Implement only M0-06. Add an append-only audit service for material mutations, approvals, exports and gate overrides with actor, action, entity, timestamp and safe metadata. Prevent update/delete through application policy and test unauthorized access, mutation capture, and required reason/authorization on overrides. Do not log contact PII, prompts, secrets or complete partner records.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M1-01 — Schema and migrations for diagram entities

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/DATA_MODEL.md; fixed diagram; .kiro/specs/E1-core-essm/`

**Prompt (paste after setting the model/effort):**

```text
Work on M1-01: Schema and migrations for diagram entities.
Read only: AGENTS.md; docs/DATA_MODEL.md; fixed diagram; .kiro/specs/E1-core-essm/.
Implement only M1-01. Translate the fixed Class Diagram into normalized PostgreSQL tables, foreign keys, unique constraints and typed reversible migrations. Preserve the diagram’s entities and cardinalities, including Partner/Contact/PartnershipCycle, RateCard/benefit/package snapshots, financial and in-kind revenue, merchandise and survey tracking. Do not combine distinct records merely to simplify schema. Provide migration, rollback/backfill notes and cardinality/integrity tests. Mark schema-lock.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M1-02 — Seed ESSM industry and Project Support values

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3-Flash, Low/Medium
- **Read:** `docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; AGENTS.md`

**Prompt (paste after setting the model/effort):**

```text
Work on M1-02: Seed ESSM industry and Project Support values.
Read only: docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; AGENTS.md.
Implement only M1-02. Create versioned/idempotent seed data for the ten ESSM BD industry groups and authorized ESSM Project Support values exactly as documented. Keep original labels and codes stable; do not add B2B/B2C/MSME vertical taxonomy. Include tests for count, exact labels, idempotency and invalid category rejection.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M1-03 — Partner/contact CRUD, search and deduplication

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/PRD.md partner/contact requirements; docs/DATA_MODEL.md; .kiro/specs/E1-core-essm/`

**Prompt (paste after setting the model/effort):**

```text
Work on M1-03: Partner/contact CRUD, search and deduplication.
Read only: AGENTS.md; docs/PRD.md partner/contact requirements; docs/DATA_MODEL.md; .kiro/specs/E1-core-essm/.
Implement only M1-03 UI and API integration. Build accessible partner/contact list, detail, create/edit, source/provenance, verification and do-not-contact state, with server-side authorization and safe duplicate warnings. Use synthetic fixtures only. Include loading, empty, validation, denied and error states plus component/API tests; don’t duplicate domain validation in the UI.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M1-04 — PartnershipCycle and five-stage lifecycle API

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/PRD.md lifecycle; docs/DATA_MODEL.md; fixed diagram`

**Prompt (paste after setting the model/effort):**

```text
Work on M1-04: PartnershipCycle and five-stage lifecycle API.
Read only: AGENTS.md; docs/PRD.md lifecycle; docs/DATA_MODEL.md; fixed diagram.
Implement only M1-04. Add explicit five-stage lifecycle enum and validated transition service for Prospecting → Sales Process → Close Deal → Partnership Implementation → Post Survey. Keep Sales Status, Approach Method, partnership Active/Break/Finish and Re-Raise decision as separate dimensions, not extra stages. Add transition matrix tests, forbidden-transition tests and audit events.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M1-05 — ESSM Market Research form and proceed gate

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High
- **Read:** `docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; AGENTS.md; .kiro/specs/E1-core-essm/`

**Prompt (paste after setting the model/effort):**

```text
Work on M1-05: ESSM Market Research form and proceed gate.
Read only: docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; AGENTS.md; .kiro/specs/E1-core-essm/.
Implement only M1-05. Build the Market Research form for human Values, Vision, Current Focus and Program scores, each integer 1–5, evidence/source links, and a required human Proceed decision. Keep any AI prospect-fit score separate. Enforce validation server-side and add boundary, missing-score, missing-evidence and proceed/not-proceed tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M2-01 — Prospecting criteria and research job workflow

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** Medium/High
- **Workflow mode:** Plan for workflow, then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/PRD.md; docs/ARCHITECTURE.md; .kiro/specs/E2-sales-outreach/`

**Prompt (paste after setting the model/effort):**

```text
Work on M2-01: Prospecting criteria and research job workflow.
Read only: AGENTS.md; docs/PRD.md; docs/ARCHITECTURE.md; .kiro/specs/E2-sales-outreach/.
Implement only M2-01. Add criteria snapshots, queued research jobs, per-staff quotas, idempotency and job state/retry handling. Require source URLs for research evidence; keep generated results as drafts for human review. Add tests for quota caps, duplicate jobs, retry safety, missing sources and job failure. Never send communications from the worker.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M2-02 — Contact verification and enrichment boundary

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High
- **Read:** `AGENTS.md; docs/SECURITY_PRIVACY.md; docs/PRD.md contact sourcing; .kiro/specs/E2-sales-outreach/`

**Prompt (paste after setting the model/effort):**

```text
Work on M2-02: Contact verification and enrichment boundary.
Read only: AGENTS.md; docs/SECURITY_PRIVACY.md; docs/PRD.md contact sourcing; .kiro/specs/E2-sales-outreach/.
Implement only M2-02. Represent candidate contact, source/provenance, verification status and verified channel distinctly. Reject outreach readiness when recipient/channel is unverified or DNC applies. Do not implement bulk scraping, automated connection requests or bypasses of site terms. Add trust-boundary tests and document provider limitations.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M2-03 — AI adapter and grounded-output evaluation

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High; Ghiffari signs off
- **Read:** `AGENTS.md; docs/ARCHITECTURE.md; docs/SECURITY_PRIVACY.md; .kiro/specs/E2-sales-outreach/`

**Prompt (paste after setting the model/effort):**

```text
Work on M2-03: AI adapter and grounded-output evaluation.
Read only: AGENTS.md; docs/ARCHITECTURE.md; docs/SECURITY_PRIVACY.md; .kiro/specs/E2-sales-outreach/.
Implement only M2-03. Create a provider-neutral LLM adapter driven by environment config, schema-validated outputs, timeout/retry/cost/latency metadata and mocked tests. Add evaluation fixtures for source grounding, Indonesian formal outreach, malformed output, prompt injection and DNC. Keep API keys outside logs and model context; worker must have no send credentials/tools.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M2-04 — Outreach linter and immutable approval hash

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/PRD.md outreach gates; docs/SECURITY_PRIVACY.md; .kiro/specs/E2-sales-outreach/`

**Prompt (paste after setting the model/effort):**

```text
Work on M2-04: Outreach linter and immutable approval hash.
Read only: AGENTS.md; docs/PRD.md outreach gates; docs/SECURITY_PRIVACY.md; .kiro/specs/E2-sales-outreach/.
Implement only M2-04. Build deterministic lint and an approval record bound to exact message text, recipient and channel. Any mutation after approval must invalidate it. Deny approval/send when DNC applies or contact/channel is not verified. Add tampering, wrong-recipient, wrong-channel, post-approval-edit, stale-hash and unauthorized-approval tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M2-05 — Assisted-send UX and response statuses

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High
- **Read:** `AGENTS.md; docs/PRD.md outreach requirements; .kiro/specs/E2-sales-outreach/`

**Prompt (paste after setting the model/effort):**

```text
Work on M2-05: Assisted-send UX and response statuses.
Read only: AGENTS.md; docs/PRD.md outreach requirements; .kiro/specs/E2-sales-outreach/.
Implement only M2-05. Build a human-assisted send experience where users see the approved exact content and open prefilled WhatsApp/LinkedIn delivery without auto-send. Capture Interested, Not Interested and No Response outcomes; schedule no more than three approved follow-ups and stop immediately when a reply arrives. Include keyboard accessibility and gate/error tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M3-01 — Versioned Rate Card and benefit catalog

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; fixed diagram; .kiro/specs/E3-ratecard-sales-close/`

**Prompt (paste after setting the model/effort):**

```text
Work on M3-01: Versioned Rate Card and benefit catalog.
Read only: AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; fixed diagram; .kiro/specs/E3-ratecard-sales-close/.
Implement only M3-01. Create first-class versioned RateCard, RateCardItem/Benefit and benefit-category records with editable monetized values and effective dates. Enforce CRM Lead permissions and preserve historic versions. Do not store the catalog in Proposal.content. Add version/effective-date/permission tests and leave unresolved ESSM formula discrepancies documented, not hard-coded.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M3-02 — Packages, ProposalBenefit and pricing snapshots

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** hicesse: Hermes Kimi-K3, High; Catalna reviews UI
- **Read:** `AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; .kiro/specs/E3-ratecard-sales-close/`

**Prompt (paste after setting the model/effort):**

```text
Work on M3-02: Packages, ProposalBenefit and pricing snapshots.
Read only: AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; .kiro/specs/E3-ratecard-sales-close/.
Implement only M3-02. Build optional package templates and proposal line items referencing rate-card benefits while snapshotting agreed name, unit value, quantity, currency and line total. Test rounding/IDR integer rules, package edits, catalog version changes, duplicate benefits and totals. Historical proposals must not change when the live catalog changes.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M3-03 — Sales meetings and official MoM export

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `docs/DATA_MODEL.md; docs/PRD.md meeting/MoM; .kiro/specs/E3-ratecard-sales-close/`

**Prompt (paste after setting the model/effort):**

```text
Work on M3-03: Sales meetings and official MoM export.
Read only: docs/DATA_MODEL.md; docs/PRD.md meeting/MoM; .kiro/specs/E3-ratecard-sales-close/.
Implement only M3-03. Build meeting scheduling and transcript-to-draft MoM workflow using the official template structure. A human must finalize the MoM; meeting round limits are configurable and every finalized meeting has its own MoM record/link. Treat transcripts as untrusted content and apply retention rules. Add template-shape and state-gate tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M3-04 — Structured Supply and Demand agreement gate

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/PRD.md SnD; docs/DATA_MODEL.md; .kiro/specs/E3-ratecard-sales-close/`

**Prompt (paste after setting the model/effort):**

```text
Work on M3-04: Structured Supply and Demand agreement gate.
Read only: AGENTS.md; docs/PRD.md SnD; docs/DATA_MODEL.md; .kiro/specs/E3-ratecard-sales-close/.
Implement only M3-04. Model both sides’ supply and demand as structured commitments and require recorded human confirmation, date and evidence before LoA drafting. Support cash, in-kind, voucher, service, content exchange and hybrid commitments. Add tests for incomplete/mismatched SnD, unauthorized confirmation, audit and valid transition.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M3-05 — LoA templates, sequence, approval and signing record

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High; owner sign-off required
- **Read:** `AGENTS.md; docs/PRD.md LoA; docs/SECURITY_PRIVACY.md; .kiro/specs/E3-ratecard-sales-close/`

**Prompt (paste after setting the model/effort):**

```text
Work on M3-05: LoA templates, sequence, approval and signing record.
Read only: AGENTS.md; docs/PRD.md LoA; docs/SECURITY_PRIVACY.md; .kiro/specs/E3-ratecard-sales-close/.
Implement only M3-05. Generate the monetary/valued or non-monetary LoA draft from confirmed SnD and the appropriate template, assign a unique sequential per-year number, record approval, signed-document link and timestamps. Enforce separation of duties: submitter can never approve their own LoA. E-signature is out of scope. Add negative tests for self-approval, missing SnD and sequence collisions.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M4-01 — Signed LoA starts implementation project

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High
- **Read:** `AGENTS.md; docs/PRD.md implementation; docs/DATA_MODEL.md; .kiro/specs/E4-implementation-revenue-merch/`

**Prompt (paste after setting the model/effort):**

```text
Work on M4-01: Signed LoA starts implementation project.
Read only: AGENTS.md; docs/PRD.md implementation; docs/DATA_MODEL.md; .kiro/specs/E4-implementation-revenue-merch/.
Implement only M4-01. Build realization project creation and deliverable tracking linked to the signed LoA clauses. Prevent active implementation until the required signature state is complete. Add loading/empty/error states and tests for missing/unsigned LoA and correct obligation links.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M4-02 — Financial and in-kind actual revenue records

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; .kiro/specs/E4-implementation-revenue-merch/`

**Prompt (paste after setting the model/effort):**

```text
Work on M4-02: Financial and in-kind actual revenue records.
Read only: AGENTS.md; docs/ESSM_MAPPING.md; docs/DATA_MODEL.md; .kiro/specs/E4-implementation-revenue-merch/.
Implement only M4-02. Store financial receipts and in-kind receipts as separate actual-revenue records with partner, program, received date/month, amount/value, in-kind type/items and evidence URL. Validate IDR integer money, audit changes and require proof where specified. Never infer cash received from rate-card value or merchandise totals. Add formula and permission tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M4-03 — Mandatory report gate and reminders

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md report requirements; .kiro/specs/E4-implementation-revenue-merch/`

**Prompt (paste after setting the model/effort):**

```text
Work on M4-03: Mandatory report gate and reminders.
Read only: AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md report requirements; .kiro/specs/E4-implementation-revenue-merch/.
Implement only M4-03. Track event/program running versus finished and require a report URL before completion. Add an Asia/Jakarta-aware reminder/job with idempotency and audit data. Keep the ESSM report-link gate distinct from the separate seven-working-day Impact Report goal. Add missing-link, timezone, duplicate-job and retry tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M4-04 — Merchandise Tracker

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High; schema lock if needed
- **Read:** `AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; fixed diagram; .kiro/specs/E4-implementation-revenue-merch/`

**Prompt (paste after setting the model/effort):**

```text
Work on M4-04: Merchandise Tracker.
Read only: AGENTS.md; docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; fixed diagram; .kiro/specs/E4-implementation-revenue-merch/.
Implement only M4-04. Build separate merchandise item/vendor, COGS, selling price, quantity realization, bundle and proof-link records. Derive per-item profit, total COGS, total revenue and total profit using deterministic tested formulas. Keep merchandise retail revenue separate from partner contribution revenue unless an explicit audited link is approved. Use synthetic fixtures only.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M4-05 — Financial formula and double-counting regression tests

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Review then implementation
- **Independent review:** hicesse: Hermes Kimi-K3, High
- **Read:** `docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; AGENTS.md; code touched by M3/M4`

**Prompt (paste after setting the model/effort):**

```text
Work on M4-05: Financial formula and double-counting regression tests.
Read only: docs/DATA_MODEL.md; docs/ESSM_MAPPING.md; AGENTS.md; code touched by M3/M4.
Implement only M4-05 as a test-focused task. Add regression tests proving that rate-card valuation, actual financial receipts, in-kind contributions and merchandise sales remain distinct and are never silently summed into one revenue metric. Exercise zero, missing, fractional quantity, refund/adjustment if supported and duplicate proof cases. Do not change formulas to satisfy a test without recording the business rule.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-01 — Partner engagement calendar and log

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md partner engagement; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-01: Partner engagement calendar and log.
Read only: AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md partner engagement; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-01. Track monthly newsletter as mandatory for every active partnership month. Model partner visit with the required agenda/MoM as optional, and event invitation/greeting card as optional. Show due/completed/overdue status with clear dates. Add recurring-month logic tests, including month boundaries and partnership start/end.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-02 — Official BD Post-Partnership Survey tracking

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3-Flash
- **Effort:** Medium
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-02: Official BD Post-Partnership Survey tracking.
Read only: AGENTS.md; docs/ESSM_MAPPING.md; docs/PRD.md; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-02. Seed the exact official URL `https://s.aiesec.or.id/AIESECPartnershipSurvey-BD`; track dispatch timestamp, responsible PIC and completion status. Do not ingest Google Form responses or claim automated response synchronization without explicit approved integration. Add URL, access and status-transition tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-03 — Re-raise decision and new cycle linkage

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High
- **Read:** `AGENTS.md; docs/PRD.md lifecycle; docs/DATA_MODEL.md; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-03: Re-raise decision and new cycle linkage.
Read only: AGENTS.md; docs/PRD.md lifecycle; docs/DATA_MODEL.md; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-03. Use ESSM Re-Raise values Yes, No and Planning To. Yes creates a new PartnershipCycle linked to the same partner and previous cycle; No records a closed decision; Planning To requires a review date. Preserve historical cycle records and validate allowed transitions with audit tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-04 — ESSM import preview and mapping contract

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High; approved workbook check
- **Read:** `docs/ESSM_MAPPING.md; docs/SECURITY_PRIVACY.md; docs/PRD.md import; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-04: ESSM import preview and mapping contract.
Read only: docs/ESSM_MAPPING.md; docs/SECURITY_PRIVACY.md; docs/PRD.md import; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-04. Build local-file import preview, column mapping contract, row-level validation/errors, deduplication and idempotent commit. Use synthetic workbook fixtures checked into tests. Do not include or upload the national ESSM workbook; exact positions/dropdowns require authorized local verification and must be configurable data, not hard-coded guesses.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-05 — ESSM export in exact order and golden test

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, High; independent second review
- **Read:** `docs/ESSM_MAPPING.md; docs/PRD.md export; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-05: ESSM export in exact order and golden test.
Read only: docs/ESSM_MAPPING.md; docs/PRD.md export; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-05. Produce ESSM export in the verified official column order and dropdown semantics using approved configuration. Add a synthetic golden-file test, total checks, invalid-row handling and export audit event. Do not claim exact workbook parity until an authorized source workbook has been compared locally; report unresolved mapping gaps.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M5-06 — Permission-controlled dashboard and handover exports

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3
- **Effort:** Medium/High
- **Workflow mode:** Implementation
- **Independent review:** Ghiffari: ZCode GLM-5.3, Medium
- **Read:** `AGENTS.md; docs/PRD.md reporting; docs/DATA_MODEL.md; .kiro/specs/E5-engagement-survey-data/`

**Prompt (paste after setting the model/effort):**

```text
Work on M5-06: Permission-controlled dashboard and handover exports.
Read only: AGENTS.md; docs/PRD.md reporting; docs/DATA_MODEL.md; .kiro/specs/E5-engagement-survey-data/.
Implement only M5-06. Build dashboard metrics from persisted source records, provide filters and accessible empty/loading/error states, and enforce server-side row/action access. Audit each export and prevent PII leakage in logs or URL query strings. Add tests reconciling dashboard totals with underlying synthetic records.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-01 — Full authorization matrix and security review

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation/review
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High; Kiro Sonnet 5.5 High if unresolved
- **Read:** `AGENTS.md; docs/SECURITY_PRIVACY.md; docs/TESTING_UAT.md; all route/job policies`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-01: Full authorization matrix and security review.
Read only: AGENTS.md; docs/SECURITY_PRIVACY.md; docs/TESTING_UAT.md; all route/job policies.
Implement only M6-01. Build a systematic role × action × entity × state authorization test matrix covering TL BD/LCVP PD identical CRM Lead permissions, staff restrictions, inactive users, exports, background jobs, DNC, approvals and LoA self-approval. Report every uncovered route. Do not close gaps with UI-only checks or weaken negative tests.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-02 — AI golden evaluations and prompt-injection safety

- **Owner:** hicesse
- **Model:** Hermes · DeepSeek-V4.1-Flash-1017
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High; Hicesse Kimi-K3 High as second-review only
- **Read:** `docs/SECURITY_PRIVACY.md; docs/AI_MODEL_ROUTING.md; docs/TESTING_UAT.md; AI adapter tests`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-02: AI golden evaluations and prompt-injection safety.
Read only: docs/SECURITY_PRIVACY.md; docs/AI_MODEL_ROUTING.md; docs/TESTING_UAT.md; AI adapter tests.
Implement only M6-02. Create deterministic golden evals for Indonesian/English formal outreach, source grounding, schema validity, hallucinated claims, prompt injection in external content, DNC, approved text integrity and output budget/cost. Keep evaluation data synthetic. Separate model quality failures from transport failures, and never auto-send.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-03 — Encrypted backup, restore drill and runbook

- **Owner:** hicesse
- **Model:** Hermes · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Ghiffari: Kiro Claude Sonnet 5.5, High
- **Read:** `docs/RUNBOOK.md; docs/SECURITY_PRIVACY.md; hosting ADR; .kiro/specs/E6-hardening-release/`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-03: Encrypted backup, restore drill and runbook.
Read only: docs/RUNBOOK.md; docs/SECURITY_PRIVACY.md; hosting ADR; .kiro/specs/E6-hardening-release/.
Implement only M6-03. Document and automate encrypted backups, key/role separation, retention and a restore verification drill for the selected deployment target. Do not place actual backup artifacts or keys in Git. Include a reproducible synthetic-data restore test and record the failure/rollback procedure.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-04 — Accessibility, performance and browser E2E

- **Owner:** Catalna
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan then implementation
- **Independent review:** Nemotron-3.5-Super-VL-120B-A12B via Hermes only for visual screenshot review; Ghiffari signs off
- **Read:** `docs/TESTING_UAT.md; AGENTS.md; fixed diagrams; relevant UI specs`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-04: Accessibility, performance and browser E2E.
Read only: docs/TESTING_UAT.md; AGENTS.md; fixed diagrams; relevant UI specs.
Implement only M6-04. Add browser E2E for the complete synthetic happy path and key failed gates, plus keyboard/focus/label/accessibility checks and a defined performance smoke test. Include screenshots from synthetic data. If visual review is used, treat it as supplementary to automated DOM, accessibility and test assertions.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-05 — Privacy, product-owner UAT and deployment decision

- **Owner:** Ghiffari
- **Model:** ZCode · GLM-5.3
- **Effort:** High
- **Workflow mode:** Plan/review; no deploy without approval
- **Independent review:** Catalna: ChatGPT strongest reasoning model, High; hicesse reviews runtime config
- **Read:** `docs/HANDOVER.md; docs/SECURITY_PRIVACY.md; docs/RUNBOOK.md; docs/DECISIONS.md; hosting/provider ADR`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-05: Privacy, product-owner UAT and deployment decision.
Read only: docs/HANDOVER.md; docs/SECURITY_PRIVACY.md; docs/RUNBOOK.md; docs/DECISIONS.md; hosting/provider ADR.
Implement only M6-05 as a release-readiness review. Verify data-region/provider terms, retention, contact sourcing basis, participant notice, OAuth scope, runtime model costs, workbook mapping and unresolved Rate Card formula decisions. Record evidence and blockers. Do not deploy, migrate production data or send any partner communication.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

### M6-06 — Final release and term handover package

- **Owner:** All; Ghiffari accountable
- **Model:** Ghiffari: Kiro CLI · Claude Sonnet 5.5; escalate to Opus 5.5 only for unresolved high-risk blockers
- **Effort:** High; Opus escalation XHigh
- **Workflow mode:** Plan first, then bounded release tasks
- **Independent review:** Independent reviewer not the author; owner final sign-off
- **Read:** `All handover/runbook/security/UAT/decision files; CI artifacts`

**Prompt (paste after setting the model/effort):**

```text
Work on M6-06: Final release and term handover package.
Read only: All handover/runbook/security/UAT/decision files; CI artifacts.
Complete only the release handover. Confirm merged PRs, migration sequence and rollback, backup restore evidence, role/action matrix, approved provider configuration, ESSM mapping sign-off, Rate Card formula decision, UAT evidence and all remaining risks. Do not mark release ready or deploy while any mandatory gate/security blocker remains open.
Use synthetic data only. Follow AGENTS.md and the fixed 13-page ESSM diagram. Keep this PR to this issue; do not implement adjacent issue IDs.
Add meaningful success and negative tests that prove the acceptance criteria. Run focused checks and the available full checks; report exact commands and results, changed files, risks and unresolved decisions. Never relax validation/security to make the build pass.
```

## 6. Review prompts (model-specific)

### Ghiffari / Kiro final review of a sensitive PR
- **Model:** Claude Sonnet 5.5 (1.30x), High. Escalate to Claude Opus 5.5 (2.00x), XHigh only if the security/domain ambiguity remains unresolved after a bounded review.
- **Mode:** Plan/read-only review; do not edit the author's branch.

```text
Review PR <URL> independently against AGENTS.md, the exact FR acceptance criteria, DATA_MODEL.md and the fixed diagram. Do not re-implement. Trace authorization from route/job to domain service and data access. Check negative tests, DNC/send hash, LoA self-approval, five-stage lifecycle, price snapshots, revenue/merchandise double-counting, audit trail, import safety and migration rollback. Return severity-ordered findings with file/line references and reproduction/test evidence. Do not approve a high-impact invariant that is untested. Keep response to actionable findings and a final pass/block verdict.
```

### Catalna / ChatGPT independent review
- **Model:** strongest available OpenAI reasoning/coding model in her picker; High/maximum appropriate reasoning for security or money logic. Exact alias must be recorded from the picker; not guessed here.
- **Mode:** read-only review; do not edit the implementation.

```text
Independently review PR <URL> against the exact FR, AGENTS.md and fixed ESSM diagram. Focus on UX states, keyboard/accessibility, API/UI authorization mismatch, error handling, browser tests, misleading status, and whether the test actually proves the requirement. For sensitive features also test recipient/channel integrity, DNC, role parity and LoA separation of duties. Report only actionable findings with severity and file/line references; do not rewrite the PR.
```

### hicesse / Hermes independent AI/worker review
- **Model:** Kimi-K3, High, only for complex long-context review; use GLM-5.3, High if Kimi is unavailable. Nemotron is only for visual screenshot tasks.
- **Mode:** review only; do not edit author files unless a follow-up issue is assigned.

```text
Review PR <URL> against AGENTS.md, the relevant FR and AI_MODEL_ROUTING.md. Inspect worker idempotency/retries, untrusted external content, source URLs, schema validation, output/cost limits, secret leakage, DNC/approval enforcement and missing failure tests. Do not assume provider compatibility from a model display name. Report evidence-linked findings and block if the worker could send messages or bypass a gate.
```

## 7. Cost/quality policy

1. Cheap models handle bounded, reversible work; the stronger model handles uncertainty and high-impact invariants.
2. One coding pass plus one independent review is usually better than asking three models to regenerate the same code.
3. Use only the relevant docs/spec, not the complete PRD and all history for every prompt.
4. For schema changes, pricing, revenue, authentication, lifecycle and import/export, ask one model to implement and a different developer/model to review; serialize `schema-lock` work.
5. No real partner names, contact details, workbook, transcript, signed LoA, secrets or OAuth tokens in prompts/logs/issues/screenshots.
6. Prompt text cannot set a host model. Verify the model/effort indicator before each task and record the actual choice in PR metadata.

## 8. Extension policy

Read `docs/EXTENSIONS_AND_SKILLS.md` before installing any external skill, Power, extension or MCP server. No extension is required for M0 bootstrap. Do not install global tools or unreviewed forks to save tokens.