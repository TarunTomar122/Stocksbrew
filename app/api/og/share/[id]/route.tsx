import { renderShareImage } from "@/lib/share/og";
import { readShare } from "@/lib/share/store";
import { isShareId } from "@/lib/share/types";

/**
 * /api/og/share/{shareId}: the image of a saved share card. It draws only the
 * stored snapshot, looked up by id; no text travels in the address. A missing
 * or deleted share is a 404 with no image.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = String(params.id ?? "");
  if (!isShareId(id)) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const share = await readShare(id).catch((error) => {
    console.error("og: share read failed", error instanceof Error ? error.message : error);
    return undefined;
  });
  if (share === undefined) return new Response("Could not read this card", { status: 503, headers: { "cache-control": "no-store" } });
  if (!share) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
  try {
    return await renderShareImage(share.card, `/s/${id}`);
  } catch (error) {
    console.error("og: share render failed", error);
    return new Response("Could not draw this card", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
