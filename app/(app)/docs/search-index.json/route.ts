import { buildSearchIndex } from "@/lib/docs";

export const dynamic = "force-static";

/** The full-text index the docs search fetches the first time it is focused. */
export function GET() {
  return Response.json(
    { entries: buildSearchIndex() },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
