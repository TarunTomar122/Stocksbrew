import { cookies, headers } from "next/headers";

import { AnalyticsDashboard, BEFORE_WORDS, RangePicker } from "@/components/admin-analytics/dashboard";
import { AdminGate, AdminSignOut } from "@/components/admin-analytics/gate";
import { SpeedDashboard, SpeedRangePicker } from "@/components/admin-analytics/speed";
import { SystemDashboard } from "@/components/admin-analytics/system";
import { AppPage, Empty, PageHead, TabBar } from "@/components/oa/kit";
import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { loadDashboard, loadLive, parseRange } from "@/lib/analytics/dashboard";
import { analyticsNamespace } from "@/lib/analytics/db";
import { parseDeviceFilter, parseSpeedRange } from "@/lib/analytics/speed";
import { loadSpeed } from "@/lib/analytics/speed-load";
import { loadOpsHealth } from "@/lib/ops-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABS = [
  { id: "visitors", label: "Visitors", href: "/admin/analytics" },
  { id: "speed", label: "Speed", href: "/admin/analytics?tab=speed" },
  { id: "system", label: "System", href: "/admin/analytics?tab=system" },
];

/**
 * The owner's analytics. Every request checks the signed admin cookie here, in
 * the page itself (a layout is no guard: Next renders pages alongside it). Without
 * it the page is the password form and nothing else: no data is read.
 *
 * Three tabs: Visitors (first-party analytics), Speed (real visitors' page loads, lib/analytics/speed.ts, with
 * Caddy's own response times beside them) and System (the box's health, tm_ops_health, written every 5 minutes
 * by backend/ops/health.py on the VPS).
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: { range?: string; tab?: string; dev?: string } }) {
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

  if (searchParams?.tab === "speed") {
    const range = parseSpeedRange(searchParams?.range);
    const device = parseDeviceFilter(searchParams?.dev);
    const ns = analyticsNamespace(headers().get("host"));
    const [view, ops] = await Promise.all([loadSpeed(ns, range, device).catch(() => null), loadOpsHealth().catch(() => null)]);
    return (
      <AppPage width="dash">
        <PageHead
          title="Speed"
          meta={<span>Real visitors, full page loads, 75th percentile</span>}
          actions={
            <>
              <SpeedRangePicker range={range} device={device} />
              <AdminSignOut />
            </>
          }
          note={false}
        />
        <TabBar tabs={TABS} current="speed" />
        {!view ? (
          <Empty title="Couldn't load the timings">The store didn&apos;t answer. Reload in a minute.</Empty>
        ) : view.empty && device === "all" ? (
          <Empty title="No page loads measured yet">Timings show up here after the first visitors load a page.</Empty>
        ) : (
          <SpeedDashboard view={view} ops={ops} />
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
