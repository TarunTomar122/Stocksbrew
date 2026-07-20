import {
  AGENT_AUTH_CODE_TTL_SECONDS,
  AGENT_OAUTH_CLIENT_COLLECTION,
  AGENT_OAUTH_CODE_COLLECTION,
  AGENT_OAUTH_REGISTRATION_LIMIT_COLLECTION,
  AGENT_OAUTH_REGISTRATIONS_PER_DAY,
  AGENT_SCOPES,
  normalizeAgentScopes,
  publicAppUrl,
  type AgentScope,
} from "@/lib/agent-access-config";
import {
  isSafeOAuthRedirectUri,
  randomBase64Url,
  secureHashMatches,
  sha256,
  verifyCodeChallenge,
} from "@/lib/agent-auth-core";
import {
  consumeRefreshAgentToken,
  issueAgentToken,
  verifyStoredAgentToken,
  type AgentPrincipal,
} from "@/lib/agent-auth";
import { adminFirestore } from "@/lib/firebase-admin";
import { captureServerEvent } from "@/lib/posthog-server-capture";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export type OAuthClientDoc = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: Array<"authorization_code" | "refresh_token">;
  response_types: ["code"];
  created_at: string;
};

type OAuthCodeDoc = {
  uid: string;
  client_id: string;
  redirect_uri: string;
  code_hash: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scopes: AgentScope[];
  resource: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export class OAuthRequestError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthRequestError";
  }
}

export function parseOAuthClientRegistration(input: unknown): Omit<OAuthClientDoc, "client_id" | "created_at"> {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const clientName = String(body.client_name || "MCP client").trim().slice(0, 100);
  const redirectUris = Array.isArray(body.redirect_uris)
    ? [...new Set(body.redirect_uris.map(String))].slice(0, 10)
    : [];
  if (!clientName || redirectUris.length === 0 || redirectUris.some((uri) => !isSafeOAuthRedirectUri(uri))) {
    throw new OAuthRequestError("invalid_client_metadata", "A client name and safe HTTPS or localhost redirect URI are required.");
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    throw new OAuthRequestError("invalid_client_metadata", "Only public clients with token_endpoint_auth_method=none are supported.");
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ["authorization_code", "refresh_token"];
  if (
    !grantTypes.includes("authorization_code") ||
    grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")
  ) {
    throw new OAuthRequestError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  }
  const responseTypes = Array.isArray(body.response_types) ? body.response_types.map(String) : ["code"];
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
    throw new OAuthRequestError("invalid_client_metadata", "Only response_type=code is supported.");
  }
  return {
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: [...new Set(grantTypes)] as Array<"authorization_code" | "refresh_token">,
    response_types: ["code"],
  };
}

function validatedScopes(raw: string | null | undefined, fallback: AgentScope[]): AgentScope[] {
  const requested = String(raw || "").split(/\s+/).filter(Boolean);
  const normalized = normalizeAgentScopes(requested);
  if (requested.length && normalized.length !== new Set(requested).size) {
    throw new OAuthRequestError("invalid_scope", "One or more requested scopes are not supported.");
  }
  return normalized.length ? normalized : fallback;
}

export async function registerOAuthClient(input: unknown): Promise<OAuthClientDoc> {
  const parsed = parseOAuthClientRegistration(input);
  const clientId = `sbclient_${randomBase64Url(18)}`;
  const doc: OAuthClientDoc = {
    client_id: clientId,
    ...parsed,
    created_at: new Date().toISOString(),
  };
  await adminFirestore.collection(AGENT_OAUTH_CLIENT_COLLECTION).doc(clientId).set(doc);
  return doc;
}

export async function consumeOAuthRegistrationQuota(fingerprint: string, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const id = sha256(`${day}:${fingerprint}`).slice(0, 40);
  const ref = adminFirestore.collection(AGENT_OAUTH_REGISTRATION_LIMIT_COLLECTION).doc(id);
  await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists && typeof snap.data()?.count === "number" ? snap.data()!.count : 0;
    if (count >= AGENT_OAUTH_REGISTRATIONS_PER_DAY) {
      throw new OAuthRequestError("temporarily_unavailable", "Too many client registrations from this network today.", 429);
    }
    tx.set(ref, {
      day,
      count: count + 1,
      updated_at: now.toISOString(),
    }, { merge: true });
  });
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientDoc | null> {
  if (!/^sbclient_[A-Za-z0-9_-]{20,32}$/.test(clientId)) return null;
  const snap = await adminFirestore.collection(AGENT_OAUTH_CLIENT_COLLECTION).doc(clientId).get();
  return snap.exists ? snap.data() as OAuthClientDoc : null;
}

export type ValidatedAuthorizationRequest = {
  client: OAuthClientDoc;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: AgentScope[];
  resource: string;
};

export async function validateAuthorizationRequest(params: URLSearchParams): Promise<ValidatedAuthorizationRequest> {
  if (params.get("response_type") !== "code") {
    throw new OAuthRequestError("unsupported_response_type", "Only response_type=code is supported.");
  }
  const clientId = String(params.get("client_id") || "");
  const client = await getOAuthClient(clientId);
  if (!client) throw new OAuthRequestError("invalid_client", "Unknown OAuth client.", 401);
  const redirectUri = String(params.get("redirect_uri") || "");
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new OAuthRequestError("invalid_request", "The redirect URI is not registered for this client.");
  }
  const challenge = String(params.get("code_challenge") || "");
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    throw new OAuthRequestError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const state = String(params.get("state") || "");
  if (state.length > 1024) throw new OAuthRequestError("invalid_request", "The state value is too long.");
  const scopes = validatedScopes(params.get("scope"), [...AGENT_SCOPES]);
  const expectedResource = `${publicAppUrl()}/api/mcp`;
  const resource = String(params.get("resource") || expectedResource).replace(/\/$/, "");
  if (resource !== expectedResource) {
    throw new OAuthRequestError("invalid_target", "The requested resource is not this stocksbrew MCP server.");
  }
  return { client, redirectUri, state, codeChallenge: challenge, scopes, resource };
}

