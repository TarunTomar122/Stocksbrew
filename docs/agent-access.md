# Stocksbrew for Agents

Stocksbrew exposes its existing Pro intelligence through a hosted MCP server and a matching REST API. The implementation uses the same bounded, materialized contracts as the web product. It does not expose Firestore or upstream provider APIs directly.

## Product contract

- Remote MCP endpoint: `https://www.stocksbrew.online/api/mcp`
- REST base: `https://www.stocksbrew.online/api/v1`
- OpenAPI: `https://www.stocksbrew.online/api/v1/openapi.json`
- Pro allowance: 200 tool/API calls per UTC day and 30 calls per minute
- Personal tokens: up to five active tokens; raw secrets are displayed once and stored only as SHA-256 hashes
- OAuth: Authorization Code with PKCE S256, rate-limited Dynamic Client Registration, one-hour access tokens, and rotating 30-day refresh tokens
- Access is scoped and rechecked against current Pro subscription state on every authenticated request

## The five data areas

Agents can read all five product surfaces:

1. `get_my_radar` and `get_radar_changes`: the authenticated member's Watchlist, holdings, portfolio context, current calls, alerts and changes.
2. `get_explore`: the current Explore page sections, including trending names, heat and momentum setups, news spikes, catalyst and dip setups, 52-week highs and lows, Reddit buzz and recent Trump mentions.
3. `get_market_history`: the last seven published US Market Daily editions by default, including the article, tape, premarket view, anomalies and sources. The `days` parameter supports up to 30 editions. If fewer are available, the response says `not enough current evidence`.
4. `get_stock_detail`: the full materialized stock-page payload, including facts, financial history, valuation, balance sheet, dividends, business mix, institutions, price history, technicals, five business questions, earnings, recent news, Reddit context and anomalies.
5. `get_screens`: Stocksbrew's curated thematic screen catalog, coverage metadata and every current match.

## Tools

1. `search_stocks`
2. `get_stock_intelligence`
3. `get_stock_detail`
4. `compare_stocks`
5. `get_market_brief`
6. `get_market_history`
7. `get_explore`
8. `get_screens`
9. `get_my_radar`
10. `get_radar_changes`

The account tools are also available:

11. `add_to_radar`
12. `remove_from_radar`
13. `get_my_alerts`
14. `create_alert`
15. `delete_alert`

Each successful data response includes a schema version, `as_of`, freshness classification, the informational-use notice, and current usage. Watchlist and price-alert mutations are explicit write tools and require the matching write scopes. There is no trading or brokerage tool.

## Data policy

The agent contract returns bounded product context and Stocksbrew synthesis. It includes the materialized Market Daily editions, the stock page's bounded price history, and current screen/Explore snapshots. It excludes upstream API responses, provider credentials, private data belonging to other users, brokerage access, and unrestricted historical or bulk-universe extraction. Missing fields must be reported as `not enough current evidence`, never filled by inference. Commercial redistribution is not included in the Pro terms. Upstream commercial/redistribution rights must be reviewed before expanding this surface or introducing a commercial API tier.

## Firestore collections

- `tm_agent_tokens`: hash-only personal, OAuth access, and refresh tokens
- `tm_agent_usage`: transactional daily and per-minute call counters
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
