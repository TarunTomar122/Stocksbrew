/**
 * Server-side fetchers for Yahoo Finance public JSON endpoints.
 *
 * This is the "v v easily gettable" data layer — no API key, no Python.
 * Used on the stock detail page to render a real multi-range chart and
 * basic fundamentals (PE, PB, Div Yield, Market Cap) that our Firestore
 * pipeline doesn't populate yet.
 *
 * Uses Next.js fetch caching (`revalidate`) so repeated server calls during
 * a request cycle hit the CDN-cached response, not Yahoo.
 *
 * Rate-limit / stability note: these endpoints are unofficial. We wrap all
 * calls in try/catch and return `null` on failure — the UI must degrade
 * gracefully.
 */

export type YahooRange = "1D" | "1W" | "1M" | "1Y" | "5Y" | "MAX";

export type YahooChartPoint = {
  t: number; // unix seconds
  close: number;
};

export type YahooChart = {
  range: YahooRange;
  currency: string;
  points: YahooChartPoint[];
  previousClose: number | null;
};

export type YahooFundamentals = {
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null; // as decimal, e.g. 0.012 = 1.2%
  marketCap: number | null;
  trailingEps: number | null;
  averageAnalystRating: string | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
};

const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  Origin: "https://finance.yahoo.com",
};

const CHART_HOST = "https://query2.finance.yahoo.com/v8/finance/chart";
const QUOTE_HOST = "https://query2.finance.yahoo.com/v7/finance/quote";

/* ──────────────────────────────────────────────────────
   Crumb auth — Yahoo Finance requires a session crumb
   obtained by first visiting the main site.
   We cache the crumb in a module-level variable so it
   survives across requests in the same Node process.
────────────────────────────────────────────────────── */
type CrumbCache = { crumb: string; cookie: string; expiresAt: number };
let _crumbCache: CrumbCache | null = null;

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (_crumbCache && _crumbCache.expiresAt > Date.now()) {
    return { crumb: _crumbCache.crumb, cookie: _crumbCache.cookie };
  }

  try {
    // Step 1: hit the main site to establish a session + get cookies
    const homeRes = await fetch("https://finance.yahoo.com/", {
      headers: BASE_HEADERS,
      redirect: "follow",
    });
    const rawCookie = homeRes.headers.get("set-cookie") ?? "";
    // Extract just the A3 / GUC / GUCS cookies Yahoo cares about
    const cookie = rawCookie
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    // Step 2: exchange cookies for a crumb token
    const crumbRes = await fetch(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      { headers: { ...BASE_HEADERS, Cookie: cookie } },
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("<")) return null; // HTML = not authenticated

    _crumbCache = { crumb, cookie, expiresAt: Date.now() + 55 * 60 * 1000 }; // 55 min
    return { crumb, cookie };
  } catch {
    return null;
  }
}

const RANGE_PARAMS: Record<YahooRange, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  MAX: { range: "max", interval: "1mo" },
};

function toYahooSymbol(symbol: string, market: string): string {
  const s = symbol.trim().toUpperCase();
  if (market === "india" && !s.includes(".")) {
    // Default Indian tickers to NSE suffix. Users searching BSE can still pass a raw .BO symbol.
    return `${s}.NS`;
  }
  return s;
}

async function yahooFetch(url: string, revalidateSec: number): Promise<unknown | null> {
  const auth = await getYahooCrumb();
  const headers: Record<string, string> = { ...BASE_HEADERS };
  let fetchUrl = url;

  if (auth) {
    headers["Cookie"] = auth.cookie;
    // Append crumb as a query param
    fetchUrl += (url.includes("?") ? "&" : "?") + `crumb=${encodeURIComponent(auth.crumb)}`;
  }

  try {
    const res = await fetch(fetchUrl, {
      headers,
      next: { revalidate: revalidateSec },
    });
    if (res.status === 429) {
      // Rate limited — bust the crumb cache so next request re-authenticates
      _crumbCache = null;
      console.warn("[yahoo-finance] 429 rate limited, crumb reset");
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export async function fetchChart(
  symbol: string,
  market: string,
  range: YahooRange,
): Promise<YahooChart | null> {
  const ySymbol = toYahooSymbol(symbol, market);
  const { range: r, interval } = RANGE_PARAMS[range];
  const url = `${CHART_HOST}/${encodeURIComponent(ySymbol)}?range=${r}&interval=${interval}&includePrePost=false`;

  // 1D charts refresh often; longer ranges can cache for hours.
  const revalidate = range === "1D" ? 60 : range === "1W" ? 300 : 3600;

  const json = await yahooFetch(url, revalidate);
  if (!json || typeof json !== "object") return null;

  const chart = (json as { chart?: { result?: unknown[] } }).chart;
  if (!chart || !Array.isArray(chart.result) || chart.result.length === 0) return null;

  const result = chart.result[0] as {
    meta?: { currency?: string; previousClose?: number; chartPreviousClose?: number };
    timestamp?: number[];
    indicators?: { quote?: Array<{ close?: Array<number | null> }> };
  };

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  if (timestamps.length === 0 || closes.length === 0) return null;

  const points: YahooChartPoint[] = [];
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i += 1) {
    const close = closes[i];
    const t = timestamps[i];
    if (typeof close === "number" && Number.isFinite(close) && typeof t === "number") {
      points.push({ t, close });
    }
  }
  if (points.length < 2) return null;

  return {
    range,
    currency: result.meta?.currency ?? "USD",
    points,
    previousClose:
      typeof result.meta?.previousClose === "number"
        ? result.meta.previousClose
        : typeof result.meta?.chartPreviousClose === "number"
          ? result.meta.chartPreviousClose
          : null,
  };
}

export async function fetchFundamentals(
  symbol: string,
  market: string,
): Promise<YahooFundamentals | null> {
  const ySymbol = toYahooSymbol(symbol, market);
  const url = `${QUOTE_HOST}?symbols=${encodeURIComponent(ySymbol)}`;
  const json = await yahooFetch(url, 1800);
  if (!json || typeof json !== "object") return null;

  const response = (json as { quoteResponse?: { result?: unknown[] } }).quoteResponse;
  const row = response?.result?.[0] as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const num = (key: string): number | null => {
    const v = row[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const str = (key: string): string | null => {
    const v = row[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };

  return {
    trailingPE: num("trailingPE"),
    forwardPE: num("forwardPE"),
    priceToBook: num("priceToBook"),
    dividendYield: num("trailingAnnualDividendYield") ?? num("dividendYield"),
    marketCap: num("marketCap"),
    trailingEps: num("epsTrailingTwelveMonths"),
    averageAnalystRating: str("averageAnalystRating"),
    recommendationKey: str("recommendationKey"),
    numberOfAnalystOpinions: num("numberOfAnalystOpinions"),
  };
}

/**
 * Fetch chart + fundamentals in parallel for a stock page.
 * Returns `null` entries independently; never throws.
 */
export async function fetchStockMarketData(
  symbol: string,
  market: string,
  range: YahooRange = "1Y",
): Promise<{ chart: YahooChart | null; fundamentals: YahooFundamentals | null }> {
  const [chart, fundamentals] = await Promise.all([
    fetchChart(symbol, market, range),
    fetchFundamentals(symbol, market),
  ]);
  return { chart, fundamentals };
}
