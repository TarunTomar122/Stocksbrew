import { renderPremarketShareImage } from "@/lib/premarket-share-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await renderPremarketShareImage();
  } catch (error) {
    console.error("Pre-market share image generation failed:", error);
    return new Response("Failed to generate pre-market share image", { status: 500 });
  }
}
