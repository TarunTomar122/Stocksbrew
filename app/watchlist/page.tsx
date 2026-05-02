import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getWatchlistView, rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";
import type { WatchlistBrief, WatchlistRow, WatchlistPulse } from "@/lib/watchlist-view";
import { StockLogo } from "@/components/stock-logo";

export const dynamic = "force-dynamic";

const SLOT_CAP = 10;

type Dict = Record<string, unknown>;

export default async function WatchlistPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/?signin=required");
  }

  const userDoc = await getUserDoc(session.uid);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const positions = userDoc?.watchlist_positions || {};
  const isSubscribed = resolveIsSubscribed(userDoc);

  let view = await getWatchlistView(session.uid);
  if (!view && tracked.length > 0) {
    view = await rebuildAndSaveWatchlistView(session.uid, tracked, positions);
  }

  const rows = view?.rows ?? [];
  const holdings = rows.filter((row) => row.position_type === "holding");
  const watching = rows.filter((row) => row.position_type !== "holding");
  const attention = (view?.attention_items || []) as Dict[];
  const suggestions = (view?.suggestions || []) as Dict[];
  const riskSummary = asDict(view?.risk_summary);

  if (!isSubscribed) {
    return <UnsubscribedState />;
  }

  if (rows.length === 0) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 md:py-12 flex flex-col gap-8">
          <PageTitle rowsCount={0} builtAt={view?.built_at} />
          <EmptyState />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow bg-[#fafafa]">
      <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-8 px-6 py-6 md:px-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-16 lg:py-10">
        <WatchlistRail
          rows={rows}
          holdings={holdings}
          watching={watching}
          builtAt={view?.built_at}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <AttentionDesk items={attention} rows={rows} />
          <HoldingsAndWatchlist holdings={holdings} watching={watching} />
          <RiskAndSuggestions risk={riskSummary} suggestions={suggestions} />
        </div>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Top-of-page title (used only for empty / unsubscribed states)
// -----------------------------------------------------------------------------

function PageTitle({
  rowsCount,
  builtAt,
}: {
  rowsCount: number;
  builtAt?: string;
}) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] md:text-[34px] font-semibold text-[#111111] tracking-[-0.02em] leading-none">
          Watchlist
        </h1>
        <span className="text-[13px] text-[#6b7280]">
          {rowsCount} of {SLOT_CAP} slots used · refreshed{" "}
          {builtAt ? formatRelative(builtAt) : "never"}
        </span>
      </div>
    </header>
  );
}

