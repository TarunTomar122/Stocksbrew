import { cookies, headers } from "next/headers";

import { AnalyticsDashboard, BEFORE_WORDS, RangePicker } from "@/components/admin-analytics/dashboard";
import { AdminGate, AdminSignOut } from "@/components/admin-analytics/gate";
import { AppPage, Empty, PageHead } from "@/components/oa/kit";
import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { loadDashboard, loadLive, parseRange } from "@/lib/analytics/dashboard";
import { analyticsNamespace } from "@/lib/analytics/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The owner's analytics. Every request checks the signed admin cookie here, in
 * the page itself (a layout is no guard: Next renders pages alongside it). Without
 * it the page is the password form and nothing else: no data is read.
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: { range?: string } }) {
  if (!adminConfigured()) {
    return (
      <AppPage width="dash">
        <Empty title="This page isn't set up yet" />
      </AppPage>
    );
  }
  if (!verifyAdminCookie(cookies().get(ADMIN_COOKIE)?.value)) {
    return (
      <AppPage width="dash">
        <AdminGate />
      </AppPage>
    );
  }

  const range = parseRange(searchParams?.range);
  const ns = analyticsNamespace(headers().get("host"));
  const [data, live] = await Promise.all([loadDashboard(ns, range).catch(() => null), loadLive(ns).catch(() => null)]);
  return (
    <AppPage width="dash">
      <PageHead
        title="Analytics"
        meta={<span>{BEFORE_WORDS[range]}</span>}
        actions={
          <>
            <RangePicker current={range} />
            <AdminSignOut />
          </>
        }
        note={false}
      />
      {data ? (
        <AnalyticsDashboard data={data} live={live} />
      ) : (
        <Empty title="Couldn't load the numbers">The store didn&apos;t answer. Reload in a minute.</Empty>
      )}
    </AppPage>
  );
}
