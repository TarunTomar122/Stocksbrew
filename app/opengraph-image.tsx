import { renderSiteShareImage } from "@/lib/og-site-share";

export const runtime = "nodejs";
export const alt = "stocksbrew — clear buy, hold, and sell calls on US stocks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return renderSiteShareImage();
}
