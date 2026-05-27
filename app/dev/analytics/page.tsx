import { notFound } from "next/navigation";

import { loadDevAnalytics } from "@/lib/dev-analytics";
import { isPostHogQueryConfigured, loadPostHogAnalytics } from "@/lib/posthog-server";

function toneClass(tone?: "default" | "warn" | "good") {
  if (tone === "warn") return "text-[#b45309]";
  if (tone === "good") return "text-[#059669]";
  return "text-[#111111]";
}

export default async function DevAnalyticsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [firestore, posthog] = await Promise.all([
    loadDevAnalytics(),
    loadPostHogAnalytics(30),
  ]);

  const posthogReady = isPostHogQueryConfigured() && !posthog.error;
  const maxDau = Math.max(1, ...posthog.dauSeries.map((d) => d.dau));

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">Founder analytics</h1>
        <p className="text-sm text-[#6b7280]">
          Firestore account state + PostHog behavior for{" "}
          <span className="font-medium text-[#111111]">stocksbrew.online</span> /{" "}
          <span className="font-medium text-[#111111]">tikrr.online</span>.
        </p>
      </div>

      {!isPostHogQueryConfigured() && (
        <div className="mt-6 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-4 text-[13px] text-[#92400e]">
          Add <code className="font-mono text-[12px]">POSTHOG_PERSONAL_API_KEY</code> to{" "}
          <code className="font-mono text-[12px]">.env.local</code> (PostHog → Settings → Personal
          API keys, scope: <strong>query:read</strong>) to load behavior metrics. You already have{" "}
          <code className="font-mono text-[12px]">POSTHOG_PROJECT_ID</code> and{" "}
          <code className="font-mono text-[12px]">NEXT_PUBLIC_POSTHOG_KEY</code> for client capture.
        </div>
      )}

      {posthog.error && (
        <div className="mt-6 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-5 py-4 text-[13px] text-[#991b1b]">
          PostHog query error: {posthog.error}
        </div>
      )}

      {/* ─── Firestore overview ─────────────────────────────── */}
      <section className="mt-8">
        <SectionTitle>Account snapshot (Firestore)</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {firestore.metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>Coverage</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {firestore.coverage.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionTitle>Subscription health</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {firestore.health.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      {/* ─── PostHog behavior ───────────────────────────────── */}
      {posthogReady && (
        <>
          <section className="mt-10">
            <SectionTitle>Behavior (PostHog · last {posthog.periodDays}d)</SectionTitle>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
                <p className="text-sm font-medium text-[#6b7280]">Checkout funnel</p>
                <div className="mt-3 flex items-end gap-6">
                  <div>
                    <p className="text-3xl font-semibold tabular-nums">{posthog.funnel.checkoutStarted}</p>
                    <p className="text-[12px] text-[#9ca3af]">checkout_started</p>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold tabular-nums text-[#059669]">
                      {posthog.funnel.subscriptionConverted}
                    </p>
                    <p className="text-[12px] text-[#9ca3af]">subscription_converted</p>
                  </div>
                  {posthog.funnel.conversionRate !== null && (
                    <div>
                      <p className="text-3xl font-semibold tabular-nums">{posthog.funnel.conversionRate}%</p>
                      <p className="text-[12px] text-[#9ca3af]">conversion</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5 md:col-span-2">
                <p className="text-sm font-medium text-[#6b7280]">Daily active users (pageviews)</p>
                <div className="mt-4">
                  <div className="flex h-20 items-end gap-1.5">
                    {[...posthog.dauSeries].reverse().map((point) => {
                      const barPx = Math.max(4, Math.round((point.dau / maxDau) * 72));
                      return (
                        <div
                          key={point.day}
                          className="group flex flex-1 flex-col items-center justify-end gap-1"
                        >
                          <span className="text-[10px] font-medium tabular-nums text-[#6b7280] opacity-0 group-hover:opacity-100">
                            {point.dau}
                          </span>
                          <div
                            className="w-full rounded-t bg-[#111111]/85 transition-opacity group-hover:opacity-100"
                            style={{ height: `${barPx}px` }}
                            title={`${point.day}: ${point.dau} users`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {[...posthog.dauSeries].reverse().map((point) => (
                      <span
                        key={`${point.day}-label`}
                        className="flex-1 text-center text-[9px] text-[#9ca3af]"
                      >
                        {point.day.slice(5).replace("-", "/")}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Top product events" scrollable>
              {posthog.eventCounts.length === 0 ? (
                <Empty>No custom events yet.</Empty>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <tbody>
                    {posthog.eventCounts.map((row) => (
                      <tr key={row.event} className="border-t border-[#f3f4f6] first:border-t-0">
                        <td className="py-2 font-medium text-[#111111]">{row.event}</td>
                        <td className="py-2 text-right tabular-nums text-[#6b7280]">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Top pages" scrollable>
              {posthog.topPaths.length === 0 ? (
                <Empty>No pageviews yet.</Empty>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <tbody>
                    {posthog.topPaths.map((row) => (
                      <tr key={row.path} className="border-t border-[#f3f4f6] first:border-t-0">
                        <td className="py-2 font-medium text-[#111111] truncate max-w-[280px]">{row.path}</td>
                        <td className="py-2 text-right tabular-nums text-[#6b7280]">{row.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>
        </>
      )}

      {/* ─── Users table ────────────────────────────────────── */}
      <section className="mt-10">
        <SectionTitle>Users</SectionTitle>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className={scrollPanelClass("max-h-[420px]")}>
            <table className="min-w-full text-left text-[13px]">
              <thead className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-[#f9fafb] text-[11px] uppercase tracking-wide text-[#6b7280]">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Radar</th>
                <th className="px-4 py-3 font-semibold">Last login</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {firestore.users.map((user) => (
                <tr key={user.id} className="border-t border-[#f3f4f6]">
                  <td className="px-4 py-2.5 font-medium text-[#111111]">{user.email}</td>
                  <td className="px-4 py-2.5">{user.plan}</td>
                  <td className="px-4 py-2.5 text-[#6b7280]">
                    {user.status}
                    {user.flag && (
                      <span className="ml-2 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#92400e]">
                        {user.flag}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{user.tracked}</td>
                  <td className="px-4 py-2.5 text-[#6b7280]">{user.lastLogin ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[#6b7280]">{user.joined ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* ─── Lifecycle + feedback + requests ──────────────── */}
      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Recent lifecycle events" scrollable>
          {firestore.lifecycleEvents.length === 0 ? (
            <Empty>No lifecycle events.</Empty>
          ) : (
            <div className="space-y-2">
              {firestore.lifecycleEvents.map((row) => (
                <Row key={row.id} title={row.type} meta={[row.email, row.createdAt?.slice(0, 10)].filter(Boolean).join(" · ")} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent feedback" scrollable>
          {firestore.recentFeedback.length === 0 ? (
            <Empty>No feedback yet.</Empty>
          ) : (
            <div className="space-y-2">
              {firestore.recentFeedback.map((row) => (
                <Row
                  key={row.id}
                  title={row.text}
                  meta={[row.email, row.createdAt?.slice(0, 10), row.path?.includes("profile") ? "profile" : null]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Top stock requests" scrollable>
          {firestore.stockRequestLeaderboard.length === 0 ? (
            <Empty>No requests yet.</Empty>
          ) : (
            <table className="w-full text-left text-[13px]">
              <tbody>
                {firestore.stockRequestLeaderboard.map((row) => (
                  <tr key={row.id} className="border-t border-[#f3f4f6] first:border-t-0">
                    <td className="py-2 font-semibold text-[#111111]">{row.ticker}</td>
                    <td className="py-2 text-right tabular-nums text-[#6b7280]">{row.count}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </section>
    </main>
  );
}

function scrollPanelClass(height = "max-h-[320px]") {
  return `${height} overflow-y-auto overflow-x-auto scrollbar-hide`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-[#111111]">{children}</h2>;
}

function MetricCard({ label, value, note, tone }: { label: string; value: number | string; note?: string; tone?: "default" | "warn" | "good" }) {
  return (
    <article className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-[12px] font-medium text-[#6b7280]">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass(tone)}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {note && <p className="mt-1 text-[11px] text-[#9ca3af]">{note}</p>}
    </article>
  );
}

function Panel({
  title,
  children,
  scrollable = false,
}: {
  title: string;
  children: React.ReactNode;
  scrollable?: boolean;
}) {
  return (
    <article
      className={`flex flex-col rounded-2xl border border-[#e5e7eb] bg-white p-5 ${
        scrollable ? "h-[380px]" : ""
      }`}
    >
      <h3 className="shrink-0 text-base font-semibold text-[#111111]">{title}</h3>
      <div
        className={
          scrollable
            ? "mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-auto scrollbar-hide"
            : "mt-4"
        }
      >
        {children}
      </div>
    </article>
  );
}

function Row({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="rounded-xl border border-[#f1f5f9] p-3">
      <p className="text-[13px] text-[#111111] leading-snug">{title}</p>
      {meta && <p className="mt-1 text-[11px] text-[#9ca3af]">{meta}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#6b7280]">{children}</p>;
}
