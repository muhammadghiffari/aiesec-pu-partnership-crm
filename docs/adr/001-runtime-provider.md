# ADR 001 — Runtime LLM provider remains configurable

- **Status:** Proposed; production decision blocked pending API access/evaluation.
- **Date:** 2026-10-28.
- **Context:** The developer team uses coding assistants through ZCode IDE and Hermes with several model options. Developer-assistant login/model availability is not equivalent to runtime API access for the CRM.
- **Decision:** Keep product runtime behind a provider adapter and environment configuration. Ship local tests using a deterministic mock. Do not bind production code to a ZCode/Hermes session or assume a model alias is accepted by a provider.
- **Alternatives:** Hard-code one vendor/model; call an IDE model indirectly; implement multiple provider clients before requirements justify them.
- **Consequences:** Runtime model is chosen after provider smoke test, output-schema eval, Indonesian tone and grounding eval, measured latency/cost, and data-retention review.
- **Security/privacy:** Minimize payloads, never expose credentials to the model, keep send tools out of the AI worker.
- **Approver:** Product owner before production runtime is enabled.
