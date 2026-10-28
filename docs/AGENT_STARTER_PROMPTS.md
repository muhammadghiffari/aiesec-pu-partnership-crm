# Agent Starter Prompts

Use these prompts as task boundaries, not as a request for an agent to implement the whole product in one session. Read `AGENTS.md` first in every new coding environment.

**Model settings are mandatory:** before pasting any prompt, use [`docs/TEAM_MODEL_PROMPTS.md`](TEAM_MODEL_PROMPTS.md) to select the exact host/model, effort level, Kiro Plan/Default mode, owner and independent reviewer. The prompt cannot change the active model by itself. Do not launch Kiro with `--trust-all-tools`; keep confirmation prompts enabled for remote/irreversible actions. Extension decisions are in [`docs/EXTENSIONS_AND_SKILLS.md`](EXTENSIONS_AND_SKILLS.md).

## Prompt 0 — Create the private repository

> Read `AGENTS.md`, `README.md`, `docs/PRD.md`, `docs/DECISIONS.md`, and `docs/DEVELOPER_WORKFLOW.md`. Inspect the entire handover tree and the fixed 13-page diagram. Check GitHub CLI authentication as `muhammadghiffari`. If correct, run `scripts/bootstrap-github.sh` to create the private repository `muhammadghiffari/aiesec-pu-partnership-crm`, push this pack and invite `hicesse` with write permission. Do not make the repo public. Do not invent Catalna's GitHub username; leave her invitation pending until the product owner supplies it. Do not add real partner data, the ESSM workbook, source PDFs, signed docs or secrets. Show final repo URL and collaborator-invitation status only if confirmed by tool output.

## Prompt 1 — Establish M0 workspace

> Read `AGENTS.md`, `docs/PRD.md` §§13–16, `.kiro/steering/tech.md`, `.kiro/steering/structure.md`, and `.kiro/specs/E0-foundation/` only. Build the TypeScript/pnpm monorepo skeleton with `apps/web`, `apps/worker`, optional `apps/companion`, `packages/core`, `packages/db`, `packages/ai`, `packages/docs`, and `packages/config`. Add strict TypeScript, formatting, unit-test, and CI commands. Do not build feature flows yet. Keep the fixed diagrams and ESSM mapping intact. Add no runtime LLM secret or outbound send integration. Open one PR with setup steps and test evidence.

## Prompt 2 — Implement one requirement cluster

> Read `AGENTS.md`, the relevant PRD requirement group, and the matching `.kiro/specs/<epic>/requirements.md`, `design.md` and `tasks.md`. Implement only issue `<ISSUE-ID>` / FR `<FR-ID>`, list the files in scope, and do not change unrelated modules. Add success and negative/gate tests before implementing the UI polish. Do not relax an acceptance test to make CI pass. If a business ambiguity is discovered, document it in `docs/DECISIONS.md` and stop short of hard-coding the assumption. Run the focused tests, then full checks, and report exact commands/results.

## Prompt 3 — Independent review

> Review PR `<PR-URL>` against `AGENTS.md`, the relevant FR acceptance criteria, and the fixed diagram. Do not rewrite the feature. Look for authorization bypasses, differences between TL BD/LCVP PD permissions, DNC/send-approval hash bypass, LoA self-approval, broken lifecycle gates, missing audit rows, incorrect pricing/revenue/merchandise math, data leakage, prompt injection, migrations/backfill hazards, and weak or missing negative tests. Return findings ordered by severity with file/line references. Do not approve if a high-severity invariant is untested or broken.

## Prompt 4 — Pre-production review

> Use `docs/HANDOVER.md`, `docs/TESTING_UAT.md`, `docs/SECURITY_PRIVACY.md`, `docs/RUNBOOK.md`, and `docs/DECISIONS.md`. Inspect test evidence/ADRs; do not infer completion from a green build alone. Verify backup restore, route/job role matrix, runtime provider privacy, ESSM mapping against the actual authorized workbook, Rate Card formula sign-off, template approvals, survey timing, and no PII/secrets in Git. List remaining release blockers; do not deploy or send partner communications without product-owner authorization.
