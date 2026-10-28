# Repository Structure Steering

- `apps/web`: authenticated UI/API.
- `apps/worker`: bounded research/content jobs; no sending capability.
- `apps/companion`: optional Chrome MV3 only after safety review.
- `packages/core`: lifecycle, RBAC, pricing, linter, quotas, rules.
- `packages/db`: schema, repositories and migrations.
- `packages/ai`: provider adapter, prompt versions, output schemas and evaluations.
- `packages/docs`: MoM/LoA generation from authorized templates.
- `docs/`: PRD, fixed diagrams, ESSM mappings, architecture, ADRs, UAT, runbook.
- `.kiro/specs/E0...E6/`: requirements, design and tasks for each epic.
- `data/` is local-only and ignored. Never move the national workbook into the repository.
