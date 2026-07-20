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

/** Submit URL list to Bing/Yandex IndexNow. Key file must live at /{INDEXNOW_KEY}.txt */
export async function submitIndexNow(urls: string[]): Promise<IndexNowResult> {
  const absolute = urls
    .map((u) => (u.startsWith("http") ? u : `${SITE_ORIGIN}${u.startsWith("/") ? u : `/${u}`}`))
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 10_000);

  if (absolute.length === 0) {
    return { ok: false, status: 400, submitted: 0, error: "no_urls" };
  }

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: SITE_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: absolute,
    }),
  });

  return {
    ok: res.ok || res.status === 202,
    status: res.status,
    submitted: absolute.length,
    error: res.ok || res.status === 202 ? undefined : await res.text().catch(() => "request_failed"),
  };
}

/** High-priority URLs to ping after SEO deploys. */
export const SEO_PRIORITY_URLS = [
  "/agents",
  "/developers",
  "/blog/how-to-connect-ai-agent-stock-market-data-mcp",
  "/blog/stock-research-prompts-for-ai-agents",
  "/radar",
  "/resources",
  "/compare",
  "/guides",
  "/authors/tarun-tomar",
  "/editorial-policy",
  "/should-i-buy",
  "/blog/stock-research-checklist-evidence-first",
  "/blog/buy-hold-sell-signals-explained",
  "/blog/watchlist-vs-portfolio-tracker",
  "/blog/earnings-season-watchlist-playbook",
  "/blog/stock-market-information-overload",
  "/blog/portfolio-health-check-guide",
  "/blog/finviz-vs-tradingview-vs-stocksbrew",
  "/heat",
  "/blog/how-to-use-stock-alerts-effectively",
  "/compare/stocksbrew-vs-finviz",
  "/compare/stocksbrew-vs-tradingview",
  "/compare/stocksbrew-vs-yahoo-finance",
];
