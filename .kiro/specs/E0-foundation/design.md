# Foundation, authentication and governance

**Design notes:**

# Design — E0 Foundation

Create the pnpm TypeScript workspace and minimal deployable Next.js shell. Define shared configuration and authorization policy before adding screens. Authentication provider callbacks must not become the only access-control boundary; each server operation must call a central policy.

Recommended structure: `apps/web`, `apps/worker`, optional `apps/companion`, `packages/core`, `packages/db`, `packages/ai`, `packages/docs`, `packages/config`. Define `packages/core` interfaces early; no domain table should be accessed directly from the UI without an approved repository/service.

Use database migrations, synthetic seed users, and an `activity_log` append-only policy. Add CI steps incrementally and keep initial setup reliable on a clean clone.
