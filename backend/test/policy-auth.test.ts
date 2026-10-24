import { afterEach, it, expect, vi } from "vitest";
import { SignJWT } from "jose";
import { authenticate } from "../src/auth";
import { capabilities } from "../src/core";
import { verification } from "../src/provider-policy";
import { liveGate } from "../src/providers";
afterEach(() => vi.unstubAllEnvs());
it.each([[], ["frontend"], {}, 1, null])(
  "rejects a non-string role claim %j",
  async (role) => {
    vi.stubEnv("AUTH_JWT_SECRET", "SYNTHETIC_TEST_SECRET".repeat(3));
    const token = await new SignJWT({ role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("test")
      .setIssuer("dit-backend")
      .setAudience("dit-v1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET));
    await expect(authenticate(`Bearer ${token}`)).rejects.toMatchObject({
      status: 401,
    });
  },
);
it("uses one verification source for capability reporting and live gating without enabling any real provider", () => {
  const old = verification.reddit;
  verification.reddit = {
    runtimeVerified: true,
    evidence: "SYNTHETIC TEST ONLY",
  };
  try {
    vi.stubEnv("PROVIDER_MODE", "fixture");
    let reddit = capabilities().platforms.find((p) => p.platform === "reddit")!;
    expect(reddit.actorRuntimeVerified).toBe(true);
    expect(reddit.liveEnabled).toBe(false);
    vi.stubEnv("PROVIDER_MODE", "live");
    vi.stubEnv("PROVIDER_AUTHORIZATION_APPROVED", "true");
    vi.stubEnv("RETENTION_POLICY_REF", "SYNTHETIC TEST");
    vi.stubEnv("APIFY_TOKEN", "");
    expect(() => liveGate("reddit")).toThrow("credential");
    expect(capabilities().platforms[0].liveEnabled).toBe(false);
    vi.stubEnv("APIFY_TOKEN", "SYNTHETIC TEST TOKEN");
    expect(capabilities().platforms[0].liveEnabled).toBe(true);
    expect(() => liveGate("reddit")).not.toThrow();
  } finally {
    verification.reddit = old;
  }
});
