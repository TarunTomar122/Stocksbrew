"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { nextVisit, trackedClickFor, type VisitLog } from "@/lib/analytics-dom";
import { captureEvent, initPostHog } from "@/lib/posthog";
import { pageArea, setAnalyticsPlan, trackUserReturned, type PlanName } from "@/lib/product-analytics";
import { identifyAiReferrer } from "@/lib/seo/ai-referral";

const VISITS_KEY = "sb_visits";

function readVisits(): VisitLog | null {
  try {
    const raw = window.localStorage.getItem(VISITS_KEY);
    return raw ? (JSON.parse(raw) as VisitLog) : null;
  } catch {
    return null;
  }
}

/**
 * Site-wide analytics, mounted once in app/providers.tsx (so on every page,
 * landing and app alike):
 *  - $pageview on the first load and on every app-router navigation to a new path;
 *  - `user_returned` on the first visit of a later day;
 *  - the `plan` / `signed_in` super properties once auth is known;
 *  - clicks declared with data-track / data-track-links (lib/analytics-dom.ts).
 */
export function PostHogPageview() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { user, loading } = useUser();
  const planFor = useRef<string | null>(null);
  const firstView = useRef(true);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    initPostHog();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { log, returned } = nextVisit(readVisits(), today);
      window.localStorage.setItem(VISITS_KEY, JSON.stringify(log));
      if (returned) trackUserReturned(returned);
    } catch {
      // storage can be blocked; the visit simply is not counted as returning
    }

    function onClick(event: MouseEvent) {
      try {
        const tracked = trackedClickFor(event.target);
        if (tracked) captureEvent(tracked.event, { ...tracked.properties, page: pageArea(window.location.pathname) });
      } catch {
        // never let analytics break a click
      }
    }
    // Capture phase: runs even when a handler further down stops propagation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const query = search?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    // One view per page. Query-only changes (a screener filter, a tab, a chart
    // range written to the URL with router.replace) are not new pageviews, or
    // filter-heavy pages would look busier than they are. A re-run for the same
    // path (React strict mode, a new searchParams object) is skipped too.
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    // document.referrer only describes how the visit started; on later
    // client-side navigations it is stale, so send it with the first view only.
    const referrer = firstView.current && typeof document !== "undefined" ? document.referrer || null : null;
    firstView.current = false;
    const aiReferrer = identifyAiReferrer(referrer);
    captureEvent("$pageview", {
      $current_url: typeof window !== "undefined" ? `${window.location.origin}${url}` : url,
      path: pathname,
      area: pageArea(pathname),
      referrer,
      ai_referrer: aiReferrer,
      discovery_channel: aiReferrer ? "ai_answer" : null,
      utm_source: search?.get("utm_source") || null,
      utm_medium: search?.get("utm_medium") || null,
      utm_campaign: search?.get("utm_campaign") || null,
      source: search?.get("ref") || search?.get("source") || null,
    });
  }, [pathname, search]);

  // plan / signed_in on every later event. Signed out is set by lib/auth-context.tsx.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Signed out (auth-context set `anon`): signing back in, even as the same uid, sets the plan again.
      planFor.current = null;
      return;
    }
    if (planFor.current === user.uid) return;
    planFor.current = user.uid;
    const cacheKey = `sb_plan:${user.uid}`;
    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached === "free" || cached === "pro") {
        setAnalyticsPlan(cached);
        return;
      }
    } catch {
      // fall through to the fetch
    }
    void fetch("/api/user/profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { plan?: PlanName } | null) => {
        const plan: PlanName = payload?.plan === "pro" ? "pro" : "free";
        setAnalyticsPlan(plan);
        try {
          window.sessionStorage.setItem(cacheKey, plan);
        } catch {
          // best effort
        }
      })
      .catch(() => undefined);
  }, [user, loading]);

  return null;
}
