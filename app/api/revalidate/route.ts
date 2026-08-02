import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_PATHS = ["/"];
const ALLOWED_PATHS = new Set(["/", "/radar", "/watchlist", "/heat", "/news", "/screens", "/pulse", "/premarket", "/anomalies", "/resources", "/compare", "/market-daily", "/sitemap.xml", "/feed.xml", "/llms.txt"]);
const DEDUPE_MS = 60_000;

const revalidateState = globalThis as typeof globalThis & {
  __tikrrRevalidateLast?: Map<string, number>;
};

function parsePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_PATHS;
  const paths = raw
    .map((item) => String(item || "").trim())
    .filter(
      (path) =>
        ALLOWED_PATHS.has(path) ||
        /^\/market-daily\/\d{4}-\d{2}-\d{2}$/.test(path),
    );
  return paths.length ? Array.from(new Set(paths)) : DEFAULT_PATHS;
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-revalidate-token") || "";
  const expected = process.env.REVALIDATE_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const payload = body as { paths?: unknown; force?: unknown };
  const paths = parsePaths(payload.paths);
  const force = payload.force === true;
  const now = Date.now();
  const lastByPath = revalidateState.__tikrrRevalidateLast ?? new Map<string, number>();
  revalidateState.__tikrrRevalidateLast = lastByPath;

  const revalidated: string[] = [];
  const skipped: string[] = [];
  for (const path of paths) {
    const last = lastByPath.get(path) || 0;
    if (!force && now - last < DEDUPE_MS) {
      skipped.push(path);
      continue;
    }
    revalidatePath(path, "page");
    lastByPath.set(path, now);
    revalidated.push(path);
  }

  return NextResponse.json({ ok: true, revalidated, skipped });
}
