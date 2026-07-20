import { vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("@/lib/watchlist", () => ({
  getUserDoc: vi.fn(),
  resolveIsSubscribed: vi.fn(),
}));
vi.mock("@/lib/posthog-server-capture", () => ({ captureServerEvent: vi.fn() }));

import { OAuthRequestError, parseOAuthClientRegistration } from "@/lib/agent-oauth";

describe("OAuth dynamic client registration", () => {
  it("accepts public PKCE clients with HTTPS and localhost redirects", () => {
    expect(parseOAuthClientRegistration({
      client_name: "Example MCP client",
      redirect_uris: ["https://client.example/callback", "http://localhost:3456/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    })).toEqual({
      client_name: "Example MCP client",
      redirect_uris: ["https://client.example/callback", "http://localhost:3456/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
  });

  it("rejects insecure redirect URIs", () => {
    expect(() => parseOAuthClientRegistration({
      client_name: "Unsafe client",
      redirect_uris: ["http://client.example/callback"],
    })).toThrow(OAuthRequestError);
  });

  it("rejects unsupported grants", () => {
    expect(() => parseOAuthClientRegistration({
      client_name: "Password client",
      redirect_uris: ["https://client.example/callback"],
      grant_types: ["password"],
    })).toThrow(/Only authorization_code and refresh_token/);
  });

  it("rejects confidential clients and unsupported response types", () => {
    expect(() => parseOAuthClientRegistration({
      client_name: "Confidential client",
      redirect_uris: ["https://client.example/callback"],
      token_endpoint_auth_method: "client_secret_basic",
    })).toThrow(/public clients/);
    expect(() => parseOAuthClientRegistration({
      client_name: "Implicit client",
      redirect_uris: ["https://client.example/callback"],
      response_types: ["token"],
    })).toThrow(/response_type=code/);
  });
});
