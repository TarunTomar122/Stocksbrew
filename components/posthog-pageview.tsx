"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureEvent, initPostHog } from "@/lib/posthog";
import { identifyAiReferrer } from "@/lib/seo/ai-referral";

export function PostHogPageview() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const query = search?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    const referrer = typeof document !== "undefined" ? document.referrer || null : null;
    const aiReferrer = identifyAiReferrer(referrer);
    captureEvent("$pageview", {
      $current_url: url,
      path: pathname,
      referrer,
      ai_referrer: aiReferrer,
      discovery_channel: aiReferrer ? "ai_answer" : null,
      utm_source: search?.get("utm_source") || null,
      utm_medium: search?.get("utm_medium") || null,
      utm_campaign: search?.get("utm_campaign") || null,
      source: search?.get("ref") || search?.get("source") || null,
    });
  }, [pathname, search]);

  return null;
}
