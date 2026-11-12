import { pageCard } from "@/lib/og/data";
import { renderOgCard } from "@/lib/og/render";

/**
 * The premarket share image. It used to be drawn in its own palette; it is now
 * the same card as `/api/og/page/premarket` (the brew palette, S&P 500 futures
 * as the big number, the gappers as logo chips, no coloured edges), so a
 * premarket link looks the same wherever it is shared. `?format=social` is
 * still accepted and gets the same card.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await renderOgCard(await pageCard("premarket"));
  } catch (error) {
    console.error("Pre-market share image generation failed:", error);
    return new Response("Failed to generate pre-market share image", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
