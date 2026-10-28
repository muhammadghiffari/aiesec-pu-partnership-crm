# Architecture Overview

## Runtime components

- **Web application**: authenticated CRM UI, API/server actions, dashboards and review queues.
- **Domain core**: lifecycle state machine, RBAC policies, outreach gate, deterministic Rate Card calculations, revenue/merchandise calculations, checklist logic, audit-event construction.
- **Database**: relational partner/cycle/contact data, versioned catalog, immutable snapshot values, job queue, append-only audit trail, import ledger.
- **Worker**: bounded batch processing for research/draft jobs; validates all model outputs and writes only draft/job/result records. No outbound communication credentials.
- **AI adapter**: configurable OpenAI-compatible provider adapter. Application runtime has separate model settings from Hermes developer tools.
- **Companion**: optional Chrome MV3 read-only/assisted integration; only after review and only if permitted. A manual research/contact workflow is a valid baseline and fallback.
- **Document service**: renders MoM/LoA from approved tagged templates; signing remains external.
- **ESSM adapter**: maps imported workbook tabs/headers to normalized entities and produces a validated export in approved column order.

## Dependency direction

`apps/web`, `apps/worker`, `apps/companion` → `packages/core` / `packages/ai` / `packages/docs` → `packages/db`/shared schemas. Domain rules must not be implemented solely in React components, browser extension handlers, or AI prompts.

## Data and message boundaries

- All public inputs, imported sheets and model responses are untrusted. Validate with shared schemas at each boundary.
- Web requests require authentication and role authorization; worker jobs and Companion calls use scoped tokens and idempotency keys.
- AI results are drafts, never state transitions by implication. A deterministic command/service validates gate conditions before moving a cycle.
- External communications use a separate, explicit human action. The sender records approved hash and actual send confirmation.
- Outbound LLM payloads are minimized; do not send full CRM tables, complete contact lists or internal negotiation notes by default.

## Core state invariants

1. A single partner may have many PartnershipCycles; a new re-raise never overwrites a previous cycle.
2. `essmStage` is one of the five canonical ESSM stages; checkpoint statuses are subordinate.
3. Stage 3 cannot be completed before SnD confirmation, independently approved LoA and signed-document reference.
4. Stage 4 starts only from a valid signed LoA and tracks deliverables and actual receipts separately.
5. Stage 5 tracks official scorecard dispatch/completion and explicit re-raise decision.
6. The exact approved message text/contact/channel must match at send time; any change invalidates approval.
7. TL BD and LCVP PD resolve to the same CRM Lead policy capabilities; LoA self-approval remains denied.
8. Every material mutation/gate waiver is auditable; audit log is append-only.

## Deployment decision gate

Do not assume a free tier is acceptable for partner personal data. Before production decide data region, encryption, backups/restore, OAuth scopes, provider retention terms, incident contact and budget. Record the decision in `docs/adr/`.
