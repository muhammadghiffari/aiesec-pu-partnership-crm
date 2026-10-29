/**
 * @crm/ai — provider-neutral LLM adapter, versioned prompts, output schemas and evaluations.
 *
 * Runtime provider is configured only through the M0-04 config contract (ADR 001). The adapter
 * has no tools and no send capability; outputs are drafts for human review.
 */

export const AI_PACKAGE_NAME = "@crm/ai" as const;

export * from "./adapter";
export * from "./config";
export * from "./evals/fixtures";
export * from "./evals/runner";
export * from "./prompts";
export * from "./transport";
