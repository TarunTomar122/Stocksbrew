#!/usr/bin/env node
/**
 * Submit priority SEO URLs to IndexNow (Bing/Yandex).
 * Usage: npm run seo:indexnow
 * Optional: REVALIDATE_TOKEN=... npm run seo:indexnow -- --api
 *   POSTs to /api/seo/indexnow on production instead of calling IndexNow directly.
 */

const INDEXNOW_KEY = "stocksbrew-seo-2026";
const SITE_HOST = "www.stocksbrew.online";
const SITE_ORIGIN = `https://${SITE_HOST}`;

const PRIORITY_PATHS = [
  "/",
  "/blog",
  "/stocks",
  "/sectors",
  "/pulse",
  "/news",
  "/earnings",
  "/stock/NVDA",
  "/stock/MSFT",
  "/stock/GOOGL",
  "/stock/AAPL",
  "/stock/AMZN",
  "/sectors/technology",
  "/movers",
  "/compare/amd-vs-nvda",
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
  "/radar",
  "/resources",
  "/compare",
  "/guides",
  "/authors/tarun-tomar",
  "/editorial-policy",
  "/should-i-buy",
  "/blog/stock-research-checklist-evidence-first",
  "/blog/watchlist-vs-portfolio-tracker",
  "/blog/earnings-season-watchlist-playbook",
  "/blog/track-stock-news-for-your-portfolio",
  "/blog/finviz-vs-tradingview-vs-stocksbrew",
  "/heat",
  "/blog/best-stock-watchlist-apps-2026",
  "/blog/best-stock-news-apps-2026",
  "/compare/stocksbrew-vs-finviz",
  "/compare/stocksbrew-vs-tradingview",
  "/compare/stocksbrew-vs-yahoo-finance",
];

async function submitDirect() {
  const urlList = PRIORITY_PATHS.map((p) => `${SITE_ORIGIN}${p}`);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });
  const text = await res.text().catch(() => "");
  console.log(JSON.stringify({ ok: res.ok || res.status === 202, status: res.status, submitted: urlList.length, body: text }, null, 2));
  process.exit(res.ok || res.status === 202 ? 0 : 1);
}

async function submitViaApi() {
  const token = process.env.REVALIDATE_TOKEN || process.env.INDEXNOW_SECRET;
  if (!token) {
    console.error("Set REVALIDATE_TOKEN to use --api mode");
    process.exit(1);
  }
  const base = process.env.SITE_URL || SITE_ORIGIN;
  const res = await fetch(`${base}/api/seo/indexnow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-revalidate-token": token },
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify(json, null, 2));
  process.exit(res.ok ? 0 : 1);
}

const useApi = process.argv.includes("--api");
void (useApi ? submitViaApi() : submitDirect());
