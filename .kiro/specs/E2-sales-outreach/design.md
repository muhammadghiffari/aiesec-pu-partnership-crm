# Prospecting jobs, contact verification and approved outreach

**Design notes:**

# Design — E2 Prospecting and Sales Process

Use the existing workflow diagrams as baseline. Build `packages/ai` as a provider-adapter + versioned prompts + Zod schemas + eval set. Store model id, prompt version, token counts, latency, status and source references on each AI job. Keep search/enrichment adapters replaceable.

`packages/core` owns job quotas, prospect eligibility, DNC, contact verification, linting, approval content hash, response handling and follow-up ceiling. Worker only creates research and draft artifacts. Human UI drives approval and send handoff. LinkedIn/WhatsApp use assisted flow; never auto-send them.
