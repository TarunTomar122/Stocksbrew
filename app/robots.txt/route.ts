export function GET() {
  const rules = `Allow: /
Allow: /api/v1/openapi.json
Disallow: /api/
Disallow: /profile
Disallow: /watchlist
Disallow: /dev/`;
  const body = `# Search and answer engines that can cite Stocksbrew pages.
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Googlebot
User-agent: bingbot
${rules}

User-agent: *
Allow: /
Allow: /api/v1/openapi.json
Disallow: /api/
Disallow: /profile
Disallow: /watchlist
Disallow: /dev/

Sitemap: https://www.stocksbrew.online/sitemap.xml
# Plain-text site guide: https://www.stocksbrew.online/llms.txt
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
