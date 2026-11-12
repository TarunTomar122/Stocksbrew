import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

// Kept so an old share link still unfurls with its card before the redirect.
export const metadata: Metadata = toolPageMetadata("/portfolio/stress");

/** The stress test is a module of What you own now: past crashes replayed on today's mix. */
export default function StressPage(): never {
  redirect("/portfolio/xray#crashes");
}
