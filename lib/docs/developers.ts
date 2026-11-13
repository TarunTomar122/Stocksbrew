import type { AgentScope } from "@/lib/agent-access-config";
import type { AgentToolName } from "@/lib/agent-intelligence";

/**
 * What the developer docs know about each tool beyond what the MCP server
 * itself advertises: the scope it needs and its REST route. Typed against
 * `AgentToolName`, so adding a tool without documenting it fails typecheck.
 * `developers.test.ts` checks the scopes against the real dispatcher.
 */

export const SCOPE_INFO: Record<AgentScope, { text: string; writes: boolean }> = {
  "stocks:read": { text: "Read stock research: the call, zones, fundamentals, risks, what a company changed in its filed risks, full stock detail and comparisons, and read a watch request in plain words.", writes: false },
  "market:read": { text: "Read the market brief, Explore sections, screens, the copy tests and the Market Daily archive.", writes: false },
  "radar:read": { text: "Read your own portfolio: the stocks you hold and watch, what changed, what your funds hold, your dividends, your stress test and your idea baskets.", writes: false },
  "radar:write": { text: "Add a stock to your portfolio or remove one.", writes: true },
  "alerts:read": { text: "Read your active alerts.", writes: false },
  "alerts:write": { text: "Create a price alert or deactivate an alert.", writes: true },
};

export const TOOL_SCOPE: Record<AgentToolName, AgentScope> = {
  search_stocks: "stocks:read",
  get_stock_intelligence: "stocks:read",
  get_stock_detail: "stocks:read",
  compare_stocks: "stocks:read",
  get_market_brief: "market:read",
  get_market_history: "market:read",
  get_explore: "market:read",
  get_screens: "market:read",
  get_my_radar: "radar:read",
  get_radar_changes: "radar:read",
  add_to_radar: "radar:write",
  remove_from_radar: "radar:write",
  get_my_alerts: "alerts:read",
  create_alert: "alerts:write",
  delete_alert: "alerts:write",
  what_you_own: "radar:read",
  dividend_plan: "radar:read",
  stress_test: "radar:read",
  copy_test: "market:read",
  watch_in_plain_words: "stocks:read",
  get_filing_changes: "stocks:read",
  list_baskets: "radar:read",
  get_basket: "radar:read",
};

export type RestRoute = {
  method: "GET" | "POST" | "DELETE";
  /** Path under /api/v1, with {symbol} where the ticker goes. */
  path: string;
  /** Where the arguments go. Query names can differ from the tool's argument names. */
  args: "query" | "json" | "path";
  /** A runnable example path with query string, or a JSON body for POST and DELETE. */
  example: { path: string; body?: Record<string, unknown> };
  /** Set when a REST name differs from the MCP argument name. */
  note?: string;
};

export const TOOL_REST: Record<AgentToolName, RestRoute> = {
  search_stocks: { method: "GET", path: "/stocks/search", args: "query", example: { path: "/stocks/search?q=nvidia&limit=5" }, note: "The search text is `q` over REST and `query` over MCP." },
  get_stock_intelligence: { method: "GET", path: "/stocks/{symbol}", args: "path", example: { path: "/stocks/NVDA" } },
  get_stock_detail: { method: "GET", path: "/stocks/{symbol}/detail", args: "path", example: { path: "/stocks/NVDA/detail" } },
  compare_stocks: { method: "POST", path: "/compare", args: "json", example: { path: "/compare", body: { tickers: ["MSFT", "GOOGL", "AMZN"] } } },
  get_market_brief: { method: "GET", path: "/market", args: "query", example: { path: "/market" } },
  get_market_history: { method: "GET", path: "/market/history", args: "query", example: { path: "/market/history?days=7" } },
  get_explore: { method: "GET", path: "/explore", args: "query", example: { path: "/explore" } },
  get_screens: { method: "GET", path: "/screens", args: "query", example: { path: "/screens" } },
  get_my_radar: { method: "GET", path: "/radar", args: "query", example: { path: "/radar?limit=50&offset=0" } },
  get_radar_changes: { method: "GET", path: "/radar/changes", args: "query", example: { path: "/radar/changes?since=2026-11-08T21:00:00Z" } },
  add_to_radar: { method: "POST", path: "/radar", args: "json", example: { path: "/radar", body: { ticker: "NVDA", position_type: "watchlist" } } },
  remove_from_radar: { method: "DELETE", path: "/radar", args: "json", example: { path: "/radar", body: { ticker: "NVDA" } } },
  get_my_alerts: { method: "GET", path: "/alerts", args: "query", example: { path: "/alerts?ticker=NVDA" } },
  create_alert: { method: "POST", path: "/alerts", args: "json", example: { path: "/alerts", body: { ticker: "NVDA", condition: "below", target_price: 190 } } },
  delete_alert: { method: "DELETE", path: "/alerts", args: "json", example: { path: "/alerts", body: { alert_id: "ALERT_ID" } } },
  what_you_own: { method: "GET", path: "/portfolio/xray", args: "query", example: { path: "/portfolio/xray?limit=15" } },
  dividend_plan: { method: "GET", path: "/portfolio/dividends", args: "query", example: { path: "/portfolio/dividends?payments=true" } },
  stress_test: { method: "GET", path: "/portfolio/stress", args: "query", example: { path: "/portfolio/stress?holdings=true" } },
  copy_test: { method: "GET", path: "/copy", args: "query", example: { path: "/copy?query=berkshire" } },
  watch_in_plain_words: { method: "POST", path: "/agents/parse", args: "json", example: { path: "/agents/parse", body: { text: "tell me if NVDA closes below 150" } } },
  get_filing_changes: { method: "GET", path: "/stocks/{symbol}/filing-changes", args: "path", example: { path: "/stocks/AMD/filing-changes" } },
  list_baskets: { method: "GET", path: "/baskets", args: "query", example: { path: "/baskets" } },
  get_basket: { method: "GET", path: "/baskets/{id}", args: "path", example: { path: "/baskets/BASKET_ID" }, note: "The id goes in the path over REST and in `basket_id` over MCP." },
};

