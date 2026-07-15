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
  "/radar",
  "/resources",
  "/compare",
  "/guides",
  "/should-i-buy",
  "/blog/buy-hold-sell-signals-explained",
  "/blog/watchlist-vs-portfolio-tracker",
  "/blog/earnings-season-watchlist-playbook",
  "/blog/stock-market-information-overload",
  "/blog/portfolio-health-check-guide",
  "/blog/ai-stock-analysis-comparison",
  "/blog/stock-market-heatmap-tools",
  "/blog/how-to-use-stock-alerts-effectively",
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
