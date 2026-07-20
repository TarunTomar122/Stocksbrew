# Stocksbrew for Agents

Stocksbrew exposes its existing Pro intelligence through a hosted MCP server and a matching read-only REST API. The implementation deliberately uses the same bounded, materialized contracts as the web product. It does not expose Firestore or upstream provider APIs directly.

## Product contract

- Remote MCP endpoint: `https://www.stocksbrew.online/api/mcp`
- REST base: `https://www.stocksbrew.online/api/v1`
- OpenAPI: `https://www.stocksbrew.online/api/v1/openapi.json`
- Pro allowance: 500 tool/API calls per calendar month and 30 calls per minute
- Personal tokens: up to five active tokens; raw secrets are displayed once and stored only as SHA-256 hashes
- OAuth: Authorization Code with PKCE S256, rate-limited Dynamic Client Registration, one-hour access tokens, and rotating 30-day refresh tokens
- Access is read-only and is rechecked against current Pro subscription state on every authenticated request

## Tools

1. `search_stocks`
2. `get_stock_intelligence`
3. `compare_stocks`
4. `get_market_brief`
5. `get_my_radar`
6. `get_radar_changes`

Each successful data response includes a schema version, `as_of`, freshness classification, the informational-use notice, and current usage. There is no bulk-universe, raw-history, write, alert, or trading tool.

## Data policy

The agent contract returns bounded product context and Stocksbrew synthesis. It intentionally excludes raw article bodies, bulk history, upstream API responses, and provider credentials. Current price/fundamental context is indicative and carries freshness metadata. Commercial redistribution is not included in the Pro terms. Upstream commercial/redistribution rights must be reviewed before expanding this surface or introducing a commercial API tier.

## Firestore collections

- `tm_agent_tokens`: hash-only personal, OAuth access, and refresh tokens
- `tm_agent_usage`: transactional monthly and per-minute call counters
- `tm_agent_oauth_clients`: dynamically registered public OAuth clients
- `tm_agent_oauth_codes`: short-lived, single-use PKCE authorization codes
- `tm_agent_oauth_registration_limits`: hashed-network daily registration counters

No composite index is required by the current queries. Account deletion removes the user's token, usage, and outstanding authorization-code documents.

## OAuth discovery

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-authorization-server`
- `/api/mcp/oauth/register`
- `/mcp/authorize`
- `/api/mcp/oauth/token`

The MCP server accepts OAuth access tokens and personal tokens in the `Authorization: Bearer ...` header. It uses stateless Streamable HTTP with JSON responses, which is safe for horizontally scaled Next deployments.

## Validation and deployment

Run:

```bash
npm test
npm run typecheck
npm run build
```

The repository does not currently include a standalone ESLint configuration; the Next production build still performs its configured lint/type validation.

The frontend is deployed through its normal Next deployment path. This feature does not modify scheduled backend jobs and does not require the VPS backend deployment procedure. Confirm `NEXT_PUBLIC_APP_URL=https://www.stocksbrew.online` in production so OAuth resource/audience URLs are stable.
