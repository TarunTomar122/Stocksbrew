import {
  bearerTokenFromHeader,
  codeChallengeS256,
  createOpaqueAgentToken,
  isSafeOAuthRedirectUri,
  parseOpaqueAgentToken,
  secureHashMatches,
  verifyCodeChallenge,
} from "@/lib/agent-auth-core";

describe("agent token primitives", () => {
  it("creates parseable opaque tokens without storing the raw secret", () => {
    const issued = createOpaqueAgentToken("personal");
    const parsed = parseOpaqueAgentToken(issued.raw);

    expect(parsed).toMatchObject({ kind: "personal", id: issued.id });
    expect(parsed?.secret).not.toBe(issued.secretHash);
    expect(secureHashMatches(parsed!.secret, issued.secretHash)).toBe(true);
    expect(secureHashMatches(`${parsed!.secret}x`, issued.secretHash)).toBe(false);
  });

  it("rejects malformed and unknown bearer tokens", () => {
    expect(parseOpaqueAgentToken("bad.token")).toBeNull();
    expect(parseOpaqueAgentToken("xyz.abcdefghijklmnop.abcdefghijklmnopqrstuvwxyzABCDEFGH")).toBeNull();
    expect(bearerTokenFromHeader("Basic abc")).toBeNull();
    expect(bearerTokenFromHeader("Bearer sbp.id.secret extra")).toBeNull();
  });

  it("extracts a case-insensitive Bearer header", () => {
    expect(bearerTokenFromHeader("bearer test-token")).toBe("test-token");
  });
});

describe("OAuth security primitives", () => {
  it("verifies PKCE S256 challenges", () => {
    const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const challenge = codeChallengeS256(verifier);
    expect(challenge).toHaveLength(43);
    expect(verifyCodeChallenge(verifier, challenge)).toBe(true);
    expect(verifyCodeChallenge(`${verifier}x`, challenge)).toBe(false);
    expect(verifyCodeChallenge("too-short", challenge)).toBe(false);
  });

  it("accepts HTTPS and loopback redirects but rejects unsafe URLs", () => {
    expect(isSafeOAuthRedirectUri("https://client.example/callback")).toBe(true);
    expect(isSafeOAuthRedirectUri("http://localhost:4321/callback")).toBe(true);
    expect(isSafeOAuthRedirectUri("http://127.0.0.1:4321/callback")).toBe(true);
    expect(isSafeOAuthRedirectUri("http://client.example/callback")).toBe(false);
    expect(isSafeOAuthRedirectUri("https://user:pass@client.example/callback")).toBe(false);
    expect(isSafeOAuthRedirectUri("https://client.example/callback#fragment")).toBe(false);
    expect(isSafeOAuthRedirectUri("javascript:alert(1)")).toBe(false);
  });
});
