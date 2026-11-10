import { landingCard, notFoundCard } from "@/lib/og/data";
import { renderOgCard } from "@/lib/og/render";

/** The default share card (home page and every page without its own): the headline and today's call on a real stock. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const card = await landingCard().catch((error) => {
      console.error("og: landing card failed", error);
      return notFoundCard();
    });
    return await renderOgCard(card);
  } catch (error) {
    console.error("og: render failed", error);
    return new Response("Could not draw this card", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
