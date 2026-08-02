import { NextRequest, NextResponse } from "next/server";

import { SEO_PRIORITY_URLS, submitIndexNow } from "@/lib/seo/indexnow";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = process.env.REVALIDATE_TOKEN || process.env.INDEXNOW_SECRET || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = body as { urls?: unknown; include_defaults?: unknown };
  const extra = Array.isArray(payload.urls)
    ? (payload.urls as string[]).filter((u) => typeof u === "string")
    : [];
  const urls = payload.include_defaults === false ? extra : [...SEO_PRIORITY_URLS, ...extra];
  const result = await submitIndexNow(urls);

  return NextResponse.json({
    ok: result.ok,
    indexnow: result,
    sitemap: "https://www.stocksbrew.online/sitemap.xml",
    gsc_hint: "Submit sitemap in Google Search Console → Sitemaps → https://www.stocksbrew.online/sitemap.xml",
  });
}

/** GET documents the endpoint for operators (no secret required). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage: "POST with header x-revalidate-token and optional JSON body { urls: string[] }",
    default_urls: SEO_PRIORITY_URLS.length,
    sitemap: "https://www.stocksbrew.online/sitemap.xml",
    indexnow_key: "https://www.stocksbrew.online/stocksbrew-seo-2026.txt",
  });
}
