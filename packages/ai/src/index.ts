/**
 * @crm/ai — provider-neutral LLM adapter, prompt versions, output schemas, evals.
 *
 * Runtime provider is environment-configured only (ADR 001). No provider client is
 * bound here; tests use deterministic mocks. Implemented in M2-03 / M6-02.
 */

export const AI_PACKAGE_NAME = "@crm/ai" as const;
