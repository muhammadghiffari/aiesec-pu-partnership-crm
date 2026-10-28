# Changelog

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