/** The order the reference groups tools in. */
export const TOOL_GROUPS: { title: string; blurb: string; tools: AgentToolName[] }[] = [
  { title: "Stocks", blurb: "Research on any stock we cover, and what it changed in its filed risks.", tools: ["search_stocks", "get_stock_intelligence", "get_stock_detail", "compare_stocks", "get_filing_changes"] },
  { title: "Market", blurb: "What the market and our discovery lists look like now.", tools: ["get_market_brief", "get_explore", "get_screens", "get_market_history"] },
  { title: "Your portfolio", blurb: "The stocks on your account. Writes change your account.", tools: ["get_my_radar", "get_radar_changes", "add_to_radar", "remove_from_radar"] },
  { title: "Inside your portfolio", blurb: "What your holdings own through funds, pay in dividends and did in past shocks.", tools: ["what_you_own", "dividend_plan", "stress_test"] },
  { title: "Copy tests", blurb: "What copying a fund or a House member would have made.", tools: ["copy_test"] },
  { title: "Alerts", blurb: "Your alert rules. Agents can create price alerts only.", tools: ["get_my_alerts", "create_alert", "delete_alert"] },
  { title: "Agents", blurb: "Read a watch request into stocksbrew agents. Saving happens on the Agents page.", tools: ["watch_in_plain_words"] },
  { title: "Idea baskets", blurb: "Your ideas, each company's reason and what the last check found. Changes happen in the app.", tools: ["list_baskets", "get_basket"] },
];

/** Every error code the API can return, with the HTTP status the REST routes use. */
export const API_ERRORS: { code: string; status: number; meaning: string }[] = [
  { code: "invalid_token", status: 401, meaning: "No bearer token, or one that is malformed, revoked or expired." },
  { code: "pro_required", status: 403, meaning: "The account behind the token does not have an active Pro plan." },
  { code: "insufficient_scope", status: 403, meaning: "The token was not granted the scope this tool needs." },
  { code: "minute_limit", status: 429, meaning: "Too many calls in the current minute. Retry-After is 60 seconds." },
  { code: "daily_limit", status: 429, meaning: "The day's allowance is used. Retry-After is the seconds until midnight UTC." },
  { code: "stock_not_found", status: 404, meaning: "The ticker is not in our catalog for that market." },
  { code: "invalid_ticker", status: 400, meaning: "The ticker is empty or longer than 20 characters." },
  { code: "invalid_query", status: 400, meaning: "The search text is empty." },
  { code: "invalid_tickers", status: 400, meaning: "A comparison needs between 2 and 5 different tickers." },
  { code: "invalid_alert_kind", status: 400, meaning: "The alert kind is unknown, or is one agents cannot create. Agents create price_threshold alerts only." },
  { code: "invalid_condition", status: 400, meaning: "A price alert needs condition above or below." },
  { code: "invalid_target_price", status: 400, meaning: "A price alert needs a positive target_price." },
  { code: "alert_exists", status: 409, meaning: "An identical active alert is already set." },
  { code: "alert_not_found", status: 404, meaning: "No alert with that id belongs to this account." },
  { code: "email_required", status: 409, meaning: "The account has no email address to send alerts to." },
  { code: "profile_not_ready", status: 409, meaning: "The account has not finished setting up. Open the app once and retry." },
  { code: "invalid_slug", status: 400, meaning: "The copy test slug has characters a slug cannot have." },
  { code: "copy_test_not_found", status: 404, meaning: "No copy test has that slug, or no fund or House member matches the search." },
  { code: "copy_tests_unavailable", status: 503, meaning: "The copy tests could not be loaded. Retry later." },
  { code: "portfolio_unavailable", status: 503, meaning: "Your holdings could not be read just now. Retry in a minute." },
  { code: "invalid_request", status: 400, meaning: "The watch request is empty or longer than 300 characters." },
  { code: "plain_parse_limit", status: 429, meaning: "The day's plain-English requests are used up, shared with the Agents page." },
  { code: "basket_not_found", status: 404, meaning: "No idea basket with that id belongs to this account." },
  { code: "invalid_basket_id", status: 400, meaning: "The basket id is empty." },
  { code: "baskets_unavailable", status: 503, meaning: "Your idea baskets could not be read just now. Retry in a minute." },
  { code: "market_unavailable", status: 503, meaning: "The market brief could not be loaded. Retry later." },
  { code: "screens_unavailable", status: 503, meaning: "The screen catalog could not be loaded. Retry later." },
  { code: "internal_error", status: 500, meaning: "Something failed on our side." },
];

/** The research states a stock can be in. Agents should treat this as fact. */
export const COVERAGE_STATES: { state: string; meaning: string }[] = [
  { state: "ready", meaning: "A full call exists. Use it." },
  { state: "queued", meaning: "Research has been requested and is waiting to run. Check again later." },
  { state: "running", meaning: "Research is being written now. Check again later." },
  { state: "baseline_only", meaning: "We have prices and facts but no call. Ask the person before adding the stock to their portfolio to queue research." },
  { state: "no_sources", meaning: "Research ran and found nothing recent to build a call from." },
  { state: "failed", meaning: "Research ran and failed." },
  { state: "unavailable", meaning: "We hold nothing for this stock." },
];
