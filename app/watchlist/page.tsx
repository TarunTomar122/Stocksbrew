import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getWatchlistView } from "@/lib/watchlist-view";
import type { WatchlistBrief, WatchlistRow, WatchlistPulse } from "@/lib/watchlist-view";
import type { Directive } from "@/lib/stock";
import { StockLogo } from "@/components/stock-logo";
import { StrategicDirective } from "@/components/strategic-directive";
import { RadarLedger } from "@/components/radar-ledger";
import { RadarActivity } from "@/components/radar-activity";
import { WatchlistTabs } from "@/components/watchlist-tabs";
import { TrackButton } from "@/components/track-button";
import { YourBookLayout } from "@/components/your-book-layout";

export const dynamic = "force-dynamic";

type Dict = Record<string, unknown>;

// =============================================================================
// PAGE
// =============================================================================

export default async function WatchlistPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/?signin=required");
  }

  const userDoc = await getUserDoc(session.uid);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);
  const watchlistView = await getWatchlistView(session.uid).catch(() => null);
  const radar = userDoc?.radar_v1 || {};
  const rows = (watchlistView?.rows || radar.rows || []) as WatchlistRow[];
  const suggestions = (watchlistView?.suggestions || radar.suggestions || []) as Dict[];
  const brief = ((watchlistView?.brief || radar.brief) ?? null) as WatchlistBrief | null;
  const pulse = ((watchlistView?.pulse || radar.pulse) ?? null) as WatchlistPulse | null;
  const portfolio = ((watchlistView?.portfolio || radar.portfolio) ?? {}) as Dict;
  const eventRadar = ((watchlistView?.event_radar || radar.event_radar) ?? []) as Dict[];
  const changes = ((watchlistView?.changes || radar.changes) ?? {}) as Dict;
  const builtAt =
    typeof watchlistView?.built_at === "string"
      ? watchlistView.built_at
      : typeof radar.built_at === "string"
      ? radar.built_at
      : undefined;

  if (watchlistView && radar && Array.isArray((radar as Dict).rows)) {
    const materializedRows = (watchlistView.rows || []).map((r) => String(r.ticker || r.instrument_id || ""));
    const legacyRows = ((radar as Dict).rows as Array<Record<string, unknown>>)
      .map((r) => String(r.ticker || r.instrument_id || ""));
    const a = new Set(materializedRows.filter(Boolean));
    const b = new Set(legacyRows.filter(Boolean));
    const onlyA = [...a].filter((x) => !b.has(x));
    const onlyB = [...b].filter((x) => !a.has(x));
    if (onlyA.length > 0 || onlyB.length > 0) {
      console.warn(
        JSON.stringify({
          svc: "watchlist-page",
          msg: "materialized_vs_legacy_divergence",
          uid: session.uid,
          materialized_count: a.size,
          legacy_count: b.size,
          only_materialized: onlyA.slice(0, 8),
          only_legacy: onlyB.slice(0, 8),
        }),
      );
    }
  }

  if (!isSubscribed && rows.length === 0) {
    return <UnsubscribedState tracked={tracked} />;
  }
  if (!isSubscribed) {
    return <FreeRadarState rows={rows} builtAt={builtAt} />;
  }
  if (rows.length === 0) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-6 md:px-20 lg:px-32 py-10 md:py-12 flex flex-col gap-8">
          <BareHeader rowsCount={tracked.length} builtAt={builtAt} />
          <EmptyState suggestions={suggestions} />
        </div>
      </main>
    );
  }

  // ── derive directives, ordered by urgency ───────────────────────────────────
  const directiveRows = rows
    .map((row) => ({
      row,
      directive: rowDirective(row),
    }))
    .filter((d): d is { row: WatchlistRow; directive: Directive } => Boolean(d.directive));
  directiveRows.sort((a, b) => directiveUrgency(b.row, b.directive) - directiveUrgency(a.row, a.directive));

  const topDirective = directiveRows[0] ?? null;
  const secondaryDirectives = directiveRows.slice(1, 5);

  // ── live tape items ─────────────────────────────────────────────────────────
  const flatAlerts = flattenAlerts(rows);
  const tapeItems = buildTapeItems(rows, flatAlerts);

  // ── ledger groupings ────────────────────────────────────────────────────────
  const holdings = rows.filter((r) => r.position_type === "holding").sort(byAttention);
  const watching = rows.filter((r) => r.position_type !== "holding").sort(byAttention);

  // ── up-next (forward catalysts across all rows) ─────────────────────────────
  const upNext = buildUpNext(rows);

  // ── portfolio score + pillar averages ───────────────────────────────────────
  const pillarAverages = computePillarAverages(rows);
  const factorTilt = asDict(portfolio.factor_tilt);

  // ── activity / changes data ─────────────────────────────────────────────────
  const activityEvents = buildActivityEvents(eventRadar, brief);
  const changesData = buildChangesData(changes);

  return (
    <main className="flex-grow bg-white">
      <style>{tapeStyles}</style>
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-3 sm:px-6 md:px-20 lg:px-32 py-6 lg:py-10">
        {/* ── HEADER STRIP ──────────────────────────────────────────────── */}
        <HeaderStrip rows={rows} builtAt={builtAt} pulse={pulse} tapeItems={tapeItems} />

        {/* ── § 01 · TODAY ──────────────────────────────────────────────── */}
        <TodaySection
          brief={brief}
          topDirective={topDirective}
          secondaryDirectives={secondaryDirectives}
          suggestions={suggestions}
        />

        {/* ── § 02 · YOUR BOOK ──────────────────────────────────────────── */}
        <YourBookSection
          holdings={holdings}
          watching={watching}
          upNext={upNext}
          alerts={flatAlerts}
          suggestions={suggestions}
        />

        {/* ── § 03 · DIAGNOSIS ──────────────────────────────────────────── */}
        <DiagnosisSection
          portfolio={portfolio}
          pillarAverages={pillarAverages}
          factorTilt={factorTilt}
          suggestions={suggestions}
          tracked={tracked}
          isSubscribed={isSubscribed}
        />

        {/* ── § 04 · ACTIVITY ───────────────────────────────────────────── */}
        <RadarActivity events={activityEvents} changes={changesData} />
      </div>
    </main>
  );
}

