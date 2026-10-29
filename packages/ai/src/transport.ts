/**
 * Provider transport (M2-03). The only code that talks to a model endpoint. Has no tools,
 * no function calling and no messaging capability: it sends chat messages and returns text.
 *
 * Errors are mapped to codes. Response bodies and the API key never appear in errors.
 */

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Ask the provider for a JSON object (OpenAI-compatible `response_format`). */
  json: true;
}

export interface ChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export const TRANSPORT_ERROR_CODES = [
  "TIMEOUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "AUTH_FAILED",
  "BAD_REQUEST",
  "INVALID_RESPONSE",
  "NETWORK_ERROR",
] as const;
export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[number];

export const RETRYABLE: ReadonlySet<TransportErrorCode> = new Set([
  "TIMEOUT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NETWORK_ERROR",
]);

export class TransportError extends Error {
  constructor(
    readonly code: TransportErrorCode,
    readonly httpStatus: number | null = null,
  ) {
    super(`llm transport failed: ${code}${httpStatus ? ` (${httpStatus})` : ""}`);
    this.name = "TransportError";
  }
}

export interface ChatTransport {
  complete(request: ChatRequest, options: { signal: AbortSignal }): Promise<ChatResponse>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** OpenAI-compatible `/chat/completions`. `fetchImpl` is injectable for tests. */
export function createOpenAiCompatibleTransport(options: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}): ChatTransport {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const url = `${options.baseUrl}/chat/completions`;

  return {
    async complete(request, { signal }) {
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxOutputTokens,
            temperature: 0.2,
            response_format: { type: "json_object" },
            // No tools: the model cannot call functions or send anything.
          }),
        });
      } catch {
        if (signal.aborted) throw new TransportError("TIMEOUT");
        throw new TransportError("NETWORK_ERROR");
      }

      if (!response.ok) {
        const s = response.status;
        if (s === 429) throw new TransportError("RATE_LIMITED", s);
        if (s === 401 || s === 403) throw new TransportError("AUTH_FAILED", s);
        if (s >= 500) throw new TransportError("PROVIDER_UNAVAILABLE", s);
        throw new TransportError("BAD_REQUEST", s);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new TransportError("INVALID_RESPONSE");
      }
      const choice = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string") throw new TransportError("INVALID_RESPONSE");
      const usage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })
        .usage;
      const inT = usage?.prompt_tokens;
      const outT = usage?.completion_tokens;
      return {
        content,
        usage:
          typeof inT === "number" && typeof outT === "number"
            ? { inputTokens: inT, outputTokens: outT }
            : null,
      };
    },
  };
}
