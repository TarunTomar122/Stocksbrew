import { FieldValue } from "firebase-admin/firestore";

import {
  AGENT_ACCESS_TOKEN_TTL_SECONDS,
  AGENT_MAX_ACTIVE_TOKENS,
  AGENT_REFRESH_TOKEN_TTL_SECONDS,
  AGENT_SCOPES,
  AGENT_TOKEN_COLLECTION,
  type AgentScope,
} from "@/lib/agent-access-config";
import {
  bearerTokenFromHeader,
  createOpaqueAgentToken,
  parseOpaqueAgentToken,
  secureHashMatches,
  type AgentTokenKind,
} from "@/lib/agent-auth-core";
import { adminFirestore } from "@/lib/firebase-admin";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export type AgentTokenDoc = {
  uid: string;
  kind: AgentTokenKind;
  prefix: string;
  secret_hash: string;
  label: string;
  scopes: AgentScope[];
  client_id?: string | null;
  created_at: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  calls_total?: number;
};

export type AgentPrincipal = {
  uid: string;
  tokenId: string;
  kind: AgentTokenKind;
  scopes: AgentScope[];
  label: string;
  clientId: string | null;
};

export class AgentAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
    public readonly code = "invalid_token",
  ) {
    super(message);
    this.name = "AgentAuthError";
  }
}

function expiryFor(kind: AgentTokenKind, now: Date): string | null {
  if (kind === "personal") return null;
  const seconds = kind === "access" ? AGENT_ACCESS_TOKEN_TTL_SECONDS : AGENT_REFRESH_TOKEN_TTL_SECONDS;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export async function issueAgentToken(input: {
  uid: string;
  kind: AgentTokenKind;
  label: string;
  scopes?: AgentScope[];
  clientId?: string | null;
}): Promise<{ token: string; id: string; expiresAt: string | null; prefix: string }> {
  const generated = createOpaqueAgentToken(input.kind);
  const now = new Date();
  const expiresAt = expiryFor(input.kind, now);
  const scopes = input.scopes?.length ? input.scopes : [...AGENT_SCOPES];
  const doc: AgentTokenDoc = {
    uid: input.uid,
    kind: input.kind,
    prefix: generated.prefix,
    secret_hash: generated.secretHash,
    label: input.label.trim().slice(0, 80) || "Agent access",
    scopes,
    client_id: input.clientId ?? null,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    last_used_at: null,
    revoked_at: null,
    calls_total: 0,
  };
  await adminFirestore.collection(AGENT_TOKEN_COLLECTION).doc(generated.id).set(doc);
  return { token: generated.raw, id: generated.id, expiresAt, prefix: generated.prefix };
}

export async function listPersonalAgentTokens(uid: string): Promise<Array<{
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_total: number;
}>> {
  const snap = await adminFirestore
    .collection(AGENT_TOKEN_COLLECTION)
    .where("uid", "==", uid)
    .where("kind", "==", "personal")
    .limit(25)
    .get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as AgentTokenDoc) }))
    .filter((doc) => doc.kind === "personal")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((doc) => ({
      id: doc.id,
      label: doc.label,
      prefix: `${doc.prefix}.${doc.id.slice(0, 6)}…`,
      created_at: doc.created_at,
      last_used_at: doc.last_used_at ?? null,
      revoked_at: doc.revoked_at ?? null,
      calls_total: doc.calls_total ?? 0,
    }));
}

export async function countActivePersonalAgentTokens(uid: string): Promise<number> {
  const tokens = await listPersonalAgentTokens(uid);
  return tokens.filter((token) => !token.revoked_at).length;
}

export async function issuePersonalAgentToken(uid: string, label: string) {
  const activeCount = await countActivePersonalAgentTokens(uid);
  if (activeCount >= AGENT_MAX_ACTIVE_TOKENS) {
    throw new AgentAuthError(
      `You can have up to ${AGENT_MAX_ACTIVE_TOKENS} active agent tokens. Revoke one first.`,
      403,
      "token_limit_reached",
    );
  }
  return issueAgentToken({ uid, kind: "personal", label, scopes: [...AGENT_SCOPES] });
}

