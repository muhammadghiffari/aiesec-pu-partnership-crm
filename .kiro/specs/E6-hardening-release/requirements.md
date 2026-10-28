# Security, UAT, reliability and release handover

**Requirement group:** FR-100, FR-950

# Requirements — E6 Hardening and Release

- Full authz matrix on every route/action/job, plus shared CRM Lead parity.
- Backups are encrypted and restore-tested; secret rotation and incident process documented.
- AI model outputs meet quality evaluations; quotas/cost and retry budgets are enforced.
- Core journey, negative gates, import/export and accessibility are covered by test automation.
- Production hosting/provider, data region, retention, privacy review and Companion approval are documented.

## Acceptance criteria
- No production use until owner signs the release checklist.
- Restore drill, migration rollback strategy, security checks, and synthetic golden path pass.
- Any unresolved blocker is explicitly accepted by product owner; none is silently ignored.
