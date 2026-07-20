import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type AgentTokenKind = "personal" | "access" | "refresh";

const TOKEN_PREFIX: Record<AgentTokenKind, string> = {
  personal: "sbp",
  access: "sbo",
  refresh: "sbr",
};

const PREFIX_KIND = new Map(Object.entries(TOKEN_PREFIX).map(([kind, prefix]) => [prefix, kind as AgentTokenKind]));

export type ParsedAgentToken = {
  kind: AgentTokenKind;
  id: string;
  secret: string;
};

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomBase64Url(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function createOpaqueAgentToken(kind: AgentTokenKind): {
  raw: string;
  id: string;
  secretHash: string;
  prefix: string;
} {
  const id = randomBase64Url(12);
  const secret = randomBase64Url(32);
  const prefix = TOKEN_PREFIX[kind];
  return {
    raw: `${prefix}.${id}.${secret}`,
    id,
    secretHash: sha256(secret),
    prefix,
  };
}

export function parseOpaqueAgentToken(raw: string): ParsedAgentToken | null {
  const [prefix, id, secret, extra] = raw.trim().split(".");
  const kind = PREFIX_KIND.get(prefix);
  if (!kind || !id || !secret || extra) return null;
  if (!/^[A-Za-z0-9_-]{12,32}$/.test(id)) return null;
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(secret)) return null;
  return { kind, id, secret };
}

export function secureHashMatches(secret: string, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = Buffer.from(sha256(secret), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function verifyCodeChallenge(verifier: string, expected: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = Buffer.from(codeChallengeS256(verifier));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function isSafeOAuthRedirectUri(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

export function bearerTokenFromHeader(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}
