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

### M2-03 — AI adapter and grounded-output evaluation (FR-950)

- `packages/ai`: config mapping from the M0-04 `LLM_*` contract (no second env loader; key never in errors or `describeLlmConfig`), an OpenAI-compatible transport (JSON mode, no tools/functions, status-code error mapping without bodies), and `createLlmAdapter().generate(template, input)` with strict input schemas, deadline per attempt (started after a concurrency slot is held), retries for retryable transport errors only, one schema-repair attempt, bounded concurrency, spend cap and metadata (template id/version, provider, model, attempts, latency, tokens, cost, prompt SHA-256; never prompt text or key).
- Versioned templates `research.candidates@1` and `outreach.draft@1`: untrusted source text is fenced and neutralised; deterministic checks for source grounding, unsupported claims, language, formal Indonesian tone, secrets in output and foreign links. DNC recipients are refused before any model call.
- Synthetic evaluation set (17 cases: grounding, formal Indonesian/English, malformed output, prompt injection, DNC, unsupported claims) and a runner that also accepts a live transport for staging.
- Transport failures and quality failures are reported as different result kinds.
- Interim decisions Q-25, Q-26 recorded.

