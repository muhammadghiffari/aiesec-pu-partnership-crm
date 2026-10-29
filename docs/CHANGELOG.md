# Changelog

## Unreleased — M1-03 presentation prototype (`/demo`)

- Added the `/demo` presentation prototype: an in-memory, synthetic UI across the five fixed ESSM stages (Overview, Partners, Partner profile, Contacts, Research, Outreach, Meetings, LoA, Projects, Reports, Settings), reachable only under `/demo` so the real `/partners` module is untouched.
- Demo store is a React reducer with no persistence: client-side navigation keeps session changes, a hard refresh reseeds, and "Reset demo data" reseeds on demand.
- Implemented the product gates as behaviour rather than decoration: DNC overrides every verification state, identity and channel verification are separate facts, an unverified channel can never be stamped or presented as outreach-ready, LoA approval is refused to its own submitter (D-009), editing a reviewed draft invalidates the exact-version stamp, and duplicate creation requires an explicit human decision.
- Feedback integrity: the create-partner flow clears earlier toasts before reporting a new outcome, so a stale "Check the form" error can never sit beside the `Partner created` success confirmation.
- Accessibility: clickable table rows no longer rely on a bare `tabIndex` on `<tr>`. Each row carries one real control — a `Link` on partner rows (covering the whole row), a `button` on contact and LoA rows (with a guarded row click so cells holding other links stay usable) — giving native Enter/Space activation, an accessible name and a visible row focus ring.
- Fixed an inert primary action: "Prepare outreach to this contact" was an `<a>` nested inside a `<button>`, so the drawer's close handler won an unreachable race against navigation. It is now a `ButtonLink` and lands on `/demo/outreach?contact=…` with the recipient preselected.
- Fixed inert top-bar triggers: the notifications bell and the user menu carried `aria-expanded` but no click handler, so they never opened. Both now toggle their popover (and declare `aria-haspopup="dialog"`).
- Documented startup, the five-minute walkthrough, reset behaviour and the simulated surface in `docs/PROTOTYPE_DEMO_GUIDE.md`.
- Added `tests/demo/demo-selectors.test.ts` covering DNC, channel gating, D-009, duplicate detection and report reconciliation.

## 2.0 — 2026-10-28

- Rebuilt the PRD around the fixed 13-page EDGE_ANCHORED diagram.
- Standardized the five ESSM lifecycle stages and ESSM industry / Project Support classifications.
- Brought Rate Card and Merchandise Tracker into scope as structured entities.
- Specified actual financial/in-kind receipt records, evidence links and merchandise calculation separation.
- Unified TL BD and LCVP PD as one CRM Lead permission set while preserving LoA separation of duties.
- Added third developer `hicesse`; kept Catalna's GitHub handle as an explicit confirmation item.
- Separated developer-agent model routing from application runtime model configuration.
- Added repo bootstrap, epic specs, UAT/security/workflow docs, and GitHub templates.

### M0-03 — CI baseline and quality gates

- `ci` workflow runs on PRs, pushes to `main` and manual dispatch: pinned pnpm install (`--frozen-lockfile`), Node 22, `pnpm typecheck`, `pnpm lint` (Biome check incl. formatting), `pnpm test`, `pnpm --filter @crm/web build`, handover/diagram validation, and a blocking dependency audit at high+ severity.
- Biome scope expanded: M0-02's directory excludes (`docs`, `.github`, `.kiro`, `scripts`) replaced by file-type-aware handling (`ignoreUnknown` + `!**/*.md`); remaining exclusions documented in `docs/DEVELOPER_WORKFLOW.md`.
- CI prerequisites, diagnostics and intentional exclusions documented in `docs/DEVELOPER_WORKFLOW.md` ("CI quality gates (M0-03)").
- Superseded PR runs are cancelled via concurrency group; workflow permissions remain `contents: read`.

### M0-05 — Authentication foundation and server-side RBAC (FR-100)

- `packages/core/src/auth/`: Google ID-token verifier (RS256 via WebCrypto, injected JWKS, pinned algorithm, issuer/audience/expiry/email-verified/nonce checks), exact-email allowlist (deny by default, wildcards rejected), session service (hashed opaque tokens, per-request re-check of active flag, allowlist and role), central `authorize()` policy and `runAuthorized()` guard.
- `CRM_LEAD` is a single permission set shared by TL BD and LCVP PD; `organizationalTitle` is never a policy input. LoA self-approval is denied for every role.
- Dependency: `zod` added to `@crm/core` only (AGENTS.md boundary-validation rule); smoke test allowlist is scoped per package.
- Interim policy choices recorded as Q-09..Q-11 in `docs/DECISIONS.md`.
- Not included (by scope): config loading (M0-04), DB-backed user/session repositories (M1-01), HTTP cookie/CSRF wiring in `apps/web`, audit persistence (M0-06 consumes `onDecision`).

### M0-06 — Append-only audit service (FR-100)

