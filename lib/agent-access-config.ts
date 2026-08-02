export const AGENT_ACCESS_VERSION = "2026-08-01";
export const AGENT_MCP_SERVER_NAME = "stocksbrew";
export const AGENT_MCP_SERVER_VERSION = "1.1.0";

export const AGENT_SCOPES = [
  "stocks:read",
  "market:read",
  "radar:read",
  "radar:write",
  "alerts:read",
  "alerts:write",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_MONTHLY_CALL_LIMIT = 500;
export const AGENT_PER_MINUTE_CALL_LIMIT = 30;
export const AGENT_MAX_ACTIVE_TOKENS = 5;
export const AGENT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const AGENT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AGENT_AUTH_CODE_TTL_SECONDS = 5 * 60;

export const AGENT_TOKEN_COLLECTION = "tm_agent_tokens";
export const AGENT_USAGE_COLLECTION = "tm_agent_usage";
export const AGENT_OAUTH_CLIENT_COLLECTION = "tm_agent_oauth_clients";
export const AGENT_OAUTH_CODE_COLLECTION = "tm_agent_oauth_codes";
export const AGENT_OAUTH_REGISTRATION_LIMIT_COLLECTION = "tm_agent_oauth_registration_limits";
export const AGENT_OAUTH_REGISTRATIONS_PER_DAY = 25;

export const AGENT_DATA_NOTICE =
  "Informational and educational use only. Data may be delayed, incomplete, or wrong. Not investment advice and not a broker.";

export function publicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://www.stocksbrew.online";
}

export function normalizeAgentScopes(value: string | string[] | null | undefined): AgentScope[] {
  const requested = Array.isArray(value) ? value : String(value || "").split(/\s+/);
  const allowed = new Set<AgentScope>(AGENT_SCOPES);
  return [...new Set(requested.filter((scope): scope is AgentScope => allowed.has(scope as AgentScope)))];
}