export async function issueAuthorizationCode(uid: string, request: ValidatedAuthorizationRequest): Promise<string> {
  const id = randomBase64Url(12);
  const secret = randomBase64Url(32);
  const now = new Date();
  const doc: OAuthCodeDoc = {
    uid,
    client_id: request.client.client_id,
    redirect_uri: request.redirectUri,
    code_hash: sha256(secret),
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    scopes: request.scopes,
    resource: request.resource,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + AGENT_AUTH_CODE_TTL_SECONDS * 1000).toISOString(),
    used_at: null,
  };
  await adminFirestore.collection(AGENT_OAUTH_CODE_COLLECTION).doc(id).set(doc);
  return `sba.${id}.${secret}`;
}

function parseAuthorizationCode(raw: string): { id: string; secret: string } | null {
  const [prefix, id, secret, extra] = raw.trim().split(".");
  if (prefix !== "sba" || extra) return null;
  if (!/^[A-Za-z0-9_-]{12,32}$/.test(id || "") || !/^[A-Za-z0-9_-]{32,64}$/.test(secret || "")) return null;
  return { id, secret };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string | null;
}) {
  const parsed = parseAuthorizationCode(input.code);
  if (!parsed) throw new OAuthRequestError("invalid_grant", "The authorization code is invalid.");
  const ref = adminFirestore.collection(AGENT_OAUTH_CODE_COLLECTION).doc(parsed.id);
  const codeDoc = await adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new OAuthRequestError("invalid_grant", "The authorization code is invalid.");
    const doc = snap.data() as OAuthCodeDoc;
    if (doc.used_at || Date.parse(doc.expires_at) <= Date.now()) {
      throw new OAuthRequestError("invalid_grant", "The authorization code expired or was already used.");
    }
    if (
      doc.client_id !== input.clientId ||
      doc.redirect_uri !== input.redirectUri ||
      !secureHashMatches(parsed.secret, doc.code_hash) ||
      !verifyCodeChallenge(input.codeVerifier, doc.code_challenge)
    ) {
      throw new OAuthRequestError("invalid_grant", "The authorization code could not be verified.");
    }
    if (input.resource && input.resource.replace(/\/$/, "") !== doc.resource) {
      throw new OAuthRequestError("invalid_target", "The token was requested for a different resource.");
    }
    tx.update(ref, { used_at: new Date().toISOString() });
    return doc;
  });

  const user = await getUserDoc(codeDoc.uid).catch(() => null);
  if (!resolveIsSubscribed(user)) {
    throw new OAuthRequestError("access_denied", "An active stocksbrew Pro subscription is required.", 403);
  }
  const [access, refresh] = await Promise.all([
    issueAgentToken({
      uid: codeDoc.uid,
      kind: "access",
      label: codeDoc.client_id,
      scopes: codeDoc.scopes,
      clientId: codeDoc.client_id,
    }),
    issueAgentToken({
      uid: codeDoc.uid,
      kind: "refresh",
      label: codeDoc.client_id,
      scopes: codeDoc.scopes,
      clientId: codeDoc.client_id,
    }),
  ]);
  await captureServerEvent(codeDoc.uid, "agent_oauth_connected", {
    client_id: codeDoc.client_id,
    scopes: codeDoc.scopes.join(" "),
  }).catch(() => undefined);
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh.token,
    scope: codeDoc.scopes.join(" "),
  };
}

export async function exchangeRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  scope?: string | null;
}) {
  const requestedScopes = validatedScopes(input.scope, []);
  let principal: AgentPrincipal;
  try {
    principal = await verifyStoredAgentToken(input.refreshToken, ["refresh"]);
  } catch {
    throw new OAuthRequestError("invalid_grant", "The refresh token is invalid or expired.");
  }
  if (principal.clientId !== input.clientId) {
    throw new OAuthRequestError("invalid_grant", "The refresh token belongs to another client.");
  }
  const scopes = requestedScopes.length ? requestedScopes : principal.scopes;
  if (scopes.some((scope) => !principal.scopes.includes(scope))) {
    throw new OAuthRequestError("invalid_scope", "Refresh cannot add scopes that were not originally granted.");
  }
  try {
    principal = await consumeRefreshAgentToken(input.refreshToken, input.clientId);
  } catch {
    throw new OAuthRequestError("invalid_grant", "The refresh token is invalid or expired.");
  }
  const user = await getUserDoc(principal.uid).catch(() => null);
  if (!resolveIsSubscribed(user)) {
    throw new OAuthRequestError("access_denied", "An active stocksbrew Pro subscription is required.", 403);
  }
  const [access, refresh] = await Promise.all([
    issueAgentToken({
      uid: principal.uid,
      kind: "access",
      label: input.clientId,
      scopes,
      clientId: input.clientId,
    }),
    issueAgentToken({
      uid: principal.uid,
      kind: "refresh",
      label: input.clientId,
      scopes,
      clientId: input.clientId,
    }),
  ]);
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refresh.token,
    scope: scopes.join(" "),
  };
}
