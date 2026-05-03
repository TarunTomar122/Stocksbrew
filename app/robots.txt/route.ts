export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /profile
Disallow: /watchlist
Disallow: /_next/

Sitemap: https://tikrr.com/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