function WatchlistRail({
  rows,
  holdings,
  watching,
  builtAt,
}: {
  rows: WatchlistRow[];
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
  builtAt?: string;
}) {
  const up = rows.filter((row) => (row.day_change_pct ?? 0) > 0).length;
  const down = rows.filter((row) => (row.day_change_pct ?? 0) < 0).length;
  const reviewCount = rows.filter((row) => (row.attention_score ?? 0) >= 70).length;
  return (
    <aside className="lg:sticky lg:top-24 flex h-fit flex-col gap-5 rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_24px_70px_rgba(17,24,39,0.06)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ca3af]">
          Personal radar
        </p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#111111]">
          Stocks you care about
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-[#6b7280]">
          {rows.length} tracked · {holdings.length} holdings · {watching.length} watching · refreshed{" "}
          {builtAt ? formatRelative(builtAt) : "never"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <RailStat label="Need review" value={reviewCount} tone={reviewCount ? "hot" : "calm"} />
        <RailStat label="Up today" value={up} tone="up" />
        <RailStat label="Down today" value={down} tone="down" />
        <RailStat label="Slots used" value={`${rows.length}/${SLOT_CAP}`} tone="ink" />
      </div>

      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full bg-[#111111] px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        Add another stock
      </Link>
    </aside>
  );
}

function RailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "hot" | "calm" | "up" | "down" | "ink";
}) {
  const toneClass =
    tone === "hot"
      ? "bg-[#fff7ed] text-[#c2410c]"
      : tone === "up"
        ? "bg-[#ecfdf5] text-[#047857]"
        : tone === "down"
          ? "bg-[#fef2f2] text-[#dc2626]"
          : "bg-[#f8f9fa] text-[#111111]";
  return (
    <div className={`rounded-2xl px-3 py-3 ${toneClass}`}>
      <div className="text-[22px] font-semibold leading-none tracking-[-0.03em]">{value}</div>
      <div className="mt-1 text-[11px] font-medium opacity-70">{label}</div>
    </div>
  );
}

function AttentionDesk({ items, rows }: { items: Dict[]; rows: WatchlistRow[] }) {
  const visible = items.length ? items : rows.slice(0, 4);
  const urgent = visible.filter((item) => (num(item.attention_score) ?? 0) >= 70).length;
  return (
    <section className="rounded-[32px] border border-[#e5e7eb] bg-white p-5 md:p-7 shadow-[0_24px_70px_rgba(17,24,39,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0052ff]">
            Needs attention
          </p>
          <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.045em] text-[#111111]">
            {urgent ? `${urgent} thing${urgent === 1 ? "" : "s"} worth checking` : "Nothing urgent today"}
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6b7280]">
            Ranked by abnormal moves, risk signals, technical extremes, news velocity, and analyst runway.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {visible.slice(0, 6).map((item) => {
          const ticker = String(item.ticker || "");
          const position = String(item.position_type || "watchlist");
          return (
            <Link
              key={`${ticker}-${item.attention_kind || ""}`}
              href={`/stock/${encodeURIComponent(ticker)}`}
              className="group rounded-3xl border border-[#e5e7eb] bg-[#fbfbfb] p-4 transition-all hover:-translate-y-0.5 hover:border-[#111111] hover:bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <StockLogo ticker={ticker} market="US" size={36} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-semibold text-[#111111]">{ticker}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6b7280] ring-1 ring-[#e5e7eb]">
                        {position === "holding" ? "Holding" : "Watching"}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#6b7280]">
                      {formatCurrency(num(item.price), String(item.currency || "USD"))} · {formatSignedPct(num(item.day_change_pct))}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${actionToneClass(String(item.action_tone || "neutral"))}`}>
                  {String(item.suggested_action || "Review")}
                </span>
              </div>
              <p className="mt-4 text-[14px] leading-6 text-[#374151]">
                {String(item.attention_reason || "No major anomaly stood out.")}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function HoldingsAndWatchlist({
  holdings,
  watching,
}: {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
}) {
  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <StockBucket
        title="Holdings"
        subtitle="Owned names. Risk and thesis changes get priority."
        rows={holdings}
        empty="No holdings yet. Mark a tracked stock as holding to make risk alerts sharper."
      />
      <StockBucket
        title="Watchlist"
        subtitle="Names you are stalking for entries, catalysts, or cleaner setups."
        rows={watching}
        empty="No watchlist names yet."
      />
    </section>
  );
}

function StockBucket({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: WatchlistRow[];
  empty: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-[#111111]">{title}</h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{subtitle}</p>
        </div>
        <span className="rounded-full bg-[#f8f9fa] px-3 py-1 text-[12px] font-semibold text-[#111111]">
          {rows.length}
        </span>
      </div>
      <div className="mt-5 flex flex-col">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#e5e7eb] p-4 text-[13px] text-[#6b7280]">
            {empty}
          </p>
        ) : (
          rows.map((row) => <TrackedRow key={row.instrument_id} row={row} />)
        )}
      </div>
    </div>
  );
}

function TrackedRow({ row }: { row: WatchlistRow }) {
  const score = row.attention_score ?? 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f3f4f6] py-3 first:border-t-0"
    >
      <StockLogo ticker={row.ticker} market={row.market === "IN" ? "IN" : "US"} size={34} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[#111111]">{row.ticker}</span>
          <span className="text-[12px] font-semibold tabular-nums text-[#6b7280]">
            {formatSignedPct(row.day_change_pct)}
          </span>
        </div>
        <p className="truncate text-[12px] text-[#6b7280]">{row.attention_reason || row.brief_tile.micro}</p>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold tabular-nums text-[#111111]">
          {formatCurrency(row.price, row.currency)}
        </div>
        <div className={`text-[11px] font-semibold ${score >= 70 ? "text-[#c2410c]" : "text-[#9ca3af]"}`}>
          {score} attention
        </div>
      </div>
    </Link>
  );
}

function RiskAndSuggestions({
  risk,
  suggestions,
}: {
  risk: Dict;
  suggestions: Dict[];
}) {
  return (
    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[28px] border border-[#e5e7eb] bg-[#111111] p-5 text-white shadow-[0_18px_50px_rgba(17,24,39,0.12)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ca3af]">
          Biggest risk
        </p>
        <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.04em]">
          {String(risk.headline || "No major risk cluster yet")}
        </h3>
        <p className="mt-3 text-[14px] leading-6 text-[#d1d5db]">
          {String(risk.body || "Add more names and Tikrr will watch concentration, technical stress, and news anomalies.")}
        </p>
      </div>
      <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-5 shadow-[0_18px_50px_rgba(17,24,39,0.05)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9ca3af]">
              Suggestions
            </p>
            <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#111111]">
              Add next
            </h3>
          </div>
        </div>
        <div className="mt-4 flex flex-col">
          {suggestions.slice(0, 4).map((item) => (
            <div
              key={String(item.instrument_id || item.ticker)}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[#f3f4f6] py-3 first:border-t-0"
            >
              <div>
                <p className="text-[14px] font-semibold text-[#111111]">{String(item.ticker || "")}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-[#6b7280]">
                  {String(item.why || item.reason || "Related to your tracked universe.")}
                </p>
              </div>
              <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
                {num(item.score)?.toFixed(0) ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function actionToneClass(tone: string): string {
  if (tone === "positive") return "bg-[#ecfdf5] text-[#047857]";
  if (tone === "negative") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#f8f9fa] text-[#374151]";
}

// -----------------------------------------------------------------------------
// Left rail: identity + pulse + holdings strip
// -----------------------------------------------------------------------------

function SideRail({
  rows,
  pulse,
  builtAt,
}: {
  rows: WatchlistRow[];
  pulse: WatchlistPulse | null;
  builtAt?: string;
}) {
  const stats = pulse?.stats || {};
  const alertCount = stats.alert_count ?? rows.reduce((s, r) => s + r.alerts.length, 0);

  return (
    <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto pr-1 -mr-1 flex flex-col gap-8">
      {/* Identity — quiet, analytical */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[20px] font-semibold text-[#111111] tracking-[-0.01em] leading-tight">
          Watchlist
        </h1>
        <span className="text-[12px] text-[#6b7280]">
          {rows.length} of {SLOT_CAP} stocks · refreshed{" "}
          {builtAt ? formatRelative(builtAt) : "never"}
        </span>
        {pulse?.subtitle && (
          <span className="text-[12px] text-[#6b7280]">{pulse.subtitle}</span>
        )}
        <Link
          href="/"
          className="mt-2 self-start inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#111111] hover:border-[#111111] transition-colors"
        >
          <span aria-hidden>＋</span>
          Add a stock
        </Link>
      </div>

      {/* Pulse stats — flat 2x2 mini grid */}
      {pulse && (
        <div className="flex flex-col gap-3 pt-6 border-t border-[#e5e7eb]">
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
            Pulse
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <MiniStat label="Tracked" value={`${stats.count ?? rows.length}`} />
            <MiniStat
              label="Up today"
              value={`${stats.movers_up ?? 0}`}
              tone={(stats.movers_up ?? 0) > 0 ? "up" : "ink"}
            />
            <MiniStat
              label="Down today"
              value={`${stats.movers_down ?? 0}`}
              tone={(stats.movers_down ?? 0) > 0 ? "down" : "ink"}
            />
            <MiniStat
              label="Avg score"
              value={
                stats.avg_overall_score !== null && stats.avg_overall_score !== undefined
                  ? `${Math.round(stats.avg_overall_score)}`
                  : "—"
              }
            />
          </div>
          {alertCount > 0 && (
            <a
              href="#alerts"
              className="mt-1 inline-flex items-center justify-between gap-2 text-[12px] font-medium text-[#991b1b] hover:underline"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                {alertCount} alert{alertCount === 1 ? "" : "s"} active
              </span>
              <span aria-hidden>→</span>
            </a>
          )}
        </div>
      )}

      {/* Holdings strip — quick navigator */}
      <div className="flex flex-col gap-2 pt-6 border-t border-[#e5e7eb]">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
          Holdings
        </span>
        <ul className="flex flex-col">
          {rows.map((row) => {
            const positive = (row.day_change_pct ?? 0) >= 0;
            return (
              <li
                key={row.instrument_id}
                className="border-t border-[#f3f4f6] first:border-t-0"
              >
                <Link
                  href={`/stock/${encodeURIComponent(row.ticker)}`}
                  className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors"
                >
                  <StockLogo
                    ticker={row.ticker}
                    market={row.market === "IN" ? "IN" : "US"}
                    size={28}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-[#111111]">
                      {row.ticker}
                    </span>
                    <span className="block text-[11px] text-[#6b7280] truncate">
                      {row.sector_label || row.market}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                      {formatCurrency(row.price, row.currency)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        positive ? "text-[#10b981]" : "text-[#ef4444]"
                      }`}
                    >
                      {formatSignedPct(row.day_change_pct)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "ink";
}) {
  const valueClass =
    tone === "up" ? "text-[#10b981]" : tone === "down" ? "text-[#ef4444]" : "text-[#111111]";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-[20px] font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </span>
      <span className="text-[11px] font-medium text-[#6b7280] tracking-[0.04em]">
        {label}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Right rail sections (flat, hairline-divided)
// -----------------------------------------------------------------------------

function SectionHead({
  title,
  meta,
}: {
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 className="text-[20px] font-semibold text-[#111111] tracking-[-0.01em]">
        {title}
      </h2>
      {meta && <div className="text-[12px] text-[#6b7280]">{meta}</div>}
    </div>
  );
}

function ChangesSection({ changes }: { changes: Dict }) {
  const hasPrevious = Boolean(changes.has_previous);
  const changedCount = num(changes.changed_count) ?? 0;
  const scoreChanges = asArray(changes.score_changes);
  const newTickers = Array.isArray(changes.new_tickers)
    ? changes.new_tickers.map((item) => String(item)).filter(Boolean)
    : [];

  return (
    <section className="flex flex-col gap-4 pt-8 border-t border-[#e5e7eb]">
      <SectionHead
        title="Changed since last refresh"
        meta={hasPrevious ? `${changedCount} material change${changedCount === 1 ? "" : "s"}` : "baseline build"}
      />
      <div className="flex flex-col gap-3">
        <p className="text-[14px] leading-relaxed text-[#111111] max-w-[760px]">
          {text(changes.summary) || "No previous snapshot yet; this build sets the baseline."}
        </p>
        {(scoreChanges.length > 0 || newTickers.length > 0) && (
          <ul className="flex flex-col border-t border-[#f3f4f6]">
            {scoreChanges.map((item, index) => {
              const delta = num(item.delta);
              const tone =
                typeof delta === "number" && delta > 0
                  ? "text-[#10b981]"
                  : typeof delta === "number" && delta < 0
                    ? "text-[#ef4444]"
                    : "text-[#6b7280]";
              return (
                <li
                  key={`score-change-${index}`}
                  className="grid grid-cols-[minmax(48px,_auto)_1fr_auto] items-baseline gap-4 py-2.5 border-b border-[#f3f4f6]"
                >
                  <span className="text-[12px] font-semibold text-[#111111] tabular-nums">
                    {text(item.ticker)}
                  </span>
                  <span className="text-[13px] text-[#6b7280]">
                    {text(item.sentence)}
                  </span>
                  <span className={`text-[13px] font-semibold tabular-nums ${tone}`}>
                    {formatSignedNumber(delta)}
                  </span>
                </li>
              );
            })}
            {newTickers.map((ticker) => (
              <li
                key={`new-${ticker}`}
                className="grid grid-cols-[minmax(48px,_auto)_1fr_auto] items-baseline gap-4 py-2.5 border-b border-[#f3f4f6]"
              >
                <span className="text-[12px] font-semibold text-[#111111] tabular-nums">
                  {ticker}
                </span>
                <span className="text-[13px] text-[#6b7280]">
                  Baseline established for future score, alert, and event changes.
                </span>
                <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                  new
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BriefingSection({ brief }: { brief: WatchlistBrief }) {
  const status = brief.status === "ready" ? "Personalized AI" : "Rules fallback";
  const movers = (brief.movers ?? []).slice(0, 3);
  const signal = brief.signals?.[0];

  return (
    <section className="flex flex-col gap-5">
      <SectionHead
        title="Today's brief"
        meta={
          <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
            {status}
          </span>
        }
      />

      {brief.narrative && (
        <p className="text-[15px] text-[#111111] leading-relaxed font-medium max-w-[760px]">
          {brief.narrative}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BriefCard
          label="Top movers"
          icon="trending_up"
          iconBg="#eff6ff"
          iconFg="#0052ff"
        >
          {movers.length === 0 ? (
            <span className="text-[14px] text-[#6b7280]">No standout moves yet.</span>
          ) : (
            <ul className="flex flex-col gap-3">
              {movers.map((m) => {
                const tone =
                  m.vibe === "up"
                    ? "text-[#10b981]"
                    : m.vibe === "down"
                      ? "text-[#ef4444]"
                      : "text-[#b45309]";
                return (
                  <li
                    key={m.ticker}
                    className="flex flex-col gap-1 border-t border-[#f3f4f6] first:border-t-0 first:pt-0 pt-3"
                  >
                    <Link
                      href={`/stock/${encodeURIComponent(m.ticker)}`}
                      className={`text-[16px] font-semibold ${tone} hover:underline`}
                    >
                      {m.ticker}
                    </Link>
                    <span className="text-[14px] text-[#6b7280] leading-snug">
                      {m.one_liner}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </BriefCard>

        <BriefCard
          label={signal?.tag || "Signal"}
          icon="bolt"
          iconBg="#fef3c7"
          iconFg="#b45309"
        >
          <p className="text-[16px] font-semibold text-[#111111] leading-snug">
            {signal?.headline || "Quiet day across the watchlist."}
          </p>
          {signal?.body && (
            <p className="text-[14px] text-[#6b7280] leading-relaxed mt-2">
              {signal.body}
            </p>
          )}
        </BriefCard>

        <BriefCard
          label="Blind spot"
          icon="visibility_off"
          iconBg="#f5f3ff"
          iconFg="#7c3aed"
        >
          <p className="text-[16px] font-semibold text-[#111111] leading-snug">
            {brief.blind_spot_title || "Exposure check"}
          </p>
          {brief.blind_spot_body && (
            <p className="text-[14px] text-[#6b7280] leading-relaxed mt-2">
              {brief.blind_spot_body}
            </p>
          )}
        </BriefCard>
      </div>
    </section>
  );
}

function BriefCard({
  label,
  icon,
  iconBg,
  iconFg,
  children,
}: {
  label: string;
  icon: string;
  iconBg: string;
  iconFg: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: iconBg, color: iconFg }}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <span
          className="text-[11px] font-semibold tracking-[0.08em] uppercase"
          style={{ color: iconFg }}
        >
          {label}
        </span>
      </div>
      <div>{children}</div>
    </article>
  );
}

function PortfolioDiagnosisSection({ portfolio }: { portfolio: Dict }) {
  const clusters = asArray(portfolio.clusters).slice(0, 5);
  const risks = asArray(portfolio.risk_flags).slice(0, 4);
  const opportunities = asArray(portfolio.opportunities).slice(0, 3);
  const suggestions = asArray(portfolio.suggestions).slice(0, 4);
  const factorTilt = asDict(portfolio.factor_tilt);

  return (
    <section className="flex flex-col gap-6 pt-8 border-t border-[#e5e7eb]">
      <SectionHead title="Portfolio diagnosis" />

      {text(portfolio.summary) && (
        <p className="text-[15px] text-[#111111] leading-relaxed font-medium max-w-[760px]">
          {text(portfolio.summary)}
        </p>
      )}

      {/* Factor tilt — single horizontal stat row */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
          Factor tilt
        </span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          <FactorStat label="Overall" score={num(factorTilt.overall)} />
          <FactorStat label="Valuation" score={num(factorTilt.valuation)} />
          <FactorStat label="Growth" score={num(factorTilt.growth)} />
          <FactorStat label="Momentum" score={num(factorTilt.momentum)} />
        </div>
      </div>

      {/* Clusters as horizontal bar chart + Risk flags side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8 pt-2">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
            Clusters
          </span>
          {clusters.length === 0 ? (
            <p className="text-[13px] text-[#6b7280]">No sector clusters yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {clusters.map((cluster, i) => {
                const sector = text(cluster.sector) || "Unknown";
                const pct = num(cluster.weight_pct) ?? 0;
                const count = num(cluster.count) ?? 0;
                return (
                  <li key={`cluster-${i}`} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-semibold text-[#111111]">
                        {sector}
                      </span>
                      <span className="text-[12px] tabular-nums text-[#6b7280]">
                        {count} stock{count === 1 ? "" : "s"} ·{" "}
                        <span className="font-semibold text-[#111111]">
                          {pct.toFixed(1)}%
                        </span>
                      </span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(2, pct))}%`,
                          background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
            Risk flags
          </span>
          {risks.length === 0 ? (
            <p className="text-[13px] text-[#6b7280]">No major risk flags.</p>
          ) : (
            <ul className="flex flex-col">
              {risks.map((risk, i) => {
                const severity = text(risk.severity).toLowerCase();
                const tone = severityTone(severity);
                const headline = text(risk.headline);
                const body = text(risk.body);
                return (
                  <li
                    key={`risk-${i}`}
                    className="py-3 border-t border-[#f3f4f6] first:border-t-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-semibold text-[#111111]">
                        {tickerLink(text(risk.ticker)) ||
                          text(risk.kind) ||
                          "Risk"}
                      </span>
                      {severity && (
                        <span
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {severity}
                        </span>
                      )}
                    </div>
                    {(headline || body) && (
                      <p className="text-[12px] text-[#6b7280] leading-snug mt-1">
                        {headline}
                        {headline && body ? " — " : ""}
                        {body}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Opportunities — own row, horizontal card grid */}
      <div className="flex flex-col gap-3 pt-4 border-t border-[#f3f4f6]">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
          Opportunities
        </span>
        {opportunities.length === 0 ? (
          <p className="text-[13px] text-[#6b7280]">No opportunity cards yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {opportunities.map((item, i) => (
              <div
                key={`opp-${i}`}
                className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-[#111111]">
                    {tickerLink(text(item.ticker)) || "Opportunity"}
                  </span>
                  {text(item.kind) && (
                    <span className="inline-flex items-center rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[#065f46]">
                      {text(item.kind).replaceAll("_", " ")}
                    </span>
                  )}
                </div>
                {text(item.headline) && (
                  <p className="text-[13px] font-semibold text-[#111111] leading-snug">
                    {text(item.headline)}
                  </p>
                )}
                {text(item.body) && (
                  <p className="text-[12px] text-[#6b7280] leading-snug">
                    {text(item.body)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stocks to check out — own row, full-width list */}
      <div className="flex flex-col gap-3 pt-4 border-t border-[#f3f4f6]">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
          Stocks to check out
        </span>
        {suggestions.length === 0 ? (
          <p className="text-[13px] text-[#6b7280]">No suggestions yet.</p>
        ) : (
          <ul className="flex flex-col">
            {suggestions.map((item, i) => {
              const score = num(item.score ?? item.match_score);
              const ticker = text(item.ticker);
              return (
                <li
                  key={`sug-${i}`}
                  className="py-3 border-t border-[#f3f4f6] first:border-t-0 flex items-center gap-4"
                >
                  {ticker ? (
                    <Link
                      href={`/stock/${encodeURIComponent(ticker)}`}
                      className="flex items-center gap-2.5 group shrink-0"
                    >
                      <StockLogo ticker={ticker} size={28} />
                      <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                        {ticker}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[14px] font-semibold text-[#111111] shrink-0">
                      Suggestion
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    {text(item.reason) && (
                      <p className="text-[13px] text-[#111111] font-medium">
                        {text(item.reason)}
                      </p>
                    )}
                    {text(item.why) && (
                      <p className="text-[12px] text-[#6b7280] leading-snug mt-0.5">
                        {text(item.why)}
                      </p>
                    )}
                  </div>
                  {score !== null && (
                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={`text-[18px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}
                      >
                        {score.toFixed(1)}
                      </span>
                      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                        Score
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

const CLUSTER_COLORS = ["#0052ff", "#10b981", "#b45309", "#7c3aed", "#ef4444"];

function FactorStat({ label, score }: { label: string; score: number | null }) {
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-[#6b7280] tracking-[0.04em] truncate">
          {label}
        </span>
        <span
          className={`text-[16px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}
        >
          {score === null ? "—" : Math.round(score)}
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-[#f3f4f6] overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${scoreToneFill(score)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function scoreToneText(score: number | null): string {
  if (score === null) return "text-[#9ca3af]";
  if (score >= 80) return "text-[#10b981]";
  if (score >= 60) return "text-[#111111]";
  if (score >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function scoreToneFill(score: number | null): string {
  if (score === null) return "bg-[#e5e7eb]";
  if (score >= 80) return "bg-[#10b981]";
  if (score >= 60) return "bg-[#0052ff]";
  if (score >= 40) return "bg-[#f59e0b]";
  return "bg-[#ef4444]";
}

function severityTone(severity: string): { bg: string; fg: string } {
  if (severity === "high")
    return { bg: "#fef2f2", fg: "#991b1b" };
  if (severity === "medium" || severity === "med")
    return { bg: "#fef3c7", fg: "#92400e" };
  if (severity === "low")
    return { bg: "#ecfdf5", fg: "#065f46" };
  return { bg: "#f3f4f6", fg: "#6b7280" };
}

function tickerLink(ticker: string): React.ReactNode | "" {
  if (!ticker) return "";
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="hover:text-[#0052ff] transition-colors"
    >
      {ticker}
    </Link>
  );
}

function AlertsSection({ rows }: { rows: WatchlistRow[] }) {
  type Flat = {
    ticker: string;
    kind: string;
    message: string;
    tone: "bull" | "bear" | "neutral";
  };
  const flat: Flat[] = [];
  for (const row of rows) {
    for (const flag of row.alerts) {
      const kind =
        typeof flag?.kind === "string"
          ? flag.kind
          : typeof flag?.type === "string"
            ? flag.type
            : "info";
      const message =
        typeof flag?.message === "string"
          ? flag.message
          : typeof flag?.label === "string"
            ? flag.label
            : kind;
      const tone: Flat["tone"] =
        kind.includes("bearish") ||
        kind.includes("overbought") ||
        kind.includes("52w_low")
          ? "bear"
          : kind.includes("bullish") || kind.includes("oversold")
            ? "bull"
            : "neutral";
      flat.push({ ticker: row.ticker, kind, message, tone });
    }
  }

  if (flat.length === 0) return null;

  return (
    <section id="alerts" className="flex flex-col gap-4 pt-8 border-t border-[#e5e7eb]">
      <SectionHead title="Alerts" meta={`${flat.length} active`} />
      <ul className="flex flex-col border-t border-[#f3f4f6]">
        {flat.map((f, i) => {
          const bar = ALERT_BAR[f.tone];
          return (
            <li
              key={`${f.ticker}-${i}`}
              className="grid grid-cols-[3px_minmax(48px,_auto)_1fr] items-center gap-4 py-3 border-b border-[#f3f4f6]"
            >
              <span aria-hidden className="self-stretch rounded-sm" style={{ background: bar }} />
              <Link
                href={`/stock/${encodeURIComponent(f.ticker)}`}
                className="text-[12px] font-semibold tabular-nums text-[#111111] hover:text-[#0052ff] transition-colors"
              >
                {f.ticker}
              </Link>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] text-[#111111] leading-snug">
                  {f.message}
                </span>
                <span className="text-[11px] text-[#6b7280] tracking-[0.04em]">
                  {f.kind.replaceAll("_", " ")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ALERT_BAR: Record<"bull" | "bear" | "neutral", string> = {
  bull: "#10b981",
  bear: "#ef4444",
  neutral: "#f59e0b",
};

// -----------------------------------------------------------------------------
// Empty / unsubscribed
// -----------------------------------------------------------------------------

function EmptyState() {
  return (
    <section className="rounded-3xl border border-[#e5e7eb] bg-white p-10 md:p-14 flex flex-col items-center text-center gap-3">
      <span
        aria-hidden
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3f4f6] text-[28px]"
      >
        📒
      </span>
      <h2 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
        Nothing tracked yet
      </h2>
      <p className="text-[14px] text-[#6b7280] leading-relaxed max-w-md">
        Open any stock detail page and tap{" "}
        <span className="font-semibold text-[#111111]">Track this stock</span> to
        start getting twice-daily AI briefs tailored to your portfolio.
      </p>
      <Link
        href="/"
        className="mt-3 inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
      >
        Browse stocks
      </Link>
    </section>
  );
}

function UnsubscribedState() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 md:py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] md:text-[34px] font-semibold text-[#111111] tracking-[-0.02em] leading-none">
            Watchlist
          </h1>
          <p className="text-[13px] text-[#6b7280]">
            A subscriber feature — track up to {SLOT_CAP} stocks and get a
            twice-daily AI brief across them.
          </p>
        </header>

        <section className="rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eff6ff] text-[18px]"
            >
              🔒
            </span>
            <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
              Subscriber tier
            </span>
          </div>
          <h2 className="text-[20px] font-semibold text-[#111111] tracking-[-0.01em]">
            Upgrade to unlock the watchlist
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FeatureCard
              emoji="🎯"
              iconBg="#ecfdf5"
              title="News-backed briefs"
              body="Each tracked stock gets its own LLM brief on every refresh — same depth as the launch tier."
            />
            <FeatureCard
              emoji="⚡"
              iconBg="#fef3c7"
              title="Cross-stock signal"
              body="A daily synthesis surfaces themes, blind spots, and risk rollups across the whole list."
            />
            <FeatureCard
              emoji="🔔"
              iconBg="#fef2f2"
              title="Red-flag alerts"
              body="Overbought RSI, earnings tomorrow, 52-week lows — flagged the moment they trigger."
            />
          </div>
          <div>
            <Link
              href="/subscribe"
              className="inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
            >
              See subscription options
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({
  emoji,
  iconBg,
  title,
  body,
}: {
  emoji: string;
  iconBg: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-2">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[16px]"
        style={{ background: iconBg }}
      >
        {emoji}
      </span>
      <p className="text-[13px] font-semibold text-[#111111]">{title}</p>
      <p className="text-[12px] text-[#6b7280] leading-snug">{body}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter((item): item is Dict => !!item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "—";
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
