/** D-016: the dev-only identity verifier accepts exactly the `dev:<email>` token shape. */
import { describe, expect, it } from "vitest";
import {
  createDevIdentityVerifier,
  devIdentityEmail,
  devIdentityToken,
  isDevIdentityToken,
} from "./dev-identity";
import { IdentityVerificationError } from "./google-id-token";

describe("dev identity verifier", () => {
  it("accepts a dev:<allowlisted email> token and returns a verified identity", async () => {
    const verifier = createDevIdentityVerifier();
    const identity = await verifier.verify(devIdentityToken("BD.Demo@Example.invalid"));
    expect(identity.email).toBe("bd.demo@example.invalid");
    expect(identity.emailVerified).toBe(true);
    expect(identity.subject).toContain("bd.demo@example.invalid");
  });

  it("rejects tokens that are not the dev shape, like a Google JWT", async () => {
    const verifier = createDevIdentityVerifier();
    const googleShaped = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.abc";
    await expect(verifier.verify(googleShaped)).rejects.toMatchObject({
      code: "MALFORMED_TOKEN",
    });
    // without devIdentityToken's normalization the caller must hand a clean dev token
    await expect(verifier.verify("dev:not-an-email")).rejects.toBeInstanceOf(
      IdentityVerificationError,
    );
    await expect(verifier.verify("dev:dev:bd.demo@example.invalid")).rejects.toMatchObject({
      code: "MALFORMED_TOKEN",
    });
  });

  it("normalizes the email inside the token", () => {
    expect(devIdentityEmail(devIdentityToken("Lead@Example.co.id"))).toBe("lead@example.co.id");
    expect(isDevIdentityToken("dev:a@b.co")).toBe(true);
    expect(isDevIdentityToken("v2:a@b.co")).toBe(false);
    expect(devIdentityEmail("dev:no-at-sign")).toBeNull();
  });
});
