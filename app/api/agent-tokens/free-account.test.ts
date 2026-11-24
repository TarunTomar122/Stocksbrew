import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Free account gets agent access both ways the app hands it out: a personal token from Account, and an OAuth
 * connection through the consent screen (approve, code, token, refresh). Real routes and token code over an
 * in-memory store; only the browser session is a stand-in. Made-up uids only.
 */

const store = vi.hoisted(() => ({ current: null as null | import("@/lib/test-utils/fake-store").FakeStore }));
const session = vi.hoisted(() => ({ uid: "free-account-uid" as string | null }));

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", async () => {
  const { createFakeStore } = await import("@/lib/test-utils/fake-store");
  store.current = createFakeStore();
  return { adminFirestore: store.current.firestore, adminAuth: {} };
});
vi.mock("@/lib/auth-server", () => ({
  getSessionUser: async () => (session.uid ? { uid: session.uid, email: "free@example.com" } : null),
}));
vi.mock("@/lib/posthog-server-capture", () => ({ captureServerEvent: vi.fn(async () => undefined) }));

import { publicAppUrl } from "@/lib/agent-access-config";
import { codeChallengeS256 } from "@/lib/agent-auth-core";
import { requireAgentPrincipal } from "@/lib/agent-auth";
import { exchangeAuthorizationCode, exchangeRefreshToken, registerOAuthClient } from "@/lib/agent-oauth";

import { POST as authorize } from "../mcp/oauth/authorize/route";
import { GET as listTokens, POST as createToken } from "./route";

const UID = "free-account-uid";

beforeEach(() => {
  store.current!.docs.clear();
  store.current!.docs.set(`users/${UID}`, { tracked_stocks: [] });
  session.uid = UID;
});

function bearer(token: string): Request {
  return new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${token}` } });
}

describe("agent access on a Free account", () => {
  it("creates a personal token from Account, and the token calls as Free", async () => {
    const response = await createToken(new NextRequest("http://localhost/api/agent-tokens", {
      method: "POST",
      body: JSON.stringify({ label: "laptop" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(201);
    const { token } = await response.json() as { token: string };
    expect(token).toMatch(/^sbp\./);
    expect(await requireAgentPrincipal(bearer(token))).toMatchObject({ uid: UID, plan: "free" });

    const listed = await (await listTokens()).json() as { tokens: unknown[]; usage: { limit: number }; plan: string };
    expect(listed).toMatchObject({ plan: "free", usage: { limit: 50 } });
    expect(listed.tokens).toHaveLength(1);
  });

  it("still needs a signed-in session to create one", async () => {
    session.uid = null;
    const response = await createToken(new NextRequest("http://localhost/api/agent-tokens", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("connects over OAuth: approve, exchange the code, refresh, all as Free", async () => {
    const client = await registerOAuthClient({ client_name: "Test client", redirect_uris: ["http://localhost:4567/callback"] });
    const verifier = "v".repeat(64);
    const approved = await authorize(new Request("http://localhost/api/mcp/oauth/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: "http://localhost:4567/callback",
        state: "s1",
        code_challenge: codeChallengeS256(verifier),
        code_challenge_method: "S256",
        resource: `${publicAppUrl()}/api/mcp`,
        decision: "approve",
      }),
    }));
    expect(approved.status).toBe(200);
    const { redirect_to } = await approved.json() as { redirect_to: string };
    const code = new URL(redirect_to).searchParams.get("code")!;
    expect(code).toMatch(/^sba\./);

    const tokens = await exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: "http://localhost:4567/callback", codeVerifier: verifier });
    expect(await requireAgentPrincipal(bearer(tokens.access_token))).toMatchObject({ uid: UID, plan: "free" });

    const renewed = await exchangeRefreshToken({ refreshToken: tokens.refresh_token, clientId: client.client_id });
    expect(await requireAgentPrincipal(bearer(renewed.access_token))).toMatchObject({ uid: UID, plan: "free" });
  });

  it("reads the plan on every call, so going Pro needs no new token", async () => {
    const response = await createToken(new NextRequest("http://localhost/api/agent-tokens", { method: "POST", body: "{}" }));
    const { token } = await response.json() as { token: string };
    store.current!.docs.set(`users/${UID}`, { tracked_stocks: [], is_subscribed: true });
    expect(await requireAgentPrincipal(bearer(token))).toMatchObject({ plan: "pro" });
  });
});
