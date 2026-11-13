import { cookies, headers } from "next/headers";

import { AnalyticsDashboard, BEFORE_WORDS, RangePicker } from "@/components/admin-analytics/dashboard";
import { AdminGate, AdminSignOut } from "@/components/admin-analytics/gate";
import { SystemDashboard } from "@/components/admin-analytics/system";
import { AppPage, Empty, PageHead, TabBar } from "@/components/oa/kit";
import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { loadDashboard, loadLive, parseRange } from "@/lib/analytics/dashboard";
import { analyticsNamespace } from "@/lib/analytics/db";
import { loadOpsHealth } from "@/lib/ops-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABS = [
  { id: "visitors", label: "Visitors", href: "/admin/analytics" },
  { id: "system", label: "System", href: "/admin/analytics?tab=system" },
];

/**
 * The owner's analytics. Every request checks the signed admin cookie here, in
 * the page itself (a layout is no guard: Next renders pages alongside it). Without
 * it the page is the password form and nothing else: no data is read.
 *
 * Two tabs: Visitors (first-party analytics) and System (the box's health, tm_ops_health, written every 5 minutes
 * by backend/ops/health.py on the VPS).
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: { range?: string; tab?: string } }) {
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

  if (searchParams?.tab === "system") {
    const health = await loadOpsHealth().catch(() => null);
    const now = Date.now();
    return (
      <AppPage width="dash">
        <PageHead title="System" meta={<span>Checked every 5 minutes</span>} actions={<AdminSignOut />} note={false} />
        <TabBar tabs={TABS} current="system" />
        {health?.latest ? (
          <SystemDashboard data={health} now={now} />
        ) : health ? (
          <Empty title="No checks yet">Install the health timer on the VPS: backend/vps/install-ops.sh.</Empty>
        ) : (
          <Empty title="Couldn't load the checks">The store didn&apos;t answer. Reload in a minute.</Empty>
        )}
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
      <TabBar tabs={TABS} current="visitors" />
      {data ? (
        <AnalyticsDashboard data={data} live={live} />
      ) : (
        <Empty title="Couldn't load the numbers">The store didn&apos;t answer. Reload in a minute.</Empty>
      )}
    </AppPage>
  );
}
