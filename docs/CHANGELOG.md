# Changelog

## Unreleased — M1-03 presentation prototype (`/demo`)

- Added the `/demo` presentation prototype: an in-memory, synthetic UI across the five fixed ESSM stages (Overview, Partners, Partner profile, Contacts, Research, Outreach, Meetings, LoA, Projects, Reports, Settings), reachable only under `/demo` so the real `/partners` module is untouched.
- Demo store is a React reducer with no persistence: client-side navigation keeps session changes, a hard refresh reseeds, and "Reset demo data" reseeds on demand.
- Implemented the product gates as behaviour rather than decoration: DNC overrides every verification state, identity and channel verification are separate facts, an unverified channel can never be stamped or presented as outreach-ready, LoA approval is refused to its own submitter (D-009), editing a reviewed draft invalidates the exact-version stamp, and duplicate creation requires an explicit human decision.
- Feedback integrity: the create-partner flow clears earlier toasts before reporting a new outcome, so a stale "Check the form" error can never sit beside the `Partner created` success confirmation.
- Accessibility: clickable table rows now carry one real control per row (a `Link` on partner rows, a `button` on contact and LoA rows) stretched across the row, giving native Enter activation, an accessible name and a visible row focus ring instead of a bare `tabIndex` on `<tr>`.
- Fixed an inert primary action: "Prepare outreach to this contact" was an `<a>` nested inside a `<button>`, so the drawer's close handler won an unreachable race against navigation. It is now a `ButtonLink` and lands on `/demo/outreach?contact=…` with the recipient preselected.
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
