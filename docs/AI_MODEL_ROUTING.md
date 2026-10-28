# Developer AI Model Routing and Token-Efficiency Policy

**Applies to coding agents used by the team only.** This is separate from the CRM's runtime LLM provider/model configuration. For each implementation task, use `docs/TEAM_MODEL_PROMPTS.md`: it specifies owner, host/model, reasoning effort, Kiro mode, reviewer and a ready-to-paste prompt for every issue in M0–M6.

## Canonical developer identity

**Muhammad Ghiffari (`@muhammadghiffari`) is one person.** References to “Ghiffari” in older task cards mean the same person; they do not identify an additional team member. Kiro CLI and ZCode IDE are two different work environments used by Muhammad Ghiffari, not separate developers or separate GitHub identities. For ownership, branch attribution, reviewer assignment and GitHub collaboration, use the single canonical identity `Muhammad Ghiffari` / `@muhammadghiffari`.

## Current team inventory (reported by product owner)

- **Muhammad Ghiffari / Kiro CLI:** Auto 1.00x; Claude Opus 5.5 2.00x; Claude Sonnet 5.5 1.30x; Claude Haiku 5.5 0.06x; GPT-5.6 Sol 4.40x; GPT-5.6 Terra 2.20x; GPT-5.6 Luna 0.60x; Kimi K3 2.40x; Claude Opus 5 2.20x; Claude Sonnet 5 1.30x; Claude Opus 4.8/4.7/4.6/4.5 2.20x; Claude Sonnet 4.6/4.5 1.30x; Claude Haiku 4.5 0.40x; DeepSeek 3.2 0.25x; MiniMax M2.5 0.25x; MiniMax M2.1 0.15x; GLM-5 0.50x; Qwen3 Coder Next 0.05x. These are the user's observed relative credit multipliers (Auto=1.00x), not guaranteed current pricing or performance. Confirm the actual picker before a task.
- **Muhammad Ghiffari (`@muhammadghiffari`) / ZCode IDE:** GLM-5.3 and GLM-5.3-Flash. This is the same developer listed for Kiro CLI above.
- **Catalna:** ChatGPT/OpenAI models plus GLM-5.3 and GLM-5.3-Flash. The exact OpenAI model choices were not provided; use the strongest reasoning model currently visible for independent high-risk reviews and record its exact displayed name in the PR.
- **hicesse / Hermes:** DeepSeek-V4.1-Flash, Nemotron-3.5-Super-VL-120B-A12B, GLM-5.3-Flash, DeepSeek-V4.1-Flash-1017, GLM-5.3 and Kimi-K3. Use the provider alias/checkpoint actually available in Hermes; do not infer API model IDs from display labels.

## Routing policy

| Task | Default | Effort / reasoning | Escalation / reviewer |
|---|---|---|---|
| Status checks, format, doc navigation, simple seed/fixture | Kiro Qwen3 Coder Next 0.05x or ZCode/Hermes GLM-5.3-Flash | Low/Medium | Verify with deterministic command; no expensive review needed |
| GitHub bootstrap/ordinary setup | Kiro MiniMax M2.5 0.25x | Medium; allow confirmation on external actions | Human validates account/private scope/remote result |
| Scaffold, simple CRUD, accessible UI | GLM-5.3-Flash or Kiro MiniMax M2.5 | Medium | GLM-5.3 / MiniMax M2.5 or independent UI test if two failed attempts |
| Multi-file domain/worker/provider work | GLM-5.3 or DeepSeek-V4.1-Flash-1017 | High if exposed | Different developer/model reviews diff |
| Auth/RBAC, lifecycle gates, approval hash, LoA, pricing/revenue math, import/export, erasure | GLM-5.3 or Claude Sonnet 5.5 | High; plan before edits | Mandatory independent review by another developer/model; Opus/ GPT-5.6 Terra/Sol only if ambiguity remains material |
| Complex architecture/security release review | Claude Sonnet 5.5 or GLM-5.3 | High | Opus 5.5 XHigh or GPT-5.6 Terra/Sol only for genuinely unresolved blocker |
| Screenshot/diagram visual inspection | Nemotron-3.5-Super-VL-120B-A12B in Hermes if vision input is supported | Appropriate visual reasoning | Visual review supplements, never replaces XML/DOM/tests |
| Long-context independent audit | Kimi-K3 in Hermes | High if supported | Use once for independent review, not repeated code regeneration |

## Kiro CLI V3 controls

- `/model` opens the picker and exposes the supported Thinking/Effort choices for the chosen model.
- `/effort low|medium|high|xhigh|max` changes the current session only when the active model supports the selected level. The `/model` picker can persist a supported per-model default; verify UI confirmation.
- `Shift+Tab` toggles Plan mode versus Default mode. **Plan mode and reasoning effort are different settings.** Use Plan for read-only inspection/planning, review the plan, then Default for bounded execution.
- The CLI prompt cannot change the model or effort by itself. Set them in the host first and include the actual selection in the PR notes.
- Never launch repository-changing work with `--trust-all-tools`. Keep tool confirmations enabled for repository creation, push, collaborator invites, migrations, secrets, deployment and deletion.

## Token efficiency without quality loss

1. One owner, one branch, one issue/FR cluster, one PR. No two agents edit the same files in parallel; `packages/db` changes use `schema-lock`.
2. Read `AGENTS.md` + one relevant PRD section + one epic spec, not the whole repository history.
3. Ask for a small implementation and required tests, not a long prose plan; use Plan mode only before risky/multi-step changes.
4. Run focused tests first, then the full available checks once. Show only failing output and relevant stack trace, not repeated full logs.
5. After two failed attempts or any high-risk invariant failure, escalate model reasoning and ask a different model/person to review. Never relax tests to make CI green.
6. Use a cheap model for routine tasks only. Never economize on authorization, audit, gate enforcement, monetary arithmetic or data-loss protection.
7. No real partner PII, ESSM workbook, transcripts, signed documents, secrets or OAuth tokens in prompts, test fixtures, issues, screenshots or Git.

## Product runtime is separate

Never copy a coding-IDE display name into `LLM_MODEL_*` without confirming an API model ID and provider support. Runtime configuration comes from environment/config, and initial tests use deterministic mocked adapters. Run source-grounding, schema, Indonesian outreach, injection, privacy and cost evaluations before runtime-provider sign-off.
