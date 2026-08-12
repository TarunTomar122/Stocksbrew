import { XMLParser } from "fast-xml-parser";

const base = (process.argv[2] || "https://www.stocksbrew.online").replace(/\/$/, "");
const canonicalHost = new URL(base).host;
const parser = new XMLParser();

function fail(message) {
  throw new Error(message);
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, text };
}

const sitemapResult = await fetchText(`${base}/sitemap.xml`);
if (!sitemapResult.response.ok) fail(`sitemap returned ${sitemapResult.response.status}`);
if (!sitemapResult.response.headers.get("content-type")?.includes("xml")) {
  fail("sitemap content-type is not XML");
}

const parsed = parser.parse(sitemapResult.text);
const rawEntries = parsed?.urlset?.url ?? [];
const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
const urls = entries.map((entry) => String(entry.loc || ""));
if (urls.length < 20) fail(`sitemap unexpectedly small: ${urls.length} URLs`);
if (urls.length > 150) fail(`sitemap exceeds the curated limit: ${urls.length} URLs`);
if (new Set(urls).size !== urls.length) fail("sitemap contains duplicate URLs");
if (sitemapResult.text.includes("<changefreq>") || sitemapResult.text.includes("<priority>")) {
  fail("sitemap contains ignored changefreq/priority fields");
}

for (const entry of entries) {
  const loc = new URL(String(entry.loc));
  if (loc.host !== canonicalHost) fail(`non-canonical sitemap host: ${loc.href}`);
  if (loc.search || loc.hash) fail(`sitemap URL contains query or hash noise: ${loc.href}`);
  if (entry.lastmod && new Date(entry.lastmod).getTime() > Date.now() + 86_400_000) {
    fail(`future lastmod: ${loc.href} (${entry.lastmod})`);
  }
}

const issues = [];
for (let i = 0; i < urls.length; i += 10) {
  await Promise.all(
    urls.slice(i, i + 10).map(async (url) => {
      try {
        const { response, text } = await fetchText(url, { redirect: "manual" });
        const canonical = text.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
        const title = text.match(/<title>(.*?)<\/title>/is)?.[1];
        const noindex = /<meta name="robots" content="[^"]*noindex/i.test(text);
        const normalizedUrl = url.endsWith("/") && url !== `${base}/` ? url.slice(0, -1) : url;
        const normalizedCanonical = canonical?.endsWith("/") && canonical !== `${base}/`
          ? canonical.slice(0, -1)
          : canonical;
        if (response.status !== 200 || !title || !canonical || noindex || normalizedCanonical !== normalizedUrl) {
          issues.push({ url, status: response.status, title: Boolean(title), canonical, noindex });
        }
      } catch (error) {
        issues.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }),
  );
}

if (issues.length) {
  console.error(JSON.stringify(issues, null, 2));
  fail(`${issues.length} sitemap URLs failed the crawl contract`);
}

for (const path of ["/", "/blog/stock-research-checklist-evidence-first", "/compare/stocksbrew-vs-finviz"]) {
  const response = await fetch(`https://www.tikrr.online${path}`, { redirect: "manual" });
  const expected = `${base}${path}`;
  if (response.status !== 308 || response.headers.get("location") !== expected) {
    fail(`old-host redirect failed for ${path}: ${response.status} ${response.headers.get("location")}`);
  }
}

const feed = await fetch(`${base}/feed.xml`);
if (!feed.ok || !feed.headers.get("content-type")?.includes("rss+xml")) {
  fail(`RSS feed failed: ${feed.status} ${feed.headers.get("content-type")}`);
}

console.log(`SEO audit passed: ${urls.length} canonical sitemap URLs, old-host redirects, and RSS feed.`);
