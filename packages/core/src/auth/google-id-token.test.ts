import { beforeAll, describe, expect, it } from "vitest";
import {
  createGoogleIdentityVerifier,
  type IdentityFailureReason,
  IdentityVerificationError,
} from "./google-id-token";
import {
  generateTestKeyPair,
  MutableClock,
  signJwt,
  TEST_CLIENT_ID,
  type TestKeyPair,
  validClaims,
} from "./test-support";

let key: TestKeyPair;
let otherKey: TestKeyPair;
const clock = new MutableClock();

beforeAll(async () => {
  key = await generateTestKeyPair("kid-a");
  otherKey = await generateTestKeyPair("kid-a"); // same kid, different key material
});

function verifier(overrides: Partial<Parameters<typeof createGoogleIdentityVerifier>[0]> = {}) {
  return createGoogleIdentityVerifier({
    clientId: TEST_CLIENT_ID,
    jwks: { getKeys: async () => [key.publicJwk] },
    clock,
    ...overrides,
  });
}

async function expectReason(promise: Promise<unknown>, reason: IdentityFailureReason) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(IdentityVerificationError);
  expect((error as IdentityVerificationError).reason).toBe(reason);
}

describe("Google ID token verification", () => {
  it("accepts a valid token and normalizes the email", async () => {
    const token = await signJwt(key, validClaims(clock, { email: "  Staff@Example.INVALID " }));
    const identity = await verifier().verify(token);
    expect(identity).toEqual({
      subject: "synthetic-subject-1",
      email: "staff@example.invalid",
      emailVerified: true,
      name: "Synthetic Staff",
    });
  });

  it("accepts the bare accounts.google.com issuer, string email_verified and array aud", async () => {
    const token = await signJwt(
      key,
      validClaims(clock, {
        iss: "accounts.google.com",
        email_verified: "true",
        aud: ["other", TEST_CLIENT_ID],
      }),
    );
    await expect(verifier().verify(token)).resolves.toMatchObject({ emailVerified: true });
  });

  it("rejects a forged signature (right kid, wrong key)", async () => {
    const forged = await signJwt(otherKey, validClaims(clock));
    await expectReason(verifier().verify(forged), "BAD_SIGNATURE");
  });

  it("rejects a tampered payload", async () => {
    const token = await signJwt(key, validClaims(clock));
    const [h, , s] = token.split(".") as [string, string, string];
    const evil = btoa(JSON.stringify(validClaims(clock, { email: "attacker@example.invalid" })))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expectReason(verifier().verify(`${h}.${evil}.${s}`), "BAD_SIGNATURE");
  });

  it("rejects alg=none and HS256 downgrade attempts", async () => {
    const claims = validClaims(clock);
    const none = await signJwt(key, claims, { alg: "none" });
    await expectReason(verifier().verify(none), "UNSUPPORTED_ALGORITHM");
    const hs = await signJwt(key, claims, { alg: "HS256" });
    await expectReason(verifier().verify(hs), "UNSUPPORTED_ALGORITHM");
    const unsigned = `${none.split(".").slice(0, 2).join(".")}.`;
    await expectReason(verifier().verify(unsigned), "MALFORMED_TOKEN");
  });

  it("rejects an unknown kid", async () => {
    const token = await signJwt(key, validClaims(clock), { kid: "kid-unknown" });
    await expectReason(verifier().verify(token), "UNKNOWN_KEY");
  });

  it("rejects wrong audience and wrong issuer", async () => {
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { aud: "someone-else" }))),
      "WRONG_AUDIENCE",
    );
    await expectReason(
      verifier().verify(
        await signJwt(key, validClaims(clock, { iss: "https://evil.example.invalid" })),
      ),
      "WRONG_ISSUER",
    );
  });

  it("rejects expired tokens beyond skew and accepts within skew", async () => {
    const now = Math.floor(clock.now().getTime() / 1000);
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { exp: now - 120 }))),
      "TOKEN_EXPIRED",
    );
    await expect(
      verifier().verify(await signJwt(key, validClaims(clock, { exp: now - 30 }))),
    ).resolves.toBeDefined();
  });

  it("rejects tokens issued in the future", async () => {
    const now = Math.floor(clock.now().getTime() / 1000);
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { iat: now + 600 }))),
      "TOKEN_NOT_YET_VALID",
    );
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { nbf: now + 600 }))),
      "TOKEN_NOT_YET_VALID",
    );
  });

  it("rejects unverified or absent email", async () => {
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { email_verified: false }))),
      "EMAIL_NOT_VERIFIED",
    );
    await expectReason(
      verifier().verify(await signJwt(key, validClaims(clock, { email_verified: "false" }))),
      "EMAIL_NOT_VERIFIED",
    );
    const { email: _omit, ...withoutEmail } = validClaims(clock);
    await expectReason(verifier().verify(await signJwt(key, withoutEmail)), "INVALID_CLAIMS");
  });

  it("enforces the nonce when one is expected", async () => {
    const token = await signJwt(key, validClaims(clock, { nonce: "n-1" }));
    await expect(verifier({ expectedNonce: "n-1" }).verify(token)).resolves.toBeDefined();
    await expectReason(verifier({ expectedNonce: "n-2" }).verify(token), "NONCE_MISMATCH");
    await expectReason(
      verifier({ expectedNonce: "n-1" }).verify(await signJwt(key, validClaims(clock))),
      "NONCE_MISMATCH",
    );
  });

  it("rejects malformed input of every shape without throwing other errors", async () => {
    for (const bad of ["", "a.b", "a.b.c.d", "...", "not a token", "a.b.", ".b.c"]) {
      await expectReason(verifier().verify(bad), "MALFORMED_TOKEN");
    }
    await expectReason(verifier().verify(undefined as unknown as string), "MALFORMED_TOKEN");
    await expectReason(verifier().verify("%%%.%%%.%%%"), "MALFORMED_TOKEN");
  });

  it("fails closed when keys cannot be fetched", async () => {
    const v = verifier({
      jwks: {
        getKeys: async () => {
          throw new Error("network down");
        },
      },
    });
    await expectReason(v.verify(await signJwt(key, validClaims(clock))), "KEYS_UNAVAILABLE");
  });

  it("never includes the token in error messages", async () => {
    const token = await signJwt(key, validClaims(clock, { aud: "x" }));
    const error = await verifier()
      .verify(token)
      .catch((e: Error) => e);
    expect((error as Error).message).not.toContain(token.slice(10, 40));
  });

  it("requires a non-empty client id", () => {
    expect(() =>
      createGoogleIdentityVerifier({ clientId: " ", jwks: { getKeys: async () => [] } }),
    ).toThrow();
  });
});
