import { NextRequest, NextResponse } from "next/server";

import { anonymousSubject, consumeImportRead, refundImportRead } from "@/lib/import/limits";
import { getImportDirectory, getImportViewer, resolveImport } from "@/lib/import/server";
import { cleanClientHoldings } from "@/lib/import/normalize";
import { MAX_TEXT_CHARS, parseHoldingsText } from "@/lib/import/text";
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES, sniffImage } from "@/lib/import/upload";
import { importModel, readHoldingsWithModel, type VisionImage } from "@/lib/import/vision";

/**
 * POST /api/import/parse: screenshots, pasted text or a CSV in, a list of
 * holdings to review out. Works signed in or out. Nothing is stored: images
 * live in memory for the one model call and are dropped with the request.
 * Only model reads are counted (lib/import/limits.ts).
 *
 * Form fields: `images` (up to 4 PNG, JPEG or WebP files), `text`, or
 * `holdings` (JSON rows a browser read from a CSV file, checked by rules only).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The rows a browser sends after reading a CSV: 100 rows of ticker, name and three numbers fit well inside this. */
const MAX_HOLDINGS_JSON = 40_000;
/** Longest text handed to the model when our rules cannot read it. */
const MAX_MODEL_TEXT_CHARS = 20_000;

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "too_large");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request");
  }

  // Holdings the browser already read from a CSV file (lib/import/brokers.ts): checked against the stocks we cover, nothing else.
  const holdingsRaw = form.get("holdings");
  if (typeof holdingsRaw === "string" && holdingsRaw) {
    if (holdingsRaw.length > MAX_HOLDINGS_JSON) return fail(413, "too_large");
    let list: unknown = null;
    try {
      list = JSON.parse(holdingsRaw);
    } catch {
      return fail(400, "bad_request");
    }
    const holdings = cleanClientHoldings(list);
    if (!holdings) return fail(400, "bad_request");
    const directory = await getImportDirectory();
    if (directory.byTicker.size === 0) return fail(503, "directory_unavailable");
    return NextResponse.json({ rows: await resolveImport(holdings, directory), input: "csv", via: "rules", not_holdings: false, remaining: null });
  }

  const files = form.getAll("images").filter((item): item is File => typeof item === "object" && item !== null && "arrayBuffer" in item);
  const textRaw = form.get("text");
  const text = typeof textRaw === "string" ? textRaw.trim() : "";
  if (files.length === 0 && !text) return fail(400, "empty");
  if (files.length > MAX_IMAGES) return fail(400, "too_many_images", { max: MAX_IMAGES });
  if (text.length > MAX_TEXT_CHARS) return fail(400, "text_too_long", { max: MAX_TEXT_CHARS });

  const images: VisionImage[] = [];
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) return fail(413, "image_too_large");
    total += file.size;
    if (total > MAX_BODY_BYTES) return fail(413, "too_large");
    const data = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImage(data);
    if (!mediaType) return fail(400, "not_an_image");
    images.push({ data, mediaType });
  }

  const [viewer, directory] = await Promise.all([getImportViewer(), getImportDirectory()]);
  if (directory.byTicker.size === 0) return fail(503, "directory_unavailable");

  // Text first by rules: a CSV or a list of tickers costs nothing.
  if (images.length === 0) {
    const ruled = parseHoldingsText(text);
    const rows = await resolveImport(ruled.rows, directory, viewer.uid);
    // A few characters the rules could not place are not worth a model read either. A broker export
    // whose lines were all left out (only cash, say) is answered too, so the person sees why.
    if (rows.some((row) => row.status !== "unknown") || text.replace(/\s/g, "").length < 6 || ruled.csv) {
      return NextResponse.json({ rows, input: ruled.input, via: "rules", not_holdings: false, remaining: null, ...(ruled.csv ? { csv: ruled.csv } : {}) });
    }
  }

  // The model reads at most a screenful of text (alone or next to screenshots); longer text is refused before a read is spent.
  if (text.length > MAX_MODEL_TEXT_CHARS) return fail(400, "text_too_long", { max: MAX_MODEL_TEXT_CHARS });

  // No model configured: say so without spending anyone's read.
  if (!importModel()) return fail(503, "no_model");

  const subject = viewer.uid ?? anonymousSubject(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  const meter = await consumeImportRead(viewer.plan, subject);
  if (!meter.allowed) {
    return fail(429, meter.reason === "everyone" ? "busy" : "limit", { limit: meter.limit, plan: viewer.plan });
  }

  const result = await readHoldingsWithModel({ images, text: text || null });
  if (!result.ok) {
    // The model never answered, so the read is given back.
    await refundImportRead(viewer.plan, subject);
    return fail(result.code === "no_model" ? 503 : 502, result.code);
  }
  return NextResponse.json({
    rows: await resolveImport(result.holdings, directory, viewer.uid),
    input: images.length > 0 ? "image" : "text",
    via: "model",
    not_holdings: result.notHoldings,
    remaining: meter.remaining,
  });
}
