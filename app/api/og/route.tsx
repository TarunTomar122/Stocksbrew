import { renderSiteShareImage } from "@/lib/og-site-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const image = await renderSiteShareImage();
    return image;
  } catch (error) {
    console.error("OG image generation failed:", error);
    return new Response("Failed to generate OG image", { status: 500 });
  }
}
