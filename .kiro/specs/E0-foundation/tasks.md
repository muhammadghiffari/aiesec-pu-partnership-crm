# Foundation, authentication and governance

# Tasks — E0 Foundation

- [ ] Create pnpm workspace and strict TypeScript/formatter/test configuration.
- [ ] Create minimal Next.js app and health/readiness endpoints with no public CRM data.
- [ ] Implement Google OAuth + email allowlist + inactive-user/session revocation path.
- [ ] Implement `CRM_LEAD`, `BD_STAFF`, `VIEWER` policies and exhaustive role-action matrix.
- [ ] Implement append-only audit writer and tests.
- [ ] Add env validation and a secret-free `.env.example`.
- [ ] Extend CI to lint, typecheck, unit test, run migrations and scan dependencies.
- [ ] Add ADR for hosting/runtime provider before production configuration.
- [ ] Verify all checks from clean clone and update HANDOVER.
