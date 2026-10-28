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
