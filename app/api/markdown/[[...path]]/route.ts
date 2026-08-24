import { buildLlmsMarkdown } from "@/lib/llms";

const BASE = "https://www.stocksbrew.online";

function headers() {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept",
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
  };
}

export async function GET(_request: Request, { params }: { params: { path?: string[] } }) {
  const path = params.path || [];
  if (path.length === 0 || path.join("/") === "llms.txt") {
    return new Response(await buildLlmsMarkdown(), { headers: headers() });
  }

  return new Response(
    `# Page not found

The requested Stocksbrew URL does not exist.

Try:
- [Sitemap](${BASE}/sitemap.xml)
- [Agent index](${BASE}/llms.txt)
- [Agent docs](${BASE}/agents)
`,
    { status: 404, headers: headers() },
  );
}
