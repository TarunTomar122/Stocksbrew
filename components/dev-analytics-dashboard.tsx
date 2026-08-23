"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DevBusinessMetrics } from "@/lib/dev-business-metrics";
import type { DevEngagementMetrics } from "@/lib/dev-engagement-metrics";
import type { PostHogAnalyticsSnapshot } from "@/lib/posthog-server";

const INK = "var(--oa-fg)";
const MUTED = "var(--oa-muted-fg)";
const GRID = "var(--oa-bg)";
const GREEN = "#059669";
const AMBER = "#d97706";
const BAR_COLORS = ["var(--oa-fg)", "var(--oa-fg)", "var(--oa-muted-fg)", "var(--oa-muted-fg)", "var(--oa-border)"];

type Props = {
  posthog: PostHogAnalyticsSnapshot;
  business: DevBusinessMetrics;
  engagement: DevEngagementMetrics;
  posthogReady: boolean;
};

function fmtDay(day: string) {
  const parts = day.split("-");
  if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
  return day;
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function pct(part: number, whole: number) {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function DevAnalyticsDashboard({ posthog, business, engagement, posthogReady }: Props) {
  const { summary, trafficSeries, visitorLocations, topPaths, trafficSources, funnel, periodDays } =
    posthog;
  const periodLabel = `${periodDays}d`;
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const visitorToSignup =
    funnel.find((s) => s.key === "visitors")?.count ?? 0;
  const signUps = funnel.find((s) => s.key === "sign_ups")?.count ?? 0;
  const firstRadarStock = funnel.find((s) => s.key === "first_radar_stock")?.count ?? 0;
  const converted = funnel.find((s) => s.key === "converted")?.count ?? 0;

  const retentionData = [
    { name: `Returning (${periodLabel})`, value: summary.returningVisitors, fill: INK },
    { name: `New (${periodLabel})`, value: summary.newVisitors, fill: GREEN },
  ];

  const pathChartData = topPaths.map((row) => ({
    name: row.path.length > 28 ? `…${row.path.slice(-26)}` : row.path,
    fullPath: row.path,
    views: row.views,
  }));

  const sourceChartData = trafficSources.map((row) => ({
    name: row.source,
    views: row.views,
  }));

  const locationChartData = visitorLocations.map((row) => ({
    name: row.country,
    visitors: row.visitors,
  }));

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label={`Visitors · ${periodLabel}`} value={summary.visitors} />
        <Kpi
          label={`Returning · ${periodLabel}`}
          value={summary.returningVisitors}
          hint={pct(summary.returningVisitors, summary.visitors)}
        />
        <Kpi
          label={`Sign-ups · ${periodLabel}`}
          value={signUps}
          hint={posthog.signupRate != null ? `${posthog.signupRate}% of visitors` : "PostHog"}
        />
        <Kpi
          label="First Watchlist stock"
          value={firstRadarStock}
          hint={posthog.radarActivationRate != null ? `${posthog.radarActivationRate}% of sign-ups` : periodLabel}
        />
        <Kpi label="Paid Pro" value={business.paidProActive} hint="Firestore" tone="good" />
        <Kpi
          label="Checkout → paid"
          value={posthog.checkoutConversionRate != null ? `${posthog.checkoutConversionRate}%` : "—"}
          hint={`${periodLabel} funnel`}
        />
      </div>

      {!posthogReady && (
        <p className="text-sm text-[var(--oa-muted-fg)]">
          Connect PostHog query API to see traffic charts. Firestore paid count still loads above.
        </p>
      )}

      {posthogReady && (
        <>
          {/* Traffic trend */}
          <Panel
            title={`Traffic · last ${periodDays} days`}
            subtitle="Daily unique visitors and sign-ups"
          >
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trafficSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={fmtDay}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="visitors"
                    allowDecimals={false}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="signups"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fill: GREEN, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--oa-border)", fontSize: 12 }}
                    labelFormatter={(label) => String(label)}
                    formatter={(value, name) => [fmtNum(Number(value)), String(name)]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
                  />
                  <Bar
                    yAxisId="visitors"
                    dataKey="visitors"
                    fill="var(--oa-border)"
                    radius={[4, 4, 0, 0]}
                    barSize={periodDays <= 7 ? 28 : 12}
                    name="Visitors"
                  />
                  <Line
                    yAxisId="visitors"
                    type="monotone"
                    dataKey="visitors"
                    stroke={INK}
                    strokeWidth={2}
                    dot={false}
                    name="Visitor trend"
                    legendType="none"
                  />
                  <Line
                    yAxisId="signups"
                    type="monotone"
                    dataKey="signups"
                    stroke={GREEN}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: GREEN }}
                    name="Sign-ups"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Retention */}
            <Panel
              title={`Visitor return · ${periodDays} days`}
              subtitle={`${pct(summary.returningVisitors, summary.visitors)} came back from prior ${periodDays} days`}
            >
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={retentionData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fill: INK, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid var(--oa-border)", fontSize: 12 }}
                      formatter={(value) => [fmtNum(Number(value)), "Users"]}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                      {retentionData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-[var(--oa-muted-fg)]">
                Activated cohort return: {summary.activatedReturned} / {summary.activatedCohort} users who added their first Watchlist stock in the prior {periodDays} days.
              </p>
            </Panel>

            {/* Conversion funnel */}
            <Panel
              title={`Activation and conversion · ${periodDays} days`}
              subtitle={`Visitor → signup ${pct(signUps, visitorToSignup)} · signup → first Watchlist ${pct(firstRadarStock, signUps)}`}
            >
              <div className="space-y-3 pt-1">
                {funnel.map((step, index) => {
                  const widthPct = Math.max(8, (step.count / maxFunnel) * 100);
                  const stepRate =
                    index === 1
                      ? pct(step.count, visitorToSignup)
                      : index === 2
                        ? pct(step.count, signUps)
                        : index === 4
                          ? posthog.checkoutConversionRate == null
                            ? null
                            : `${posthog.checkoutConversionRate}%`
                          : null;
                  return (
                    <div key={step.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="font-medium text-[var(--oa-fg)]">{step.label}</span>
                        <span className="tabular-nums text-[var(--oa-muted-fg)]">
                          {fmtNum(step.count)}
                          {stepRate && stepRate !== "—" ? (
                            <span className="ml-2 text-[var(--oa-muted-fg)]">{stepRate} of prev</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="h-7 overflow-hidden rounded-lg bg-[var(--oa-bg)]">
                        <div
                          className="flex h-full items-center rounded-lg bg-oa-primary pl-2 text-[10px] font-medium text-white transition-all"
                          style={{ width: `${widthPct}%`, minWidth: step.count > 0 ? "2.5rem" : 0 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-[var(--oa-muted-fg)]">
                Unique people per stage in this period · Paid Pro in Firestore: {business.paidProActive} · new accounts (7d): {business.newUsers7d}
              </p>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Visitor locations */}
            <Panel
              title={`Visitor locations · ${periodLabel}`}
              subtitle="Unique visitors by country (PostHog GeoIP)"
            >
              <div className="h-[320px] w-full">
                {locationChartData.length === 0 ? (
                  <Empty>No location data yet.</Empty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={locationChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: INK, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--oa-border)", fontSize: 12 }}
                        formatter={(value) => [fmtNum(Number(value)), "Visitors"]}
                      />
                      <Bar dataKey="visitors" fill={GREEN} radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            {/* Top pages */}
            <Panel title={`Popular pages · ${periodLabel}`} subtitle="By pageview count">
              <div className="h-[320px] w-full">
                {pathChartData.length === 0 ? (
                  <Empty>No pageviews yet.</Empty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pathChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fill: INK, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--oa-border)", fontSize: 12 }}
                        labelFormatter={(_, payload) =>
                          String(payload?.[0]?.payload?.fullPath ?? "")
                        }
                        formatter={(value) => [fmtNum(Number(value)), "Views"]}
                      />
                      <Bar dataKey="views" radius={[0, 4, 4, 0]} barSize={16}>
                        {pathChartData.map((_, i) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            {/* Traffic sources */}
            <Panel title={`Traffic sources · ${periodLabel}`} subtitle="UTM, ref param, or referrer">
              <div className="h-[320px] w-full">
                {sourceChartData.length === 0 ? (
                  <Empty>No source data yet.</Empty>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sourceChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid stroke={GRID} horizontal={false} />
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fill: INK, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--oa-border)", fontSize: 12 }}
                        formatter={(value) => [fmtNum(Number(value)), "Pageviews"]}
                      />
                      <Bar dataKey="views" fill={AMBER} radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <EngagementEmailPanel
          title={`Watchlist power users · ${periodLabel}`}
          subtitle="Has stocks on Watchlist and visited /watchlist more than once"
          rows={engagement.radarRepeatVisitors}
          emptyMessage={
            engagement.radarRepeatVisitorsError
              ? engagement.radarRepeatVisitorsError
              : `No repeat Watchlist visitors in the last ${periodDays} days.`
          }
          error={Boolean(engagement.radarRepeatVisitorsError)}
        />
        <EngagementEmailPanel
          title="Daily brief modal signups"
          subtitle="Subscribed via the homepage market briefing modal"
          rows={engagement.newsletterModalSignups}
          emptyMessage="No modal signups yet."
        />
      </div>

      <Panel
        title={`User feedback · ${periodLabel}`}
        subtitle={
          business.feedbackInPeriod > 0
            ? `${business.feedbackInPeriod} message${business.feedbackInPeriod === 1 ? "" : "s"} in this window`
            : "No feedback in this window"
        }
      >
        {business.recentFeedback.length === 0 ? (
          <Empty>No feedback submitted in the last {periodDays} days.</Empty>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-y-auto scrollbar-hide">
            {business.recentFeedback.map((row) => (
              <div key={row.id} className="rounded-xl border border-[#f1f5f9] bg-[#fafafa] p-3">
                <p className="text-[13px] leading-snug text-[var(--oa-fg)]">{row.text}</p>
                <p className="mt-2 text-[11px] text-[var(--oa-muted-fg)]">
                  {[row.email, row.createdAt, row.path].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "good";
}) {
  return (
    <article className="rounded-2xl border border-[var(--oa-border)] bg-oa-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--oa-muted-fg)]">{label}</p>
      <p
        className={`mt-1 text-2xl font-medium tabular-nums ${
          tone === "good" ? "text-[#059669]" : "text-[var(--oa-fg)]"
        }`}
      >
        {typeof value === "number" ? fmtNum(value) : value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-[var(--oa-muted-fg)]">{hint}</p>}
    </article>
  );
}

function EngagementEmailPanel({
  title,
  subtitle,
  rows,
  emptyMessage,
  error = false,
}: {
  title: string;
  subtitle: string;
  rows: DevEngagementMetrics["radarRepeatVisitors"];
  emptyMessage: string;
  error?: boolean;
}) {
  return (
    <Panel title={title} subtitle={`${subtitle} · ${rows.length} total`}>
      {rows.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto scrollbar-hide">
          {rows.map((row) => (
            <div
              key={`${row.email}-${row.uid ?? "anon"}`}
              className={`rounded-xl border p-3 ${
                error ? "border-[#fecaca] bg-[#fef2f2]" : "border-[#f1f5f9] bg-[#fafafa]"
              }`}
            >
              <p className="font-mono text-[13px] font-medium text-[var(--oa-fg)]">{row.email}</p>
              <p className="mt-1 text-[11px] text-[var(--oa-muted-fg)]">
                {[row.detail, row.createdAt, row.uid ? `uid ${row.uid.slice(0, 8)}…` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5">
      <div>
        <h2 className="text-base font-medium text-[var(--oa-fg)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-[var(--oa-muted-fg)]">{subtitle}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-[var(--oa-muted-fg)]">{children}</p>;
}
