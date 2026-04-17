import Link from "next/link";

import { BackToMarkets } from "@/components/back-to-markets";
import { currencySymbolFromMarketCode } from "@/lib/currency-symbol";
import { InstrumentView } from "@/lib/view-contracts";

function sentimentColor(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("bull") || n.includes("positive")) return "text-[#2D6A4F]";
  if (n.includes("bear") || n.includes("weak") || n.includes("cautious") || n.includes("negative")) return "text-[#9B2226]";
  return "text-[#6A6A6A]";
}

function sentimentDot(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("bull") || n.includes("positive")) return "bg-[#2D6A4F]";
  if (n.includes("bear") || n.includes("weak") || n.includes("cautious") || n.includes("negative")) return "bg-[#9B2226]";
  return "bg-[#1A1A1A]/20";
}

function fmtR(value: number): string { return !Number.isFinite(value) || value <= 0 ? "" : value.toFixed(2); }
function fmtP(value: number): string { return !Number.isFinite(value) || value <= 0 ? "" : `${(value * 100).toFixed(2)}%`; }

export function Instrument({ view }: { view: InstrumentView }) {
  const sym = currencySymbolFromMarketCode(view.market);
  const fmt = (value: number) => `${sym}${value.toFixed(2)}`;
  const fmtT = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value >= 1_000_000_000_000) return `${sym}${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (value >= 1_000_000_000) return `${sym}${(value / 1_000_000_000).toFixed(1)}B`;
    return `${sym}${(value / 1_000_000).toFixed(0)}M`;
  };

  const ac = view.analyst_consensus;
  const total = (ac?.buy ?? 0) + (ac?.hold ?? 0) + (ac?.sell ?? 0) || 1;
  const buyPct = ((ac?.buy ?? 0) / total) * 100;
  const holdPct = ((ac?.hold ?? 0) / total) * 100;
  const sellPct = ((ac?.sell ?? 0) / total) * 100;
  const up = view.price_snapshot.day_change_pct >= 0;

  const stats = [
    { l: "Mkt Cap", v: fmtT(view.fundamentals.market_cap) },
    { l: "P/E", v: fmtR(view.fundamentals.pe_ttm) },
    { l: "Yield", v: fmtP(view.fundamentals.dividend_yield) },
  ].filter((s) => s.v !== "");

  return (
    <div className="mx-auto max-w-3xl">
      <BackToMarkets />

      {/* Hero identity */}
      <header className="mb-10">
        <div className="mb-6">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] uppercase tracking-[0.3em]">
            <span className="font-bold text-[#D4AF37]">{view.instrument.ticker}</span>
            <span className="text-[#1A1A1A]/20">·</span>
            <span className="text-[#1A1A1A]/40">{view.instrument.sector}</span>
            {view.instrument.index_memberships.length > 0 && (
              <>
                <span className="text-[#1A1A1A]/20">·</span>
                <span className="text-[#1A1A1A]/40">{view.instrument.index_memberships.join(", ")}</span>
              </>
            )}
          </div>
          <h1 className="font-headline text-4xl italic leading-[1.1] text-[#1A1A1A] sm:text-5xl">{view.instrument.name}</h1>
        </div>

        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <p className="font-mono text-5xl tabular-nums leading-none text-[#1A1A1A]">
              {fmt(view.price_snapshot.current)}
            </p>
            <div className={`mt-2 flex items-center gap-1.5 text-sm font-bold ${up ? "text-[#2D6A4F]" : "text-[#9B2226]"}`}>
              <span className="font-mono tabular-nums">
                {up ? "+" : ""}{view.price_snapshot.day_change_pct.toFixed(2)}%
              </span>
              {view.price_snapshot.day_change_abs != null && (
                <span className="text-xs font-normal font-mono tabular-nums text-[#1A1A1A]/30">
                  ({up ? "+" : ""}
                  {fmt(view.price_snapshot.day_change_abs)})
                </span>
              )}
            </div>
          </div>
          {stats.length > 0 && (
            <div className="ml-auto flex items-center gap-8">
              {stats.map((s) => (
                <div key={s.l} className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">{s.l}</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-[#1A1A1A]">{s.v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="mb-10 h-px bg-[#1A1A1A]" />

      {/* AI Intelligence */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6 border-b border-[#1A1A1A]/10 pb-4">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/40">AI Intelligence</h2>
          <span className="ml-auto text-[10px] font-mono tabular-nums text-[#1A1A1A]/20">
            {view.intelligence_summary.key_points.length} signals
          </span>
        </div>

        <p className="text-[15px] leading-[1.9] text-[#1A1A1A]">
          {view.intelligence_summary.body}
        </p>

        {view.intelligence_summary.key_points.length > 0 && (
          <ul className="mt-6 space-y-2.5 border-l-2 border-[#D4AF37]/30 pl-5">
            {view.intelligence_summary.key_points.map((point, i) => (
              <li key={i} className="text-sm text-[#1A1A1A]/60 leading-relaxed relative">
                <span className="absolute -left-[25px] w-4 text-right text-[10px] font-mono text-[#1A1A1A]/20 tabular-nums top-0.5">
                  {i + 1}
                </span>
                {point}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-8 mt-8">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 w-1.5 bg-[#2D6A4F]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#2D6A4F]">Catalyst</p>
            </div>
            <p className="text-sm text-[#1A1A1A]/60 leading-relaxed">{view.intelligence_summary.catalyst}</p>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 w-1.5 bg-[#9B2226]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#9B2226]">Risk</p>
            </div>
            <p className="text-sm text-[#1A1A1A]/60 leading-relaxed">{view.intelligence_summary.risk}</p>
          </div>
        </div>
      </section>

      {(view.market_context?.today_brief || view.sector_context?.today_brief) && (
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {view.sector_context?.today_brief && (
              <div className="border border-[#1A1A1A]/10 bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 bg-[#D4AF37]" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">Sector context</p>
                </div>
                <p className="text-sm text-[#1A1A1A]/80 leading-relaxed">{view.sector_context.today_brief}</p>
                {view.sector_context.week_brief && (
                  <p className="text-xs text-[#1A1A1A]/40 leading-relaxed mt-3">{view.sector_context.week_brief}</p>
                )}
              </div>
            )}
            {view.market_context?.today_brief && (
              <div className="border border-[#1A1A1A]/10 bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 bg-[#1A1A1A]/30" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">Market context</p>
                </div>
                <p className="text-sm text-[#1A1A1A]/80 leading-relaxed">{view.market_context.today_brief}</p>
                {view.market_context.week_brief && (
                  <p className="text-xs text-[#1A1A1A]/40 leading-relaxed mt-3">{view.market_context.week_brief}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Signals row */}
      <section className="mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
          {/* Momentum */}
          <div className="border border-[#1A1A1A]/10 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">Momentum · RSI(14)</p>
              <span
                className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  view.momentum_signal.label.toLowerCase().includes("bull")
                    ? "border-[#2D6A4F] text-[#2D6A4F]"
                    : view.momentum_signal.label.toLowerCase().includes("bear")
                      ? "border-[#9B2226] text-[#9B2226]"
                      : "border-[#1A1A1A]/20 text-[#6A6A6A]"
                }`}
              >
                {view.momentum_signal.label}
              </span>
            </div>
            <div className="flex items-end gap-2 mb-4">
              <span className="font-mono text-4xl tabular-nums text-[#1A1A1A] leading-none">
                {view.momentum_signal.rsi_14.toFixed(1)}
              </span>
              <span className="text-xs text-[#1A1A1A]/30 mb-1">/ 100</span>
            </div>
            <div className="relative w-full h-2 bg-[#1A1A1A]/5 overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#9B2226] via-amber-400 to-[#2D6A4F]"
                style={{ width: `${view.momentum_signal.score}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#1A1A1A]/30 mt-1.5 font-bold uppercase tracking-wider">
              <span>Oversold</span>
              <span>Overbought</span>
            </div>
          </div>

          {/* Sentiment */}
          <div className="border border-[#1A1A1A]/10 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">Sentiment</p>
              <span
                className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  view.sentiment_breakdown.overall_label.toLowerCase().includes("bull")
                    ? "border-[#2D6A4F] text-[#2D6A4F]"
                    : view.sentiment_breakdown.overall_label.toLowerCase().includes("bear")
                      ? "border-[#9B2226] text-[#9B2226]"
                      : "border-[#1A1A1A]/20 text-[#6A6A6A]"
                }`}
              >
                {view.sentiment_breakdown.overall_label}
              </span>
            </div>
            <div className="space-y-4">
              {view.sentiment_breakdown.lanes.map((lane) => (
                <div key={lane.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#1A1A1A]/50 font-medium">{lane.label}</span>
                    <span
                      className={`font-bold font-mono tabular-nums ${lane.positive_pct >= 70 ? "text-[#2D6A4F]" : lane.positive_pct < 40 ? "text-[#9B2226]" : "text-[#6A6A6A]"}`}
                    >
                      {lane.positive_pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1A1A1A]/5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        lane.positive_pct >= 70 ? "bg-[#2D6A4F]" : lane.positive_pct >= 40 ? "bg-[#D4AF37]" : "bg-[#9B2226]"
                      }`}
                      style={{ width: `${lane.positive_pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {ac && (
          <div className="mt-0 border border-[#1A1A1A]/10 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">Analyst consensus</p>
              <span className="text-sm font-bold text-[#1A1A1A]/50 font-mono tabular-nums">Target {fmt(ac.target_price)}</span>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <span className="font-headline text-3xl italic text-[#1A1A1A]">{ac.label}</span>
              <div className="flex-1 h-2 overflow-hidden flex">
                <div className="h-full bg-[#2D6A4F] transition-all" style={{ width: `${buyPct}%` }} />
                <div className="h-full bg-[#1A1A1A]/10 transition-all" style={{ width: `${holdPct}%` }} />
                <div className="h-full bg-[#9B2226] transition-all" style={{ width: `${sellPct}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#2D6A4F]">Buy {ac.buy}</span>
              <span className="text-[#6A6A6A]">Hold {ac.hold}</span>
              <span className="text-[#9B2226]">Sell {ac.sell}</span>
            </div>
          </div>
        )}
      </section>

      {/* Related */}
      {view.related_tickers.length > 0 && (
        <section className="mb-12">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30 mb-4">Related</h2>
          <div className="flex flex-wrap gap-2">
            {view.related_tickers.map((t) => (
              <Link
                key={t.instrument_id}
                href={`/instrument/${t.instrument_id}`}
                className="group inline-flex items-center gap-3 border border-[#1A1A1A]/10 bg-white px-4 py-2.5 text-xs transition hover:border-[#D4AF37]"
              >
                <span className="font-bold text-[#1A1A1A]">{t.name}</span>
                <span className="font-mono tabular-nums text-[#1A1A1A]/40">{fmt(t.price)}</span>
                <span className={`font-bold font-mono tabular-nums ${t.day_change_pct >= 0 ? "text-[#2D6A4F]" : "text-[#9B2226]"}`}>
                  {t.day_change_pct >= 0 ? "+" : ""}{t.day_change_pct.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* News */}
      {view.timeline.length > 0 && (
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-6 border-b border-[#1A1A1A]/10 pb-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30">Latest News</h2>
            <span className="text-[10px] text-[#1A1A1A]/20 font-mono tabular-nums">{view.timeline.length} articles</span>
          </div>
          <div className="space-y-6">
            {view.timeline.map((item) => (
              <article key={`${item.timestamp}-${item.title}`} className="group">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-1.5 h-1.5 ${sentimentDot(item.sentiment_label)}`} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1A1A1A]/40">{item.source_name}</span>
                  <span className="text-[10px] text-[#1A1A1A]/20">
                    {new Date(item.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
                    {" "}
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={`text-[10px] font-bold ml-auto ${sentimentColor(item.sentiment_label)}`}>
                    {item.sentiment_label}
                  </span>
                </div>
                <h3 className="mb-1 font-headline text-sm italic leading-snug text-[#1A1A1A] transition-colors group-hover:text-[#D4AF37]">
                  {item.title}
                </h3>
                <p className="text-xs text-[#1A1A1A]/40 leading-relaxed line-clamp-2">{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
