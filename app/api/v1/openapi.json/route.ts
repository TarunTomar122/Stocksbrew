import { publicAppUrl } from "@/lib/agent-access-config";

export async function GET() {
  const base = publicAppUrl();
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Stocksbrew Agent API",
      version: "1.2.0",
      description: "Stock research, full stock detail, Explore, Screens, Watchlist tracking and alert tools for Stocksbrew Pro members. No trading or brokerage access.",
    },
    servers: [{ url: `${base}/api/v1` }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/stocks/search": {
        get: {
          operationId: "searchStocks",
          summary: "Search the Stocksbrew stock catalog",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 10 } },
          ],
          responses: { "200": { description: "Search results", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/stocks/{symbol}": {
        get: {
          operationId: "getStockIntelligence",
          summary: "Get Stocksbrew intelligence for one stock",
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
            { name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } },
          ],
          responses: { "200": { description: "Stock intelligence", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/stocks/{symbol}/detail": {
        get: {
          operationId: "getStockDetail",
          summary: "Get full materialized stock-page detail",
          parameters: [
            { name: "symbol", in: "path", required: true, schema: { type: "string" } },
            { name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } },
          ],
          responses: { "200": { description: "Full stock-page detail", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/compare": {
        post: {
          operationId: "compareStocks",
          summary: "Compare two to five stocks",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["tickers"], properties: { tickers: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } } } } } },
          },
          responses: { "200": { description: "Comparison", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/market": {
        get: {
          operationId: "getMarketBrief",
          summary: "Get the current Stocksbrew market brief",
          parameters: [{ name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } }],
          responses: { "200": { description: "Market brief", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/market/history": {
        get: {
          operationId: "getMarketHistory",
          summary: "Get archived US Market Daily editions (publication paused)",
          parameters: [
            { name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } },
            { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 30, default: 7 } },
          ],
          responses: { "200": { description: "Market Daily history", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/explore": {
        get: {
          operationId: "getExplore",
          summary: "Get the current Explore page sections",
          parameters: [{ name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } }],
          responses: { "200": { description: "Explore data", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/screens": {
        get: {
          operationId: "getScreens",
          summary: "Get curated Stocksbrew screens and matches",
          parameters: [{ name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } }],
          responses: { "200": { description: "Curated stock screens", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/radar": {
        get: {
          operationId: "getMyRadar",
          summary: "Get the authorized member's Watchlist",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          ],
          responses: { "200": { description: "Personal Watchlist", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          operationId: "addToRadar",
          summary: "Add a stock to Watchlist and queue missing research",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["ticker"], properties: {
              ticker: { type: "string" }, market: { type: "string", enum: ["US", "IN"], default: "US" }, position_type: { type: "string", enum: ["watchlist", "holding"], default: "watchlist" },
            } } } },
          },
          responses: { "200": { description: "Watchlist mutation and research queue status", content: { "application/json": { schema: { type: "object" } } } } },
        },
        delete: {
          operationId: "removeFromRadar",
          summary: "Remove a stock from Watchlist",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["ticker"], properties: { ticker: { type: "string" }, market: { type: "string", enum: ["US", "IN"], default: "US" } } } } },
          },
          responses: { "200": { description: "Removal status", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/radar/changes": {
        get: {
          operationId: "getRadarChanges",
          summary: "Get current changes across the authorized member's Watchlist",
          parameters: [{ name: "since", in: "query", description: "ISO cursor from the previous response", schema: { type: "string", format: "date-time" } }],
          responses: { "200": { description: "Watchlist changes", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/alerts": {
        get: {
          operationId: "getMyAlerts",
          summary: "List active alerts",
          parameters: [
            { name: "ticker", in: "query", schema: { type: "string" } },
            { name: "market", in: "query", schema: { type: "string", enum: ["US", "IN"], default: "US" } },
            { name: "kind", in: "query", schema: { $ref: "#/components/schemas/AlertKind" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          ],
          responses: { "200": { description: "Active alerts", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          operationId: "createAlert",
          summary: "Create a price threshold email alert",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["ticker", "condition", "target_price"], properties: {
            ticker: { type: "string" }, market: { type: "string", enum: ["US", "IN"], default: "US" }, kind: { type: "string", const: "price_threshold", default: "price_threshold" }, condition: { type: "string", enum: ["below", "above"] }, target_price: { type: "number", exclusiveMinimum: 0 }, note: { type: "string", maxLength: 240 },
          } } } } },
          responses: { "200": { description: "Created alert", content: { "application/json": { schema: { type: "object" } } } } },
        },
        delete: {
          operationId: "deleteAlert",
          summary: "Deactivate an alert",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["alert_id"], properties: { alert_id: { type: "string" } } } } } },
          responses: { "200": { description: "Deactivated alert", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "OAuth access token or personal token from the Stocksbrew profile." },
        oauth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${base}/mcp/authorize`,
              tokenUrl: `${base}/api/mcp/oauth/token`,
              scopes: {
                "stocks:read": "Read stock intelligence",
                "market:read": "Read market intelligence",
                "radar:read": "Read the member's private Watchlist",
                "radar:write": "Add or remove Watchlist stocks after the member instructs the agent",
                "alerts:read": "Read active alerts",
                "alerts:write": "Create or deactivate alerts after the member instructs the agent",
              },
            },
          },
        },
      },
      schemas: {
        AlertKind: { type: "string", enum: ["price_threshold", "anomaly", "rsi_extreme", "earnings_24h", "directive_change", "news_velocity"] },
      },
    },
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