- `packages/core/src/audit/`: `AuditWriter`/`AuditReader` ports with **no update or delete surface**, in-memory reference store (frozen copies, unique event ids), and `createAuditService`.
- `audited()` runs an authorized handler and appends one event (`MUTATION`, `APPROVAL`, `EXPORT`) inside the same `AuditedTransaction`; audit failure or unsafe metadata rolls the mutation back.
- `overrideGate()` requires `gate.override` (CRM Lead) and a 10-500 character reason, and records the named lead (`authorizedByUserId`).
- Denials of authenticated actors are recorded as `ACCESS_DENIED` through the M0-05 guard's `onDecision` hook (no second logging system). Anonymous failures are intentionally not stored.
- Metadata is flat and minimized; contact-PII/secret/body-like keys and values are rejected (`AuditMetadataError`), with `changedFieldNames()` as the preferred way to describe edits.
- Audit read requires `audit.read` (CRM Lead). `audit.update`/`audit.delete` are not authorizable for any role.
- Not included (by scope): PostgreSQL table, grants/trigger enforcing immutability and the transactional repository (M1-01 must implement `AuditedTransaction` and the reference behaviour of the in-memory store).

### M1-01 — Schema and migrations for diagram entities (SCHEMA-LOCK)

- `packages/db`: typed, reversible migration runner (`migrateUp`/`migrateDown`, one transaction per migration, advisory lock, checksum of applied migrations) and five migrations covering all 30 Class Diagram classes plus lookups and `user_sessions`. See `docs/MIGRATIONS.md`.
- Database-level gates (defence in depth): LoA self-approval and CRM-Lead-only approver, realization project only from a SIGNED LoA, finished project requires report link, outreach approval invalidated by text/recipient/channel change, DNC and verified-recipient checks, financial XOR in-kind revenue with proof, merchandise item XOR bundle, immutable `audit_log` (UPDATE/DELETE/TRUNCATE).
- Tests run against real PostgreSQL via PGlite (dev dependency of `@crm/db` only): diagram conformance parsed from the fixed XML, reversibility, and ~110 constraint/cardinality tests.
- Interim decisions Q-13..Q-16 recorded in `docs/DECISIONS.md`. The fixed diagram is unchanged; Q-13 requests approval for one type deviation.

### M1-04 — PartnershipCycle and five-stage lifecycle API (FR-200)

- `packages/core/src/lifecycle/`: pure rules (`ESSM_STAGES`, `checkTransition`, `unmetGates`, waivable-gate set) and `createLifecycleService` over a `LifecycleRepository` port (no DB dependency; the Postgres repository is a follow-up that must share the audit transaction).
- Stage moves are strictly forward and single-step: exactly 4 of 25 stage pairs are allowed. The caller cannot name a target stage; `advanceStage` takes the stage it expects and the service computes the only legal successor.
- Hard prerequisites per stage (human Market Research with Proceed + evidence + verifier; sent proposal, meeting, final MoM; confirmed SnD + approved, independently approved and signed LoA; finished project with report link). Everything is rechecked inside the audited transaction.
- Soft Sales Process gates can be waived only by a CRM Lead with a reason (`GATE_OVERRIDE` audit event); hard gates cannot be waived (Q-17).
- Sales status, approach method and partnership Active/Break/Finish have separate operations that never move the stage; the Re-Raise decision is not written here (M5-03).
- Every mutation is authorized (`cycle.write`/`cycle.read`) and audited through the M0-05/M0-06 services; a stage move and its audit event commit or roll back together.
- Test helper change: `audit/test-support.ts` can now roll back an additional store (`extraDomain`).
- Interim decisions Q-17..Q-19 recorded in `docs/DECISIONS.md`.

### M1-03 continuation — persisted Partner/Contact integration (FR-200)

- Added bound-parameter Partner/Contact and session/user repositories, plus append-only SQL audit writer and same-connection transaction adapter, without a migration.
- The domain service uses M0-05 authentication/RBAC and M0-06 audited mutations for list/detail, create/edit, contacts, human-reviewed partner duplicates, provenance, verification and DNC; contact details and email-search are hidden from viewers.
- Added a PostgreSQL-backed web composition root, Host/forwarded-header-aware same-origin checks on mutations, Google ID-token sign-in with HttpOnly session cookie, sign-out UI, and partner/contact UI wiring. The synthetic mock remains test-only; missing configuration remains fail-closed. `DATABASE_SSL` is validated (`disable`, `require`, `verify-full`); an unknown value fails closed, and production otherwise requires verified TLS.
- Fixed the contact form's wrapping labels (explicit `htmlFor`/`id` now give each select a clean accessible name), made the partner list aggregate multiple contacts instead of reporting the alphabetically first one, refreshed server-rendered verification/DNC state immediately, and allowed a phone-only primary contact while still requiring at least one channel.
- D-015 records Ghiffari's `sourceDescription` → `partners.source` decision. Q-21 remains open. A production-build browser walkthrough against isolated synthetic PostgreSQL passed for create/contact/verify/DNC/edit/search/denial/404/sign-out, with real HTTP checks for duplicate, validation, CSRF, expired/revoked/signed-out sessions and sign-out cookies. Google ID-token exchange itself remains unexercised without an authorized OAuth test account; see `docs/HANDOVER.md`.