// =============================================================================
// HEADER STRIP — title + meta on left, live alert tape on right
// =============================================================================

function HeaderStrip({
  rows,
  builtAt,
  pulse,
  tapeItems,
}: {
  rows: WatchlistRow[];
  builtAt?: string;
  pulse: WatchlistPulse | null;
  tapeItems: TapeItem[];
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#9ca3af]">
            tikrr · {todayMasthead()}
          </span>
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] text-[#0a0a0a] leading-none">
            Radar
          </h1>
          <p className="text-[12.5px] text-[#6b7280]">
            {rows.length} {rows.length === 1 ? "ticker" : "tickers"} on Radar · refreshed{" "}
            {builtAt ? formatRelative(builtAt) : "never"}
            {pulse?.subtitle ? ` · ${pulse.subtitle}` : ""}
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 self-start rounded-full border border-[#e5e7eb] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#111111] hover:border-[#111111] transition-colors"
        >
          <span aria-hidden>＋</span>
          Add a stock
        </Link>
      </div>

      {/* live tape */}
      {tapeItems.length > 0 && <LiveTape items={tapeItems} />}
    </header>
  );
}

type TapeItem = {
  ticker: string;
  body: string;
  tone: "bull" | "bear" | "neutral";
};

function LiveTape({ items }: { items: TapeItem[] }) {
  // duplicate the list so the marquee loops seamlessly
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-[#ececea] bg-[#fafaf7] py-2">
      <div className="radar-tape flex shrink-0 items-center gap-8 whitespace-nowrap">
        {doubled.map((item, i) => {
          const color =
            item.tone === "bull"
              ? "#047857"
              : item.tone === "bear"
              ? "#b91c1c"
              : "#6b7280";
          return (
            <Link
              key={`tape-${i}-${item.ticker}`}
              href={`/stock/${encodeURIComponent(item.ticker)}`}
              className="inline-flex items-center gap-2 text-[12px] font-medium tabular-nums hover:underline"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              <span className="font-semibold text-[#0a0a0a]">{item.ticker}</span>
              <span style={{ color }}>{item.body}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const tapeStyles = `
@keyframes radar-tape-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.radar-tape {
  animation: radar-tape-scroll 50s linear infinite;
  width: max-content;
}
.radar-tape:hover {
  animation-play-state: paused;
}
`;

function buildTapeItems(rows: WatchlistRow[], flatAlerts: FlatAlert[]): TapeItem[] {
  const items: TapeItem[] = [];

  // top day-changers first
  const sortedRows = [...rows]
    .filter((r) => typeof r.day_change_pct === "number")
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))
    .slice(0, 6);
  for (const r of sortedRows) {
    const pct = r.day_change_pct ?? 0;
    if (Math.abs(pct) < 1.5) continue;
    items.push({
      ticker: r.ticker,
      body: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
      tone: pct >= 0 ? "bull" : "bear",
    });
  }
  // then alerts not already represented
  const seen = new Set(items.map((i) => i.ticker));
  for (const f of flatAlerts.slice(0, 8)) {
    if (seen.has(f.ticker)) continue;
    items.push({ ticker: f.ticker, body: f.message, tone: f.tone });
    seen.add(f.ticker);
  }
  return items.slice(0, 14);
}

function todayMasthead(): string {
  const d = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

// =============================================================================
// § 01 · TODAY
// =============================================================================

const FALLBACK_EXPLORE_SUGGESTIONS: Dict[] = [
  { ticker: "NVDA", sector: "Semiconductors", why: "AI infra leader · top tikrr score", score: 90, market: "US" },
  { ticker: "MSFT", sector: "Software", why: "Quality compounder · steady earnings", score: 82, market: "US" },
  { ticker: "META", sector: "Comm. Services", why: "Analyst runway +33% · momentum", score: 78, market: "US" },
  { ticker: "AAPL", sector: "Consumer Electronics", why: "Most-watched · durable free cash flow", score: 74, market: "US" },
];

function TodaySection({
  brief,
  topDirective,
  secondaryDirectives,
  suggestions,
}: {
  brief: WatchlistBrief | null;
  topDirective: { row: WatchlistRow; directive: Directive } | null;
  secondaryDirectives: Array<{ row: WatchlistRow; directive: Directive }>;
  suggestions: Dict[];
}) {
  // If we have no directives at all, fall back to brief-only display
  if (!topDirective && (!brief?.narrative || !brief.narrative.trim())) {
    return null;
  }

  // Fill secondary grid up to 4 — use suggestions for empty slots
  const fillCount = Math.max(0, 4 - secondaryDirectives.length);
  const exploreSuggestions = (suggestions.length > 0 ? suggestions : FALLBACK_EXPLORE_SUGGESTIONS).slice(0, fillCount);

  return (
    <section className="flex flex-col gap-6">
      <SectionOpener number="01" title="Today" />

      {/* Tone lede (the macro one-liner) */}
      {brief?.narrative && (
        <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">
          {brief.narrative}
        </p>
      )}

      {/* Primary directive — feature card with ticker header */}
      {topDirective && (
        <div className="flex flex-col gap-3">
          <PrimaryDirectiveHeader row={topDirective.row} />
          <StrategicDirective
            ticker={topDirective.row.ticker}
            directive={topDirective.directive}
            instrumentId={topDirective.row.instrument_id}
          />
        </div>
      )}

      {/* Secondary directives + explore fill cards */}
      {(secondaryDirectives.length > 0 || exploreSuggestions.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {secondaryDirectives.map(({ row, directive }) => (
            <SecondaryDirectiveCard key={row.instrument_id} row={row} directive={directive} />
          ))}
          {exploreSuggestions.map((s) => (
            <ExploreDirectiveCard key={String(s.ticker)} suggestion={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function PositionPill({ type }: { type?: string }) {
  const isHolding = type === "holding";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase ${
        isHolding
          ? "bg-[#ecfdf5] text-[#047857]"
          : "bg-[#f3f4f6] text-[#6b7280]"
      }`}
    >
      <span
        aria-hidden
        className={`h-1 w-1 rounded-full ${isHolding ? "bg-[#10b981]" : "bg-[#9ca3af]"}`}
      />
      {isHolding ? "Holding" : "Watching"}
    </span>
  );
}

function PrimaryDirectiveHeader({ row }: { row: WatchlistRow }) {
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  const symbol = row.currency === "INR" ? "₹" : "$";
  const priceStr =
    typeof row.price === "number"
      ? `${symbol}${row.price.toLocaleString(undefined, {
          minimumFractionDigits: row.price >= 1000 ? 0 : 2,
          maximumFractionDigits: row.price >= 1000 ? 0 : 2,
        })}`
      : "—";
  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group inline-flex items-center gap-3 self-start"
    >
      <StockLogo
        ticker={row.ticker}
        logoUrl={row.logo_url}
        market={market}
        size={36}
      />
      <div className="flex flex-col gap-0">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-semibold tracking-[-0.01em] text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
            {row.ticker}
          </span>
          <span className="text-[12px] text-[#9ca3af] truncate max-w-[260px]">
            {row.sector_label || ""}
          </span>
          <PositionPill type={row.position_type} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-[#0a0a0a]">
            {priceStr}
          </span>
          {typeof row.day_change_pct === "number" && (
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                positive ? "text-[#047857]" : "text-[#b91c1c]"
              }`}
            >
              {positive ? "+" : ""}
              {dayChange.toFixed(2)}%
            </span>
          )}
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
            Today&apos;s top directive
          </span>
        </div>
      </div>
    </Link>
  );
}

const STANCE_META: Record<
  string,
  { label: string; bg: string; fg: string; chipBg: string; chipFg: string }
> = {
  accumulate: { label: "Accumulate", bg: "#ecfdf5", fg: "#065f46", chipBg: "#10b981", chipFg: "#ffffff" },
  trim: { label: "Trim", bg: "#fef3c7", fg: "#92400e", chipBg: "#f59e0b", chipFg: "#ffffff" },
  watch: { label: "Watch", bg: "#eff6ff", fg: "#1e3a8a", chipBg: "#0052ff", chipFg: "#ffffff" },
  avoid: { label: "Avoid", bg: "#fef2f2", fg: "#991b1b", chipBg: "#ef4444", chipFg: "#ffffff" },
  hold: { label: "Hold", bg: "#f3f4f6", fg: "#374151", chipBg: "#374151", chipFg: "#ffffff" },
};

function SecondaryDirectiveCard({
  row,
  directive,
}: {
  row: WatchlistRow;
  directive: Directive;
}) {
  const meta = STANCE_META[directive.stance ?? "hold"] ?? STANCE_META.hold;
  const market = row.market === "IN" ? "IN" : "US";
  const dayChange = row.day_change_pct ?? 0;
  const positive = dayChange >= 0;
  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
          style={{ background: meta.chipBg, color: meta.chipFg }}
        >
          {meta.label}
        </span>
        {typeof row.day_change_pct === "number" && (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              positive ? "text-[#047857]" : "text-[#b91c1c]"
            }`}
          >
            {positive ? "+" : ""}
            {dayChange.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={32} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
              {row.ticker}
            </span>
            <PositionPill type={row.position_type} />
          </div>
          <div className="flex items-baseline gap-1.5">
            {typeof row.price === "number" && (
              <span className="text-[12px] font-semibold tabular-nums text-[#374151]">
                {row.currency === "INR" ? "₹" : "$"}{row.price.toLocaleString(undefined, {
                  minimumFractionDigits: row.price >= 1000 ? 0 : 2,
                  maximumFractionDigits: row.price >= 1000 ? 0 : 2,
                })}
              </span>
            )}
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[120px]">
              {row.sector_label || "—"}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug line-clamp-2 mt-auto">
        {directive.text}
      </p>
      {directive.rationale && (
        <p className="text-[11.5px] text-[#6b7280] leading-snug line-clamp-2">
          {directive.rationale}
        </p>
      )}
    </Link>
  );
}

function ExploreDirectiveCard({ suggestion }: { suggestion: Dict }) {
  const ticker = String(suggestion.ticker ?? "");
  const market = String(suggestion.market ?? "US") === "IN" ? "IN" : "US";
  const sector = String(suggestion.sector ?? suggestion.name ?? "");
  const why = String(suggestion.why ?? suggestion.reason ?? "");
  const score = typeof suggestion.score === "number" ? suggestion.score : null;
  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="group relative overflow-hidden rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafaf7] p-4 transition-all hover:border-[#111111] hover:bg-white hover:shadow-sm flex flex-col gap-3"
    >
      {/* "Explore" badge top-left */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase bg-[#f3f4f6] text-[#6b7280]">
          Explore
        </span>
        {score !== null && (
          <span className={`text-[11px] font-semibold tabular-nums ${
            score >= 80 ? "text-[#10b981]" : score >= 60 ? "text-[#374151]" : "text-[#9ca3af]"
          }`}>
            {Math.round(score)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <StockLogo ticker={ticker} market={market} size={32} />
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
            {ticker}
          </span>
          {sector && (
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[160px]">{sector}</span>
          )}
        </div>
      </div>

      {why && (
        <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-2 mt-auto">
          {why}
        </p>
      )}

      <span className="text-[11px] font-semibold text-[#9ca3af] group-hover:text-[#0052ff] transition-colors">
        Track to get directive →
      </span>
    </Link>
  );
}

// =============================================================================
// § 02 · YOUR BOOK — ledger + Up Next/Alerts rail
// =============================================================================

type UpNextItem = {
  ticker: string;
  title: string;
  window: string;
  urgency: "high" | "med" | "low" | "";
};

function YourBookSection({
  holdings,
  watching,
  upNext,
  alerts,
  suggestions,
}: {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
  upNext: UpNextItem[];
  alerts: FlatAlert[];
  suggestions: Dict[];
}) {
  // Flatten suggestion dicts to the shape RadarLedger expects.
  const suggestionList = suggestions.slice(0, 6).map((item) => ({
    ticker: text(item.ticker),
    name: text(item.name),
    sector: text(item.sector),
    reason: text(item.reason),
    why: text(item.why),
    score: num(item.score ?? item.match_score),
    market: text(item.market) || "US",
  }));

  return (
    <section className="flex flex-col gap-6">
      <SectionOpener
        number="02"
        title="Your book"
        meta={`${holdings.length} held · ${watching.length} watching`}
      />

      <YourBookLayout
        holdings={holdings}
        watching={watching}
        suggestions={suggestionList}
        upNextSlot={<UpNextPanel items={upNext} />}
        alertsSlot={<AlertsPanel alerts={alerts} />}
      />
    </section>
  );
}

function UpNextPanel({ items }: { items: UpNextItem[] }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[14px]"
          >
            ⏰
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#1e3a8a]">
            Up Next
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] italic text-[#9ca3af]">
          Nothing scheduled on tracked names.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f3f4f6]">
          {items.slice(0, 4).map((item, i) => (
            <li key={`up-${i}`} className="py-2.5 first:pt-0 last:pb-0">
              <Link
                href={`/stock/${encodeURIComponent(item.ticker)}`}
                className="flex items-start gap-2.5 group"
              >
                <StockLogo ticker={item.ticker} market="US" size={28} />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
                      {item.ticker}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                      {item.window}
                    </span>
                  </div>
                  <span className="text-[11.5px] text-[#6b7280] leading-snug">
                    {item.title}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertsPanel({ alerts }: { alerts: FlatAlert[] }) {
  const shown = alerts.slice(0, 5);
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#fef2f2] text-[14px]"
          >
            🔔
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#991b1b]">
            Alerts
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {alerts.length}
        </span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-[12px] italic text-[#9ca3af]">No active alerts.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f3f4f6]">
          {shown.map((f, i) => {
            const toneColor =
              f.tone === "bull" ? "#10b981" : f.tone === "bear" ? "#ef4444" : "#f59e0b";
            return (
              <li key={`alert-${i}`} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: toneColor }}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <Link
                    href={`/stock/${encodeURIComponent(f.ticker)}`}
                    className="text-[12px] font-semibold text-[#0a0a0a] hover:text-[#0052ff] transition-colors"
                  >
                    {f.ticker}
                  </Link>
                  <span className="text-[11px] text-[#6b7280] leading-snug truncate">
                    {f.message}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {alerts.length > shown.length && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
          +{alerts.length - shown.length} more
        </span>
      )}
    </div>
  );
}

// =============================================================================
// § 03 · DIAGNOSIS — Scorecard pattern + clusters/risks + opportunities + checks
// =============================================================================

function DiagnosisSection({
  portfolio,
  pillarAverages,
  factorTilt,
  suggestions,
  tracked,
  isSubscribed,
}: {
  portfolio: Dict;
  pillarAverages: PillarAverages;
  factorTilt: Dict;
  suggestions: Dict[];
  tracked: string[];
  isSubscribed: boolean;
}) {
  const clusters = asArray(portfolio.clusters).slice(0, 5);
  const risks = asArray(portfolio.risk_flags).slice(0, 4);
  const opportunities = asArray(portfolio.opportunities).slice(0, 3);
  const summary = text(portfolio.summary);

  // prefer backend factor_tilt, fallback to computed averages from rows
  const overall = num(factorTilt.overall) ?? pillarAverages.overall;
  const valuation = num(factorTilt.valuation) ?? pillarAverages.valuation;
  const growth = num(factorTilt.growth) ?? pillarAverages.growth;
  const quality = num(factorTilt.quality) ?? pillarAverages.quality;
  const momentum = num(factorTilt.momentum) ?? pillarAverages.momentum;

  const fallbackSuggestions = asArray(portfolio.suggestions);
  const checkOuts = suggestions.length > 0 ? suggestions : fallbackSuggestions;

  return (
    <section className="flex flex-col gap-8">
      <SectionOpener number="03" title="Diagnosis" />

      {summary && (
        <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">
          {summary}
        </p>
      )}

      {/* Score + 4 pillars (mirrors stock-page Scorecard) */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(240px,_300px)_1fr] gap-6 md:gap-10 items-start">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#1e3a8a]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#0052ff]" />
            Your whole book
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af] mt-1">
            Portfolio score
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[52px] md:text-[64px] font-semibold leading-none tabular-nums ${scoreToneText(overall)}`}
            >
              {overall === null ? "—" : Math.round(overall)}
            </span>
            <span className="text-[20px] font-medium text-[#9ca3af]">/ 100</span>
          </div>
          <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#6b7280]">
            {verdictLabel(overall)}
          </span>
          <p className="text-[13px] text-[#6b7280] leading-relaxed mt-1 max-w-[280px]">
            Averaged across every stock you hold or watch — composite of valuation, growth, quality &amp; momentum.
          </p>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <PortfolioPillarCard name="Valuation" emoji="🏷️" iconBg="#fef3c7" score={valuation} />
          <PortfolioPillarCard name="Growth" emoji="🌱" iconBg="#ecfdf5" score={growth} />
          <PortfolioPillarCard name="Quality" emoji="🏛️" iconBg="#f3f4f6" score={quality} />
          <PortfolioPillarCard name="Momentum" emoji="🚀" iconBg="#eff6ff" score={momentum} />
        </div>
      </div>

      {/* Clusters + Risk flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8 pt-2">
        <ClustersBlock clusters={clusters} />
        <RiskFlagsBlock risks={risks} />
      </div>

      {/* Opportunities */}
      <OpportunitiesGrid items={opportunities} />

      {/* Stocks to check out */}
      <StocksToCheckOut suggestions={checkOuts} tracked={tracked} isSubscribed={isSubscribed} />
    </section>
  );
}

function PortfolioPillarCard({
  name,
  emoji,
  iconBg,
  score,
}: {
  name: string;
  emoji: string;
  iconBg: string;
  score: number | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
          style={{ background: iconBg }}
        >
          {emoji}
        </span>
        <span
          className={`text-[24px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}
        >
          {score === null ? "—" : Math.round(score)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#111111]">
          {name}
        </span>
        <ScoreBar score={score} />
        <span className="text-[11px] text-[#6b7280]">{verdictLabel(score)}</span>
      </div>
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  const clamped = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="relative h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${scoreToneFill(score)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

const CLUSTER_COLORS = ["#0052ff", "#10b981", "#b45309", "#7c3aed", "#ef4444"];

function ClustersBlock({ clusters }: { clusters: Dict[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f3ff] text-[14px]">
          🧩
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#7c3aed]">
          Clusters
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {clusters.length}
        </span>
      </div>
      {clusters.length === 0 ? (
        <p className="text-[13px] text-[#6b7280]">No sector clusters yet.</p>
      ) : (
        <>
          {/* Unified stacked bar */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
            {clusters.map((c, i) => {
              const pct = num(c.weight_pct) ?? 0;
              return (
                <div
                  key={`stack-${i}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    background: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                  }}
                />
              );
            })}
          </div>
          <ul className="flex flex-col gap-2 mt-1">
            {clusters.map((cluster, i) => {
              const sector = text(cluster.sector) || "Unknown";
              const pct = num(cluster.weight_pct) ?? 0;
              const count = num(cluster.count) ?? 0;
              return (
                <li key={`cluster-${i}`} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
                  />
                  <span className="text-[13px] font-semibold text-[#111111] flex-1 truncate">
                    {sector}
                  </span>
                  <span className="text-[11px] text-[#9ca3af] tabular-nums">
                    {count} stock{count === 1 ? "" : "s"}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#111111] w-12 text-right">
                    {pct.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function RiskFlagsBlock({ risks }: { risks: Dict[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#fef2f2] text-[14px]">
          ⚠️
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#b91c1c]">
          Risk flags
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {risks.length}
        </span>
      </div>
      {risks.length === 0 ? (
        <p className="text-[13px] text-[#6b7280] italic">No major risk flags.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {risks.map((risk, i) => {
            const severity = text(risk.severity).toLowerCase();
            const tone = severityTone(severity);
            const headline = text(risk.headline);
            const body = text(risk.body);
            const ticker = text(risk.ticker);
            const kindLabel = text(risk.kind).replaceAll("_", " ");
            const title = ticker || kindLabel || "Risk";
            return (
              <li
                key={`risk-${i}`}
                className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-[#0a0a0a] tracking-[-0.01em]">
                    {ticker ? (
                      <Link
                        href={`/stock/${encodeURIComponent(ticker)}`}
                        className="hover:text-[#0052ff] transition-colors"
                      >
                        {ticker}
                      </Link>
                    ) : (
                      title
                    )}
                    {ticker && kindLabel && (
                      <span className="ml-2 text-[11px] font-medium text-[#9ca3af] tracking-[0.04em] uppercase">
                        {kindLabel}
                      </span>
                    )}
                  </span>
                  {severity && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
                      style={{ background: tone.chipBg, color: tone.chipFg }}
                    >
                      <span
                        aria-hidden
                        className="h-1 w-1 rounded-full bg-white/80"
                      />
                      {severity}
                    </span>
                  )}
                </div>
                {(headline || body) && (
                  <p className="text-[15px] leading-[1.6] mt-2 text-[#374151]">
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
  );
}

function OpportunitiesGrid({ items }: { items: Dict[] }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#ecfdf5] text-[14px]">
          ✨
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#047857]">
          Opportunities
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-[#6b7280] italic">No standout opportunities flagged today.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {items.map((item, i) => {
            const ticker = text(item.ticker);
            const kind = text(item.kind).replaceAll("_", " ");
            const headline = text(item.headline);
            const body = text(item.body);
            const market = item.market === "IN" ? "IN" : "US";
            const runway = extractRunwayPct(item, headline);
            return (
              <Link
                key={`opp-${i}`}
                href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                className="group flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {ticker && (
                      <StockLogo
                        ticker={ticker}
                        market={market}
                        size={28}
                      />
                    )}
                    <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
                      {ticker || "Opportunity"}
                    </span>
                  </div>
                  {kind && (
                    <span className="inline-flex items-center rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase text-[#065f46] shrink-0">
                      {kind}
                    </span>
                  )}
                </div>
                {runway !== null ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[32px] md:text-[36px] font-semibold tabular-nums leading-none text-[#047857]">
                      +{runway.toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                      runway
                    </span>
                  </div>
                ) : headline ? (
                  <p className="text-[14px] font-semibold text-[#111111] leading-snug">{headline}</p>
                ) : null}
                {body && (
                  <p className="text-[12px] text-[#6b7280] leading-snug line-clamp-3 mt-auto">
                    {body}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StocksToCheckOut({
  suggestions,
  tracked,
  isSubscribed,
}: {
  suggestions: Dict[];
  tracked: string[];
  isSubscribed: boolean;
}) {
  const list = suggestions.slice(0, 6);
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[14px]">
          🔍
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#1e3a8a]">
          Stocks to check out
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-[13px] text-[#6b7280] italic">No suggestions yet.</p>
      ) : (
        <ul className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
          {list.map((item, i) => {
            const ticker = text(item.ticker);
            const reason = text(item.reason);
            const why = text(item.why);
            const score = num(item.score ?? item.match_score);
            const market = item.market === "IN" ? "IN" : "US";
            const instrumentId = ticker ? `${market}_${ticker}` : "";
            const isTracked = instrumentId ? tracked.includes(instrumentId) : false;
            return (
              <li
                key={`sug-${i}`}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i > 0 ? "border-t border-[#f3f4f6]" : ""
                } hover:bg-[#fafafa] transition-colors`}
              >
                <Link
                  href={ticker ? `/stock/${encodeURIComponent(ticker)}` : "#"}
                  className="flex items-center gap-3 flex-1 min-w-0 group"
                >
                  {ticker && <StockLogo ticker={ticker} market={market} size={32} />}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
                      {ticker || "Suggestion"}
                    </span>
                    {reason && (
                      <span className="text-[11.5px] text-[#6b7280] truncate">{reason}</span>
                    )}
                    {why && (
                      <span className="text-[11px] text-[#9ca3af] truncate mt-0.5">{why}</span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  {score !== null && <ScoreStamp score={score} />}
                  {ticker && instrumentId && (
                    <TrackButton
                      ticker={ticker}
                      instrumentId={instrumentId}
                      isTracked={isTracked}
                      isSubscribed={isSubscribed}
                      variant="icon"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreStamp({ score }: { score: number }) {
  const ringColor =
    score >= 80 ? "#10b981" : score >= 60 ? "#0052ff" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center justify-center w-12 h-12 shrink-0 rounded-full border-2"
      style={{ borderColor: ringColor }}>
      <span className={`text-[14px] font-semibold tabular-nums leading-none ${scoreToneText(score)}`}>
        {Math.round(score)}
      </span>
      <span className="text-[8px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af] mt-0.5">
        Score
      </span>
    </div>
  );
}

// =============================================================================
// SHARED — SectionOpener
// =============================================================================

function SectionOpener({
  number,
  title,
  meta,
}: {
  number: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#ececea] pt-8">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af] tabular-nums">
          § {number}
        </span>
        <h2 className="text-[22px] md:text-[24px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
          {title}
        </h2>
      </div>
      {meta && (
        <span className="text-[12px] font-medium text-[#6b7280]">{meta}</span>
      )}
    </div>
  );
}

// =============================================================================
// EMPTY / FREE / UNSUBSCRIBED STATES
// =============================================================================

function BareHeader({ rowsCount, builtAt }: { rowsCount: number; builtAt?: string }) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] md:text-[34px] font-semibold text-[#111111] tracking-[-0.02em] leading-none">
          Radar
        </h1>
        <span className="text-[13px] text-[#6b7280]">
          {rowsCount} {rowsCount === 1 ? "ticker" : "tickers"} on Radar · refreshed{" "}
          {builtAt ? formatRelative(builtAt) : "never"}
        </span>
      </div>
    </header>
  );
}

const POPULAR_FALLBACK: Array<{ ticker: string; sector: string; reason: string }> = [
  { ticker: "AAPL", sector: "Consumer Electronics", reason: "Most-watched name on tikrr." },
  { ticker: "NVDA", sector: "Semiconductors", reason: "AI infra leader · high heat." },
  { ticker: "MSFT", sector: "Software", reason: "Quality compounder · steady." },
  { ticker: "META", sector: "Communication Services", reason: "Analyst runway +33%." },
  { ticker: "GOOGL", sector: "Communication Services", reason: "Cheap relative to peers." },
  { ticker: "AMZN", sector: "Consumer Cyclical", reason: "Cloud + retail compounder." },
];

function EmptyState({ suggestions = [] }: { suggestions?: Dict[] }) {
  const cards =
    suggestions.length > 0
      ? suggestions.slice(0, 6).map((s) => ({
          ticker: text(s.ticker),
          sector: text(s.sector),
          reason: text(s.reason) || text(s.why),
          score: num(s.score ?? s.match_score),
          market: (text(s.market) || "US") as "US" | "IN",
        }))
      : POPULAR_FALLBACK.map((s) => ({ ...s, score: null, market: "US" as const }));

  return (
    <section className="flex flex-col gap-8">
      <div className="rounded-3xl border border-[#e5e7eb] bg-white p-8 md:p-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 md:gap-5">
          <span
            aria-hidden
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[26px] shrink-0"
          >
            📡
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[22px] md:text-[24px] font-semibold text-[#0a0a0a] tracking-[-0.02em]">
              Build your Radar
            </h2>
            <p className="text-[14px] text-[#6b7280] leading-relaxed max-w-[560px]">
              Add stocks from any detail page and tikrr will deliver twice-daily AI briefs on
              what you hold and watch — directives, catalysts, alerts, all personalized.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="self-start inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform shrink-0"
        >
          Browse stocks →
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 border-t border-[#ececea] pt-6">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
              Suggested
            </span>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#0a0a0a]">
              Start with one of these
            </h3>
          </div>
          <span className="text-[12px] text-[#6b7280]">{cards.length} ideas</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => (
            <Link
              key={card.ticker}
              href={`/stock/${encodeURIComponent(card.ticker)}`}
              className="group flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
            >
              <StockLogo ticker={card.ticker} market={card.market} size={36} />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
                    {card.ticker}
                  </span>
                  {card.sector && (
                    <span className="text-[11px] text-[#9ca3af] truncate">{card.sector}</span>
                  )}
                </div>
                {card.reason && (
                  <span className="text-[11.5px] text-[#6b7280] leading-snug truncate">
                    {card.reason}
                  </span>
                )}
              </div>
              {typeof card.score === "number" && (
                <span
                  className={`shrink-0 text-[15px] font-semibold tabular-nums ${scoreToneText(card.score)}`}
                >
                  {Math.round(card.score)}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FreeRadarState({ rows, builtAt }: { rows: WatchlistRow[]; builtAt?: string }) {
  const holdings = rows
    .filter((row) => row.position_type === "holding")
    .sort(byAttention);
  const watching = rows
    .filter((row) => row.position_type !== "holding")
    .sort(byAttention);
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-6 md:px-20 lg:px-32 py-10 md:py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] md:text-[34px] font-semibold text-[#111111] tracking-[-0.02em] leading-none">
            Radar
          </h1>
          <p className="text-[13px] text-[#6b7280]">
            Free Radar: {rows.length}/3 stocks · refreshed{" "}
            {builtAt ? formatRelative(builtAt) : "never"}
          </p>
        </header>

        <section className="rounded-3xl border border-[#e5e7eb] bg-white p-4 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              Live Dashboard
            </h2>
            <Link
              href="/subscribe"
              className="inline-flex items-center justify-center h-[36px] rounded-full bg-[#111111] px-4 text-[12px] font-semibold text-white"
            >
              Upgrade For Full Radar
            </Link>
          </div>
          <p className="text-[12px] text-[#6b7280]">
            Track up to 3 stocks on free. Pro unlocks unlimited stocks, morning brief, event
            stream, and alerts.
          </p>
          <WatchlistTabs holdings={holdings} watching={watching} suggestions={[]} />
        </section>
      </div>
    </main>
  );
}

const STARTER_PICKS = [
  { ticker: "NVDA", market: "US", sector: "Semiconductors", reason: "AI infrastructure leader — most-tracked on tikrr." },
  { ticker: "AAPL", market: "US", sector: "Consumer Electronics", reason: "Durable free cash flow, highest retail ownership." },
  { ticker: "MSFT", market: "US", sector: "Software", reason: "Quality compounder with steady earnings growth." },
  { ticker: "META", market: "US", sector: "Comm. Services", reason: "Analyst runway +33% — strong momentum." },
  { ticker: "GOOGL", market: "US", sector: "Comm. Services", reason: "Cheap relative to peers on forward earnings." },
  { ticker: "AMZN", market: "US", sector: "Consumer Cyclical", reason: "Cloud + retail flywheel, underappreciated margins." },
];

function UnsubscribedState({ tracked }: { tracked: string[] }) {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-6 md:px-20 lg:px-32 py-10 md:py-12 flex flex-col gap-10">

        {/* Header */}
        <header className="flex flex-col gap-2">
          <h1 className="text-[32px] md:text-[40px] font-semibold text-[#0a0a0a] tracking-[-0.03em] leading-none">
            Radar
          </h1>
          <p className="text-[14px] text-[#6b7280] leading-snug">
            Track up to 3 stocks free. Get AI directives, alerts, and daily briefings.
          </p>
        </header>

        {/* Start here — pick your first stocks */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#ecfdf5] text-[15px]">🚀</span>
            <div>
              <h2 className="text-[15px] font-semibold text-[#0a0a0a] tracking-[-0.01em]">Start your Radar</h2>
              <p className="text-[12px] text-[#6b7280]">Add up to 3 stocks free. tikrr tracks them daily and tells you what to do.</p>
            </div>
          </div>

          <ul className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
            {STARTER_PICKS.map((pick, i) => {
              const instrumentId = `${pick.market}_${pick.ticker}`;
              const isTracked = tracked.includes(instrumentId);
              return (
                <li
                  key={pick.ticker}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#fafafa] transition-colors ${i > 0 ? "border-t border-[#f3f4f6]" : ""}`}
                >
                  <Link
                    href={`/stock/${encodeURIComponent(pick.ticker)}`}
                    className="flex items-center gap-3 flex-1 min-w-0 group"
                  >
                    <StockLogo ticker={pick.ticker} market={pick.market as "US" | "IN"} size={36} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-[#0a0a0a] group-hover:text-[#0052ff] transition-colors">
                          {pick.ticker}
                        </span>
                        <span className="text-[11px] text-[#9ca3af]">{pick.sector}</span>
                      </div>
                      <span className="text-[12px] text-[#6b7280] truncate">{pick.reason}</span>
                    </div>
                  </Link>
                  <TrackButton
                    ticker={pick.ticker}
                    instrumentId={instrumentId}
                    isTracked={isTracked}
                    isSubscribed={false}
                    variant="icon"
                  />
                </li>
              );
            })}
          </ul>

          <p className="text-[11.5px] text-[#9ca3af] text-center">
            Or search for any stock using the search bar above.
          </p>
        </section>

        {/* Pro upsell — secondary, not the hero */}
        <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">Pro · $9/mo</span>
              <h3 className="text-[16px] font-semibold text-[#0a0a0a] tracking-[-0.01em]">
                Unlock the full Radar experience
              </h3>
            </div>
            <Link
              href="/subscribe"
              className="shrink-0 inline-flex items-center justify-center h-[36px] rounded-full bg-[#111111] px-5 text-[12px] font-semibold text-white hover:bg-black transition-colors"
            >
              See plans →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FeatureCard emoji="🎯" iconBg="#ecfdf5" title="AI briefs" body="Buy / hold / sell directive for every stock you track, every morning." />
            <FeatureCard emoji="⚡" iconBg="#fef3c7" title="Cross-Radar read" body="Daily portfolio-level themes, risks, and opportunities." />
            <FeatureCard emoji="🔔" iconBg="#fef2f2" title="Alerts" body="Earnings, RSI extremes, 52-week levels — when they fire." />
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

// =============================================================================
// DATA HELPERS
// =============================================================================

type PillarAverages = {
  overall: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  momentum: number | null;
};

function computePillarAverages(rows: WatchlistRow[]): PillarAverages {
  const keys = ["overall", "valuation", "growth", "quality", "momentum"] as const;
  const out: PillarAverages = {
    overall: null,
    valuation: null,
    growth: null,
    quality: null,
    momentum: null,
  };
  for (const key of keys) {
    const values: number[] = [];
    for (const r of rows) {
      const v = r.scores?.[key];
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
    out[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return out;
}

function rowDirective(row: WatchlistRow): Directive | null {
  const d = row.ai_directive;
  if (!d) return null;
  const textVal = (d.text || row.ai_directive_text || "").trim();
  if (!textVal) return null;
  return {
    text: textVal,
    stance: (d.stance ?? "watch") as Directive["stance"],
    trigger_type: (d.trigger_type ?? "none") as Directive["trigger_type"],
    trigger_value: d.trigger_value,
    rationale: (d.rationale || row.ai_directive_rationale || "").trim() || undefined,
    confidence: d.confidence as Directive["confidence"],
  };
}

const STANCE_WEIGHT: Record<string, number> = {
  accumulate: 3,
  trim: 3,
  avoid: 3,
  watch: 2,
  hold: 1,
};
const CONFIDENCE_WEIGHT: Record<string, number> = { high: 3, med: 2, low: 1 };

function directiveUrgency(row: WatchlistRow, directive: Directive): number {
  const stance = STANCE_WEIGHT[directive.stance ?? "hold"] ?? 1;
  const conf = CONFIDENCE_WEIGHT[directive.confidence ?? "low"] ?? 1;
  const move = Math.abs(row.day_change_pct ?? 0);
  const score = typeof row.scores?.overall === "number" ? Math.abs(row.scores.overall - 50) / 10 : 0;
  // holdings rank above watchlist on a tie
  const positionBoost = row.position_type === "holding" ? 0.5 : 0;
  return stance * 10 + conf * 5 + Math.min(move, 10) + score + positionBoost;
}

function radarSignalCount(row: WatchlistRow): number {
  let n = 0;
  const tech = row.technicals as Dict | undefined;
  const rsiBlock = (tech?.rsi_14 as Dict | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  if ((rsi !== null && (rsi >= 70 || rsi <= 30)) || rsiBlock.state) n++;
  for (const c of (row.catalysts ?? []).slice(0, 2)) {
    const cat = c as Dict;
    if (text(cat.title ?? cat.kind)) n++;
  }
  n += row.alerts.length;
  return n;
}

function byAttention(a: WatchlistRow, b: WatchlistRow): number {
  const d = radarSignalCount(b) - radarSignalCount(a);
  if (d !== 0) return d;
  return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
}

function buildUpNext(rows: WatchlistRow[]): UpNextItem[] {
  const out: UpNextItem[] = [];
  for (const r of rows) {
    for (const c of (r.catalysts ?? []) as Dict[]) {
      const title = text(c.title ?? c.kind);
      if (!title) continue;
      const window = text(c.window) || text(c.date_label) || "soon";
      const urgency = text(c.urgency).toLowerCase() as UpNextItem["urgency"];
      out.push({ ticker: r.ticker, title, window, urgency });
    }
  }
  // sort by urgency, holdings first implicitly via input order
  const urgencyRank: Record<string, number> = { high: 3, med: 2, low: 1, "": 0 };
  out.sort((a, b) => (urgencyRank[b.urgency] ?? 0) - (urgencyRank[a.urgency] ?? 0));
  return out.slice(0, 10);
}

type FlatAlert = {
  ticker: string;
  kind: string;
  message: string;
  tone: "bull" | "bear" | "neutral";
};

function flattenAlerts(rows: WatchlistRow[]): FlatAlert[] {
  const flat: FlatAlert[] = [];
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
      const tone: FlatAlert["tone"] =
        kind.includes("bearish") || kind.includes("overbought") || kind.includes("52w_low")
          ? "bear"
          : kind.includes("bullish") || kind.includes("oversold")
          ? "bull"
          : "neutral";
      flat.push({ ticker: row.ticker, kind, message, tone });
    }
  }
  return flat;
}

type ActivityEvent = {
  sentence: string;
  event_type: string;
  scope: string;
  direction: string;
  symbol: string;
};

function buildActivityEvents(
  eventRadar: Dict[],
  brief: WatchlistBrief | null,
): ActivityEvent[] {
  const priorityKinds = new Set([
    "conviction_delta",
    "target_delta",
    "technical_extreme",
    "large_move",
    "portfolio_risk",
    "upcoming_event",
    "analyst_runway",
    "new_tracking",
  ]);
  const rawFeed =
    eventRadar.length > 0
      ? eventRadar
          .filter((event) => {
            const kind = text(event.kind).toLowerCase();
            const urgency = num(event.urgency) ?? 0;
            if (priorityKinds.has(kind)) return true;
            if (kind === "news_velocity") return urgency >= 78;
            return false;
          })
          .sort((a, b) => (num(b.urgency) ?? 0) - (num(a.urgency) ?? 0))
          .slice(0, 12)
      : [];

  if (rawFeed.length > 0) {
    return rawFeed.map((event) => {
      const title = text(event.title);
      const body = text(event.body);
      const sentence = [title, body].filter(Boolean).join(" · ") || "Tracked-stock update.";
      const scopeGuess = text(event.scope) || (text(event.ticker) ? "stock" : "market");
      return {
        sentence,
        event_type: text(event.kind) || "event",
        direction: text(event.tone) || text(event.direction) || "neutral",
        symbol: text(event.ticker) || text(event.symbol),
        scope: scopeGuess,
      };
    });
  }
  return (brief?.essential_events ?? []).slice(0, 12).map((item) => ({
    sentence: item.sentence,
    event_type: item.event_type,
    direction: item.direction,
    symbol: item.symbol,
    scope: item.scope,
  }));
}

function buildChangesData(changes: Dict) {
  const hasPrevious = Boolean(changes.has_previous);
  const changedCount = num(changes.changed_count) ?? 0;
  const scoreChanges = asArray(changes.score_changes).map((item) => ({
    ticker: text(item.ticker),
    sentence: text(item.sentence),
    delta: num(item.delta),
  }));
  const newTickers = Array.isArray(changes.new_tickers)
    ? changes.new_tickers.map((item) => String(item)).filter(Boolean)
    : [];
  return {
    summary: text(changes.summary),
    hasPrevious,
    changedCount,
    scoreChanges,
    newTickers,
  };
}

function extractRunwayPct(item: Dict, headline: string): number | null {
  const direct = num(item.target_runway_pct ?? item.runway_pct ?? item.upside_pct);
  if (direct !== null) return direct;
  // try to parse from headline like "PLTR has +40.0% target runway"
  const match = headline.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const v = Number(match[1]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

// -----------------------------------------------------------------------------
// formatting + tone helpers
// -----------------------------------------------------------------------------

function asDict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray(value: unknown): Dict[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Dict => !!item && typeof item === "object" && !Array.isArray(item),
      )
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

function verdictLabel(score: number | null): string {
  if (score === null) return "Awaiting data";
  if (score >= 80) return "Strong tilt";
  if (score >= 60) return "Solid tilt";
  if (score >= 40) return "Mixed";
  return "Weak tilt";
}

function severityTone(severity: string): {
  bg: string;
  fg: string;
  bar: string;
  chipBg: string;
  chipFg: string;
} {
  if (severity === "high")
    return {
      bg: "#fef2f2",
      fg: "#7f1d1d",
      bar: "#dc2626",
      chipBg: "#dc2626",
      chipFg: "#ffffff",
    };
  if (severity === "medium" || severity === "med")
    return {
      bg: "#fffbeb",
      fg: "#78350f",
      bar: "#d97706",
      chipBg: "#b45309",
      chipFg: "#ffffff",
    };
  if (severity === "low")
    return {
      bg: "#f0fdf4",
      fg: "#14532d",
      bar: "#16a34a",
      chipBg: "#15803d",
      chipFg: "#ffffff",
    };
  return {
    bg: "#f3f4f6",
    fg: "#374151",
    bar: "#9ca3af",
    chipBg: "#6b7280",
    chipFg: "#ffffff",
  };
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
