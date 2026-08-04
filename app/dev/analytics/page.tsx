import { notFound } from "next/navigation";

import { AnalyticsPeriodToggle } from "@/components/analytics-period-toggle";
import { DevAnalyticsDashboard } from "@/components/dev-analytics-dashboard";
import { loadDevBusinessMetrics } from "@/lib/dev-business-metrics";
import { loadDevEngagementMetrics } from "@/lib/dev-engagement-metrics";
import { isPostHogQueryConfigured, loadPostHogAnalytics } from "@/lib/posthog-server";

function parsePeriodDays(raw: string | undefined): 7 | 30 {
  return raw === "30" ? 30 : 7;
}

export default async function DevAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const days = parsePeriodDays(params.days);

  const [business, engagement, posthog] = await Promise.all([
    loadDevBusinessMetrics(days),
    loadDevEngagementMetrics(days),
    loadPostHogAnalytics(days),
  ]);

  const posthogReady = isPostHogQueryConfigured() && !posthog.error;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">App analytics</h1>
          <p className="text-sm text-[#6b7280]">
            Human traffic, Watchlist activation, retention, and conversions · stocksbrew.online only
          </p>
        </div>
        <AnalyticsPeriodToggle days={days} />
      </div>

      {!isPostHogQueryConfigured() && (
        <div className="mt-6 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-4 text-[13px] text-[#92400e]">
          Add <code className="font-mono text-[12px]">POSTHOG_PERSONAL_API_KEY</code> to{" "}
          <code className="font-mono text-[12px]">.env.local</code> (scope:{" "}
          <strong>query:read</strong>) to load charts.
        </div>
      )}

      {posthog.error && (
        <div className="mt-6 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-5 py-4 text-[13px] text-[#991b1b]">
          PostHog query error: {posthog.error}
        </div>
      )}

      <div className="mt-8">
        <DevAnalyticsDashboard
          posthog={posthog}
          business={business}
          engagement={engagement}
          posthogReady={posthogReady}
        />
      </div>
    </main>
  );
}
