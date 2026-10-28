# AIESEC in PU — Partnership CRM (Agent Handover Pack)

**Repository target:** `muhammadghiffari/aiesec-pu-partnership-crm` (private)  
**Product area:** Business Development (BD) subdivision  
**PRD baseline:** v2.0 — 28 October 2026  
**System-design baseline:** [`docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml`](docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml)

This repository pack is the source package for agents to create the GitHub repository and implement the product. It contains the corrected product requirements, fixed diagrams, governance, implementation specifications, and bootstrap tooling. **It is not a claim that the application is already implemented, deployed, or that the remote repository has already been created.**

## First steps

1. Read [`AGENTS.md`](AGENTS.md), then [`docs/PRD.md`](docs/PRD.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md).
2. Review [`docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml`](docs/diagrams/Partnership_CRM_Diagrams_FINAL_EDGE_ANCHORED.drawio.xml) in diagrams.net. This is the agreed design baseline; do not replace its ESSM domain structure with legacy assumptions.
3. From this directory, run `bash scripts/bootstrap-github.sh` in an authenticated GitHub CLI environment. The script targets the private repo `muhammadghiffari/aiesec-pu-partnership-crm`, pushes the current handover pack, and invites `hicesse` with write access. The invite must be accepted by the collaborator.
4. Create one issue per task from [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Start at M0; do not implement all epics in one giant change.
5. Use `docs/AGENT_STARTER_PROMPTS.md` for repo bootstrap, implementation and independent review prompts.
6. Follow [`docs/TEAM_MODEL_PROMPTS.md`](docs/TEAM_MODEL_PROMPTS.md) for the exact model, effort, workflow mode and copy/paste prompt for each issue; use [`docs/AI_MODEL_ROUTING.md`](docs/AI_MODEL_ROUTING.md) and [`docs/DEVELOPER_WORKFLOW.md`](docs/DEVELOPER_WORKFLOW.md) for shared policy.
7. Read [`docs/EXTENSIONS_AND_SKILLS.md`](docs/EXTENSIONS_AND_SKILLS.md) before installing optional external skills/Powers. No extensions are required to bootstrap the repository.

## Canonical references

| Topic | Source of truth |
|---|---|
| User-visible workflow, domain model, and relationship structure | Fixed 13-page draw.io file in `docs/diagrams/` |
| ESSM terminology, industry grouping, project support, survey and tracker semantics | `docs/ESSM_MAPPING.md`, derived from the supplied 2026 ESSM BD Guidance and PRD notes |
| System requirements, release scope, quality/security, acceptance criteria | `docs/PRD.md` |
| Entity fields, associations and integrity rules | `docs/DATA_MODEL.md` |
| Shared agent behavior and constraints | `AGENTS.md` |
| Current decisions and unresolved source conflicts | `docs/DECISIONS.md` |

The national ESSM workbook, signed LoA/MoM files, production exports, transcripts, secrets, and real partner/contact data must **never** be committed to this repository. The `.gitignore` excludes common operational-data locations. The source workbook must remain outside the Git working tree.

## Project status

- Handover package and repo-bootstrap material: prepared.
- Application implementation: not started in this pack; implement in stages using the specs.
- Remote GitHub repo and collaborator invitations: must be created by an authorized agent/user running the bootstrap script.
- Before production: validate the live workbook mapping, privacy/legal review, actual hosting terms, OAuth settings, and API/model access.
