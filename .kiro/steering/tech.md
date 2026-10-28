# Technical Steering

- TypeScript strict, pnpm workspace, Next.js authenticated web app, PostgreSQL and typed migrations.
- Domain truth belongs in `packages/core`; access policies and transition gates are tested separately from UI.
- Use shared validators at every HTTP/DB/import/LLM/extension boundary.
- AI output is schema-validated, source-grounded and stored as a draft. Worker has no message-send credentials/tools.
- Every mutation writes append-only audit metadata. Exports and gate overrides are audited.
- No real partner data or credentials in Git. All examples and tests synthetic.
- See `docs/ARCHITECTURE.md`, `docs/SECURITY_PRIVACY.md`, `docs/AI_MODEL_ROUTING.md`.
