import { publicAppUrl } from "@/lib/agent-access-config";

export async function GET() {
  const base = publicAppUrl();
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "Stocksbrew Agent API",
      version: "1.0.0",
      description: "Read-only stock, market, and personal Radar intelligence for Stocksbrew Pro members.",
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
      "/radar": {
        get: {
          operationId: "getMyRadar",
          summary: "Get the authorized member's Radar",
          responses: { "200": { description: "Personal Radar", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/radar/changes": {
        get: {
          operationId: "getRadarChanges",
          summary: "Get current changes across the authorized member's Radar",
          responses: { "200": { description: "Radar changes", content: { "application/json": { schema: { type: "object" } } } } },
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
                "radar:read": "Read the member's private Radar",
              },
            },
          },
        },
      },
    },
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
