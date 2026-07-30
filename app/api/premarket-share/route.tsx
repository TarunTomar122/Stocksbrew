import { renderPremarketShareImage, type PremarketShareFormat } from "@/lib/premarket-share-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format") === "social" ? "social" : "open_graph";
    return await renderPremarketShareImage(format as PremarketShareFormat);
  } catch (error) {
    console.error("Pre-market share image generation failed:", error);
    return new Response("Failed to generate pre-market share image", { status: 500 });
  }
}
