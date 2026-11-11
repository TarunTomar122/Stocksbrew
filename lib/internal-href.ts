/**
 * Whether an href is a page inside this app, so a click can be a client-side
 * navigation (next/link) instead of a full page load. Not: other sites,
 * protocol-relative URLs, mail/tel links, same-page hashes, API routes and
 * files (exports, feeds, sitemaps, JSON), which must keep a plain <a>.
 */
const NOT_PAGES = ["/api/", "/_next/", "/.well-known/", "/mcp", "/llms.txt", "/feed.xml", "/robots.txt", "/sitemap", "/profile/export", "/docs/search-index.json", "/email/unsubscribe"];

const FILE_EXTENSION = /\.(xml|txt|json|csv|pdf|ics|md|rss|zip|png|jpe?g|gif|webp|svg|ico|js|css|webmanifest)$/i;

export function isInternalHref(href: string | null | undefined): href is string {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/)[0] ?? "";
  if (NOT_PAGES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix))) return false;
  // A file, not a page. Listed, so tickers with a class or exchange suffix (BRK.B, RELIANCE.NS) stay pages.
  return !FILE_EXTENSION.test(path);
}
