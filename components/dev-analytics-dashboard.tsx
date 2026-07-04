"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DevBusinessMetrics } from "@/lib/dev-business-metrics";
import type { PostHogAnalyticsSnapshot } from "@/lib/posthog-server";

const INK = "#111111";
const MUTED = "#9ca3af";
const GRID = "#f3f4f6";
const GREEN = "#059669";
const AMBER = "#d97706";
const BAR_COLORS = ["#111111", "#374151", "#6b7280", "#9ca3af", "#d1d5db"];

type Props = {
  posthog: PostHogAnalyticsSnapshot;
  business: DevBusinessMetrics;
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

export function DevAnalyticsDashboard({ posthog, business, posthogReady }: Props) {
  const { summary, trafficSeries, topPaths, trafficSources, funnel, periodDays } = posthog;
  const periodLabel = `${periodDays}d`;
  const maxFunnel = Math.max(1, ...funnel.map((s) => s.count));
  const visitorToSignup =
    funnel.find((s) => s.key === "visitors")?.count ?? 0;
  const signUps = funnel.find((s) => s.key === "sign_ups")?.count ?? 0;
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

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label={`Visitors · ${periodLabel}`} value={summary.visitors} />
        <Kpi
          label={`Returning · ${periodLabel}`}
          value={summary.returningVisitors}
          hint={pct(summary.returningVisitors, summary.visitors)}
        />
        <Kpi label={`Sign-ups · ${periodLabel}`} value={signUps} hint="PostHog" />
        <Kpi label="Paid Pro" value={business.paidProActive} hint="Firestore" tone="good" />
        <Kpi
          label="Checkout → paid"
          value={posthog.checkoutConversionRate != null ? `${posthog.checkoutConversionRate}%` : "—"}
          hint={`${periodLabel} funnel`}
        />
      </div>

      {!posthogReady && (
        <p className="text-sm text-[#6b7280]">
          Connect PostHog query API to see traffic charts. Firestore paid count still loads above.
        </p>
      )}

      {posthogReady && (
        <>
          {/* Traffic trend */}
          <Panel title={`Visitors · last ${periodDays} days`} subtitle="Daily unique visitors">
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
                    allowDecimals={false}
                    tick={{ fill: MUTED, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                    labelFormatter={(label) => String(label)}
                    formatter={(value, name) =>
                      name === "Trend" ? [null, null] : [fmtNum(Number(value)), "Visitors"]
                    }
                  />
                  <Bar
                    dataKey="visitors"
                    fill="#e5e7eb"
                    radius={[4, 4, 0, 0]}
                    barSize={periodDays <= 7 ? 36 : 14}
                    name="Visitors"
                  />
                  <Line
                    type="monotone"
                    dataKey="visitors"
                    stroke={INK}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: INK, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: INK }}
                    name="Trend"
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Retention */}
            <Panel
              title={`Retention · ${periodDays} days`}
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
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
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
            </Panel>

            {/* Conversion funnel */}
            <Panel
              title={`Conversion funnel · ${periodDays} days`}
              subtitle={`Visitor → signup ${pct(signUps, visitorToSignup)} · signup → paid ${pct(converted, signUps)}`}
            >
              <div className="space-y-3 pt-1">
                {funnel.map((step, index) => {
                  const widthPct = Math.max(8, (step.count / maxFunnel) * 100);
                  const prev = index > 0 ? funnel[index - 1]?.count ?? 0 : 0;
                  const stepRate = index > 0 ? pct(step.count, prev) : null;
                  return (
                    <div key={step.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="font-medium text-[#111111]">{step.label}</span>
                        <span className="tabular-nums text-[#6b7280]">
                          {fmtNum(step.count)}
                          {stepRate && stepRate !== "—" ? (
                            <span className="ml-2 text-[#9ca3af]">{stepRate} of prev</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="h-7 overflow-hidden rounded-lg bg-[#f3f4f6]">
                        <div
                          className="flex h-full items-center rounded-lg bg-[#111111] pl-2 text-[10px] font-medium text-white transition-all"
                          style={{ width: `${widthPct}%`, minWidth: step.count > 0 ? "2.5rem" : 0 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-[#9ca3af]">
                Paid Pro in Firestore: {business.paidProActive} · new accounts (7d): {business.newUsers7d}
              </p>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
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
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
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
                <p className="text-[13px] leading-snug text-[#111111]">{row.text}</p>
                <p className="mt-2 text-[11px] text-[#9ca3af]">
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
    <article className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "good" ? "text-[#059669]" : "text-[#111111]"
        }`}
      >
        {typeof value === "number" ? fmtNum(value) : value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-[#9ca3af]">{hint}</p>}
    </article>
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
    <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-[#111111]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#6b7280]">{subtitle}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-[#6b7280]">{children}</p>;
}
