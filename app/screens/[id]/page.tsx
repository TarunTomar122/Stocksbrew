import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentMarket } from "@/lib/market";
import { getScreenById, type ScreenMatchRow } from "@/lib/screens";

type Props = {
  params: { id: string };
  searchParams: { market?: string };
};

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function fmtScore(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return Math.round(v).toString();
}

function extraMatchCell(row: ScreenMatchRow, screenId: string): string {
  if (screenId === "oversold_quality" && typeof row.rsi_14 === "number") {
    return `RSI ${row.rsi_14.toFixed(1)}`;
  }
  if (screenId === "near_52w_high" && typeof row.from_52w_high_pct === "number") {
    return `${fmtPct(row.from_52w_high_pct, 2)} from high`;
  }
  if (screenId === "smart_money" && typeof row.inst_own_pct === "number") {
    return `${row.inst_own_pct.toFixed(0)}% inst`;
  }
  if (screenId === "momentum_leaders" && row.above_200dma) {
    return "Above 200DMA";
  }
  if (typeof row.match_score === "number") {
    return `Match ${row.match_score.toFixed(1)}`;
  }
  return "";
}

export default async function ScreenDetailPage({ params, searchParams }: Props) {
  const market =
    searchParams.market === "IN" || searchParams.market === "US"
      ? (searchParams.market as "US" | "IN")
      : getCurrentMarket();

  const result = await getScreenById(market, params.id);
  if (!result) notFound();
  const { doc, screen } = result;

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-8 py-12 flex flex-col gap-6">
        <Link
          href="/"
          className="text-[11px] font-bold tracking-[0.15em] uppercase text-on-surface-variant hover:text-on-surface w-fit"
        >
          ← Back to dashboard
        </Link>

        <header className="flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-outline">
            Pre-built screen · {market} · {doc.universe_id}
          </span>
          <h1 className="text-[28px] font-bold text-on-surface leading-tight">
            {screen.title}
          </h1>
          <p className="text-[14px] text-on-surface-variant leading-relaxed max-w-2xl">
            {screen.tagline}
          </p>
          <p className="text-[12px] text-on-surface-variant leading-snug max-w-2xl">
            <span className="font-semibold text-on-surface">Rule:</span>{" "}
            {screen.hook}
          </p>
        </header>

        <section className="bg-surface-container-lowest brutalist-border">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.8fr] gap-3 px-4 py-3 text-[10px] font-bold tracking-[0.15em] uppercase text-outline border-b border-outline/40">
            <span>Ticker</span>
            <span className="hidden md:inline">Sector</span>
            <span className="text-right">Price</span>
            <span className="text-right">Day</span>
            <span className="text-right">Overall</span>
            <span className="text-right hidden md:inline">Val</span>
            <span className="text-right hidden md:inline">Gro</span>
            <span className="text-right">Detail</span>
          </div>
          {screen.matches.length === 0 ? (
            <div className="px-4 py-8 text-[12px] text-on-surface-variant italic text-center">
              No stocks match this screen right now. Check back tomorrow — screens
              refresh daily.
            </div>
          ) : (
            screen.matches.map((row) => {
              const change = row.day_change_pct;
              const changeClass =
                typeof change === "number"
                  ? change > 0
                    ? "text-signal-bullish"
                    : change < 0
                      ? "text-signal-bearish"
                      : "text-on-surface-variant"
                  : "text-on-surface-variant";
              return (
                <Link
                  key={row.instrument_id}
                  href={`/stock/${row.ticker}`}
                  className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.8fr] gap-3 px-4 py-3 items-center border-b border-outline/20 last:border-b-0 hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-on-surface tabular-nums">
                      {row.ticker}
                    </span>
                    <span className="text-[10px] text-on-surface-variant truncate">
                      {row.name ?? ""}
                    </span>
                  </div>
                  <span className="hidden md:inline text-[11px] text-on-surface-variant truncate">
                    {row.sector ?? "—"}
                  </span>
                  <span className="text-right text-[12px] text-on-surface tabular-nums">
                    {fmtPrice(row.price)}
                  </span>
                  <span className={`text-right text-[12px] tabular-nums ${changeClass}`}>
                    {fmtPct(change)}
                  </span>
                  <span className="text-right text-[12px] font-bold text-on-surface tabular-nums">
                    {fmtScore(row.overall_score)}
                  </span>
                  <span className="text-right hidden md:inline text-[11px] text-on-surface-variant tabular-nums">
                    {fmtScore(row.pillar_scores?.valuation)}
                  </span>
                  <span className="text-right hidden md:inline text-[11px] text-on-surface-variant tabular-nums">
                    {fmtScore(row.pillar_scores?.growth)}
                  </span>
                  <span className="text-right text-[10px] text-on-surface-variant tabular-nums">
                    {extraMatchCell(row, screen.id)}
                  </span>
                </Link>
              );
            })
          )}
        </section>

        <div className="bg-surface-container-low brutalist-border p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-outline">
              Want this screen in your inbox?
            </span>
            <span className="text-[13px] text-on-surface">
              Subscribers get daily updates on new matches, drop-offs, and watchlist
              alerts when a screen you follow changes.
            </span>
          </div>
          <Link
            href="/subscribe"
            className="bg-on-surface text-surface px-4 py-2 text-[11px] font-bold tracking-[0.15em] uppercase shrink-0 w-fit rounded-full"
          >
            Save this screen
          </Link>
        </div>
      </div>
    </main>
  );
}
