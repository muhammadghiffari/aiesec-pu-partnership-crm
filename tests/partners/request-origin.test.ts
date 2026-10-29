import { describe, expect, it } from "vitest";
import { isSameOrigin } from "../../apps/web/features/partners/request-origin";

function request(url: string, headers: Record<string, string>): Request {
  return { url, headers: new Headers(headers) } as Request;
}

describe("same-origin mutation guard", () => {
  it("uses the browser Host header when request.url reports an internal host", () => {
    expect(
      isSameOrigin(
        request("http://localhost:3103/api/partners", {
          origin: "http://127.0.0.1:3103",
          host: "127.0.0.1:3103",
        }),
      ),
    ).toBe(true);
  });

  it("accepts a trusted forwarded host and protocol", () => {
    expect(
      isSameOrigin(
        request("http://internal:3000/api/partners", {
          origin: "https://crm.example.invalid",
          "x-forwarded-host": "crm.example.invalid",
          "x-forwarded-proto": "https,http",
        }),
      ),
    ).toBe(true);
  });

  it("falls back to request.url when Host is absent", () => {
    expect(
      isSameOrigin(
        request("https://crm.example.invalid/api/partners", {
          origin: "https://crm.example.invalid",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a cross-origin host", () => {
    expect(
      isSameOrigin(
        request("https://crm.example.invalid/api/partners", {
          origin: "https://evil.example.invalid",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a port mismatch", () => {
    expect(
      isSameOrigin(
        request("https://crm.example.invalid/api/partners", {
          origin: "https://crm.example.invalid:8443",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a protocol downgrade", () => {
    expect(
      isSameOrigin(
        request("http://crm.example.invalid/api/partners", {
          origin: "https://crm.example.invalid",
          host: "crm.example.invalid",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a missing or malformed Origin", () => {
    expect(
      isSameOrigin(
        request("https://crm.example.invalid/api/partners", {
          host: "crm.example.invalid",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        request("https://crm.example.invalid/api/partners", {
          origin: "not a URL",
          host: "crm.example.invalid",
        }),
      ),
    ).toBe(false);
  });
});