export async function revokePersonalAgentToken(uid: string, tokenId: string): Promise<boolean> {
  const ref = adminFirestore.collection(AGENT_TOKEN_COLLECTION).doc(tokenId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const data = doc.data() as AgentTokenDoc;
  if (data.uid !== uid || data.kind !== "personal") return false;
  if (!data.revoked_at) await ref.update({ revoked_at: new Date().toISOString() });
  return true;
}

export async function verifyStoredAgentToken(
  raw: string,
  allowedKinds: AgentTokenKind[] = ["personal", "access"],
): Promise<AgentPrincipal> {
  const parsed = parseOpaqueAgentToken(raw);
  if (!parsed || !allowedKinds.includes(parsed.kind)) {
    throw new AgentAuthError("The bearer token is invalid.");
  }
  const ref = adminFirestore.collection(AGENT_TOKEN_COLLECTION).doc(parsed.id);
  const snap = await ref.get();
  if (!snap.exists) throw new AgentAuthError("The bearer token is invalid.");
  const doc = snap.data() as AgentTokenDoc;
  if (doc.kind !== parsed.kind || !secureHashMatches(parsed.secret, doc.secret_hash)) {
    throw new AgentAuthError("The bearer token is invalid.");
  }
  if (doc.revoked_at) throw new AgentAuthError("The bearer token was revoked.");
  if (doc.expires_at && Date.parse(doc.expires_at) <= Date.now()) {
    throw new AgentAuthError("The bearer token expired.");
  }
  return {
    uid: doc.uid,
    tokenId: parsed.id,
    kind: doc.kind,
    scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
    label: doc.label,
    clientId: doc.client_id ?? null,
  };
}

export async function consumeRefreshAgentToken(raw: string, expectedClientId: string): Promise<AgentPrincipal> {
  const parsed = parseOpaqueAgentToken(raw);
  if (!parsed || parsed.kind !== "refresh") {
    throw new AgentAuthError("The refresh token is invalid.");
  }
  const ref = adminFirestore.collection(AGENT_TOKEN_COLLECTION).doc(parsed.id);
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AgentAuthError("The refresh token is invalid.");
    const doc = snap.data() as AgentTokenDoc;
    if (
      doc.kind !== "refresh" ||
      doc.client_id !== expectedClientId ||
      doc.revoked_at ||
      (doc.expires_at && Date.parse(doc.expires_at) <= Date.now()) ||
      !secureHashMatches(parsed.secret, doc.secret_hash)
    ) {
      throw new AgentAuthError("The refresh token is invalid or expired.");
    }
    tx.update(ref, { revoked_at: new Date().toISOString() });
    return {
      uid: doc.uid,
      tokenId: parsed.id,
      kind: doc.kind,
      scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
      label: doc.label,
      clientId: doc.client_id ?? null,
    };
  });
}

export async function requireAgentPrincipal(request: Request): Promise<AgentPrincipal> {
  const raw = bearerTokenFromHeader(request.headers.get("authorization"));
  if (!raw) throw new AgentAuthError("A bearer token is required.");
  const principal = await verifyStoredAgentToken(raw);
  const user = await getUserDoc(principal.uid).catch(() => null);
  if (!resolveIsSubscribed(user)) {
    throw new AgentAuthError("An active stocksbrew Pro subscription is required.", 403, "pro_required");
  }
  const ref = adminFirestore.collection(AGENT_TOKEN_COLLECTION).doc(principal.tokenId);
  await ref.set(
    { last_used_at: new Date().toISOString(), calls_total: FieldValue.increment(1) },
    { merge: true },
  ).catch(() => undefined);
  return principal;
}

export function requireAgentScope(principal: AgentPrincipal, scope: AgentScope): void {
  if (!principal.scopes.includes(scope)) {
    throw new AgentAuthError(`The token does not include ${scope}.`, 403, "insufficient_scope");
  }
}
