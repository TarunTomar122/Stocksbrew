import { NextRequest, NextResponse } from "next/server";

import { SEO_PRIORITY_URLS, submitIndexNow } from "@/lib/seo/indexnow";
import { isSitemapFamily, sitemapEntries, type SitemapFamily } from "@/lib/seo/sitemap";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The addresses in whole sitemap families (the same lists as /sitemaps/<family>.xml),
 * optionally only those whose content changed on or after `changedSince` (their
 * sitemap `lastmod`). A family that cannot be read is skipped and named in `errors`.
 */
async function familyPaths(families: SitemapFamily[], changedSince: string | null): Promise<{ paths: string[]; errors: string[] }> {
  const paths: string[] = [];
  const errors: string[] = [];
  for (const family of families) {
    try {
      const entries = await sitemapEntries(family, undefined, { onDegraded: (reason) => errors.push(`${family}: ${reason}`) });
      for (const entry of entries) {
        // With a cut-off, an entry without a date is left out: we cannot tell that it changed.
        if (changedSince && !(entry.lastmod && entry.lastmod >= changedSince)) continue;
        paths.push(entry.path);
      }
    } catch (error) {
      errors.push(`${family}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { paths, errors };
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = process.env.REVALIDATE_TOKEN || process.env.INDEXNOW_SECRET || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = body as { urls?: unknown; include_defaults?: unknown; families?: unknown; changed_since?: unknown };
  const extra = Array.isArray(payload.urls)
    ? (payload.urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const families = Array.isArray(payload.families)
    ? (payload.families as unknown[]).filter((f): f is SitemapFamily => typeof f === "string" && isSitemapFamily(f))
    : [];
  const changedSince = typeof payload.changed_since === "string" && DAY_RE.test(payload.changed_since) ? payload.changed_since : null;
  const fromFamilies = families.length ? await familyPaths(families, changedSince) : { paths: [], errors: [] };
  if (fromFamilies.errors.length) console.error(`[indexnow] sitemap families not read in full: ${fromFamilies.errors.join("; ")}`);

  const urls = payload.include_defaults === false ? [...extra, ...fromFamilies.paths] : [...SEO_PRIORITY_URLS, ...extra, ...fromFamilies.paths];
  const result =
    urls.length === 0 && families.length
      ? // Nothing to send: fine when nothing changed since the cut-off, a failure when a family could not be read.
        fromFamilies.errors.length
        ? { ok: false, status: 503, submitted: 0, error: "families_unreadable" }
        : { ok: true, status: 204, submitted: 0 }
      : await submitIndexNow(urls);

  return NextResponse.json({
    ok: result.ok,
    indexnow: result,
    families: families.length ? { names: families, changed_since: changedSince, urls: fromFamilies.paths.length, errors: fromFamilies.errors } : undefined,
    sitemap: "https://www.stocksbrew.online/sitemap.xml",
    gsc_hint: "Submit sitemap in Google Search Console → Sitemaps → https://www.stocksbrew.online/sitemap.xml",
  });
}

/** GET documents the endpoint for operators (no secret required). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    usage:
      'POST with header x-revalidate-token and optional JSON body { urls: string[], families: ["stocks"], changed_since: "YYYY-MM-DD", include_defaults: false }. Families are sitemap families; changed_since keeps only addresses whose lastmod is that day or later.',
    default_urls: SEO_PRIORITY_URLS.length,
    sitemap: "https://www.stocksbrew.online/sitemap.xml",
    indexnow_key: "https://www.stocksbrew.online/stocksbrew-seo-2026.txt",
  });
}
