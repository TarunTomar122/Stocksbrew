import { OG_SIZE, renderSiteShareImage } from "@/lib/og-site-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "stocksbrew — clear buy, hold, and sell calls on US stocks";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderSiteShareImage();
}
