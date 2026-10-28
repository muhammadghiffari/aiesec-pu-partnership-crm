# ADR 002 — Production hosting and data location

- **Status:** Proposed; not approved for production.
- **Date:** 2026-10-28.
- **Context:** The application stores partner personal/business data, contract references, negotiation notes and receipts. Free-tier limits and terms vary and a low-cost tier is not proof of suitability.
- **Decision:** Keep deployment/database providers configurable. Use synthetic data for development/staging until the product owner approves region, encryption, backups, retention, legal/privacy review, provider terms, observability and budget.
- **Alternatives:** Assume a free Vercel/Neon/Supabase deployment is automatically suitable; commit to a VPS before costs/security are understood.
- **Consequences:** Deployment scripts and environment variables must not assume a particular production vendor. Backup/restore is a launch gate.
