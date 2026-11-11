const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY = "stocksbrew-seo-2026";
export const SITE_HOST = "www.stocksbrew.online";
export const SITE_ORIGIN = `https://${SITE_HOST}`;

export type IndexNowResult = {
  ok: boolean;
  status: number;
  submitted: number;
  error?: string;
};

/** IndexNow takes at most 10,000 URLs in one POST (https://www.indexnow.org/documentation). */
export const INDEXNOW_BATCH = 10_000;
/** A ceiling per call, far above what the site has (about 700 stock pages), so a bad caller cannot flood the endpoint. */
export const INDEXNOW_MAX_URLS = 50_000;

/** Absolute, de-duplicated addresses on our own host, in the order given. */
export function indexNowUrls(urls: string[]): string[] {
  const absolute = urls
    .map((u) => (u.startsWith("http") ? u : `${SITE_ORIGIN}${u.startsWith("/") ? u : `/${u}`}`))
    .filter((u) => u.startsWith(`${SITE_ORIGIN}/`) || u === SITE_ORIGIN);
  return [...new Set(absolute)].slice(0, INDEXNOW_MAX_URLS);
}

/**
 * Submit URLs to IndexNow (Bing, Yandex and the other engines that share it),
 * in batches of at most 10,000, one after another. The key file lives at
 * /{INDEXNOW_KEY}.txt. `ok` is true only when every batch was accepted.
 */
export async function submitIndexNow(urls: string[], fetchImpl: typeof fetch = fetch): Promise<IndexNowResult> {
  const absolute = indexNowUrls(urls);
  if (absolute.length === 0) {
    return { ok: false, status: 400, submitted: 0, error: "no_urls" };
  }

  let submitted = 0;
  let status = 200;
  for (let start = 0; start < absolute.length; start += INDEXNOW_BATCH) {
    const batch = absolute.slice(start, start + INDEXNOW_BATCH);
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
        urlList: batch,
      }),
    });
    status = res.status;
    if (!(res.ok || res.status === 202)) {
      // Stop at the first refusal (a 429 means slow down): later batches would be refused too.
      return { ok: false, status, submitted, error: await res.text().catch(() => "request_failed") };
    }
    submitted += batch.length;
  }
  return { ok: true, status, submitted };
}

/** High-priority URLs to ping after SEO deploys. */
export const SEO_PRIORITY_URLS = [
  "/screener",
  "/markets",
  "/briefing",
  "/news",
  "/calendar",
  "/stock/NVDA",
  "/stock/MSFT",
  "/stock/GOOGL",
  "/stock/AAPL",
  "/stock/AMZN",
  "/themes",
  "/blog/semiconductor-stocks-analysis-guide",
  "/blog/earnings-report-analysis-template",
  "/blog/fundamental-stock-analysis-framework",
  "/blog/analyst-ratings-price-targets-explained",
  "/blog/stock-news-catalyst-analysis",
  "/blog/best-stock-analysis-apps-2026",
  "/blog/us-stock-market-analysis-daily-workflow-2026",
  "/blog/ai-stock-analysis-comparison",
  "/blog/free-stock-market-analysis-tools",
  "/blog/stock-analysis-app-checklist",
  "/blog/best-stock-research-websites-2026",
  "/blog/best-stock-watchlist-apps-2026",
  "/blog/best-stock-news-apps-2026",
  "/blog/what-is-a-good-pe-ratio",
  "/blog/free-cash-flow-vs-net-income",
  "/blog/gross-margin-vs-operating-margin-vs-net-margin",
  "/agents",
  "/developers",
  "/blog/how-to-connect-ai-agent-stock-market-data-mcp",
  "/blog/stock-research-prompts-for-ai-agents",
  "/blog/hermes-agent-stock-market-data-watchlist",
  "/blog/openclaw-stock-alerts-telegram-whatsapp-discord",
  "/blog/ai-agent-stock-watchlist-radar-alerts",
  "/follow",
  "/docs",
  "/compare",
  "/strategies",
  "/about",
  "/docs/methodology",
  "/pricing",
  "/blog/stock-research-checklist-evidence-first",
  "/blog/watchlist-vs-portfolio-tracker",
  "/blog/earnings-season-watchlist-playbook",
  "/blog/finviz-vs-tradingview-vs-stocksbrew",
  "/signals",
  // Page families built from stored data (lib/seo/families.ts). Move pages are pinged by the
  // mover research job as they are published (backend/scripts/research_daily_anomaly_reasons.py).
  "/sectors",
  "/sectors/technology",
  "/sectors/financials",
  "/sectors/health-care",
  "/sectors/consumer-discretionary",
  "/sectors/industrials",
  "/sectors/communication-services",
  "/sectors/energy",
  "/movers",
  "/insiders",
  "/compare/amd-vs-nvda",
  "/compare/ko-vs-pep",
  "/compare/cvx-vs-xom",
  "/compare/bac-vs-jpm",
  "/compare/lly-vs-nvo",
];
