"use client";

import { useState } from "react";
import Link from "next/link";
import { proCtaClassName } from "@/components/pro-cta";
import { ShouldIBuySearch } from "@/components/should-i-buy-search";
import { ShouldIBuyShare } from "@/components/should-i-buy-share";
import { StockLogo } from "@/components/stock-logo";
import type { SearchEntry } from "@/lib/search";
import type { VerdictApiResponse } from "@/lib/should-i-buy-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_TICKERS = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "AMD"];

const PILL =
  "rounded-full border border-oa-border bg-oa-card px-3.5 py-1.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:border-oa-fg/30 hover:text-oa-fg";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { text: string; label: string }> = {
    strong: { text: "var(--signal-bullish)", label: "Strong" },
    solid:  { text: "var(--signal-bullish)", label: "Solid" },
    mixed:  { text: "var(--signal-neutral)", label: "Mixed" },
    weak:   { text: "var(--signal-bearish)", label: "Weak" },
  };
  const s = map[verdict] ?? map["mixed"];
  return (
    <span
      className="inline-block rounded-full bg-oa-card px-2.5 py-0.5 text-[11px] font-medium"
      style={{ color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Demo stacked cards (shown before user picks a ticker)
// ---------------------------------------------------------------------------

type SampleCardProps = {
  ticker: string;
  name: string;
  verdict: string;
  score: number;
  bg: string;
  textColor: string;
  color: string;
  pillarScores: [number, number, number, number];
};

function SampleCard({ ticker, name, verdict, score, color, pillarScores }: SampleCardProps) {
  const pillars = [
    { label: "Val",    s: pillarScores[0] },
    { label: "Growth", s: pillarScores[1] },
    { label: "Qual",   s: pillarScores[2] },
    { label: "Mom",    s: pillarScores[3] },
  ];
  return (
    <div className="w-full overflow-hidden rounded-[22px] border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-5 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-oa-bg text-[13px] font-medium text-oa-fg">
          {ticker.slice(0, 2)}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-oa-fg">{ticker}</span>
          <span className="text-[11px] text-oa-muted-fg">{name}</span>
        </div>
        <div className="h-px w-full bg-oa-border" />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-oa-muted-fg">Signal</span>
          <span className="text-[15px] font-medium leading-tight tracking-tight" style={{ color }}>{verdict}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-oa-bg px-3 py-1">
          <span className="text-[16px] font-medium leading-none tabular-nums" style={{ color }}>{score}</span>
          <span className="text-[11px] tabular-nums text-oa-muted-fg">/100</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 bg-oa-bg px-4 py-3">
        {pillars.map(({ label, s }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-[36px] shrink-0 text-[10px] font-medium text-oa-muted-fg">{label}</span>
            <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-oa-card">
              <div className="h-full rounded-full bg-oa-primary" style={{ width: `${s}%` }} />
            </div>
            <span className="w-[20px] shrink-0 text-right text-[10px] font-medium tabular-nums text-oa-fg">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoPanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
      <p className="text-[13px] font-medium text-oa-muted-fg">‹ Pick a ticker to see its signal</p>
      <div className="relative h-[500px] w-full max-w-[300px]">
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotate(-5deg) translateY(24px)", opacity: 0.5 }}>
          <SampleCard ticker="TSLA" name="Tesla, Inc." verdict="Hold / watch" score={51} bg="#fef3c7" textColor="#92400e" color="#f59e0b" pillarScores={[38, 52, 58, 44]} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotate(3deg) translateY(8px)", opacity: 0.75 }}>
          <SampleCard ticker="META" name="Meta Platforms" verdict="Buy signal" score={68} bg="#d1fae5" textColor="#065f46" color="#10b981" pillarScores={[55, 68, 74, 65]} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotate(-1deg)" }}>
          <SampleCard ticker="NVDA" name="NVIDIA Corp." verdict="Strong buy signal" score={84} bg="#ecfdf5" textColor="#065f46" color="#10b981" pillarScores={[48, 78, 83, 91]} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingPanel({ ticker }: { ticker: string }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-[28px] shadow-[0_16px_56px_rgba(0,0,0,0.10)]">
      <div className="flex flex-col items-center gap-5 bg-oa-bg px-8 pb-8 pt-9">
        <div className="flex items-center gap-3 self-stretch">
          <div className="size-12 shrink-0 rounded-xl border border-oa-border bg-oa-card" />
          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-32 rounded-full border border-oa-border bg-oa-card" />
            <div className="h-2.5 w-24 rounded-full border border-oa-border bg-oa-card" />
          </div>
        </div>
        <div className="h-px w-full bg-oa-border" />
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-56 rounded-full border border-oa-border bg-oa-card" />
          <div className="h-8 w-28 rounded-full border border-oa-border bg-oa-card" />
        </div>
      </div>
      <div className="flex flex-col gap-4 bg-oa-card px-6 pb-6 pt-6">
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[14px] bg-oa-bg px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-14 rounded-full border border-oa-border bg-oa-card" />
                <div className="h-4 w-10 rounded-full border border-oa-border bg-oa-card" />
              </div>
              <div className="h-5 w-10 rounded-full border border-oa-border bg-oa-card" />
              <div className="h-[3px] w-full rounded-full border border-oa-border bg-oa-card" />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-oa-muted-fg">Scoring {ticker}…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panels
// ---------------------------------------------------------------------------

function NoCoveragePanel({ ticker, onReset }: { ticker: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[22px] border border-oa-border bg-oa-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex size-14 items-center justify-center rounded-full bg-oa-bg">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" className="text-oa-muted-fg" />
          <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-oa-muted-fg" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[17px] font-medium tracking-tight text-oa-fg">No data for {ticker}</h3>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-oa-muted-fg">
          This ticker isn&apos;t in our coverage universe yet.
        </p>
      </div>
      <button
        onClick={onReset}
        className="inline-flex h-9 items-center rounded-full border border-oa-border bg-oa-bg px-5 text-[13px] font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
      >
        Try another ticker
      </button>
    </div>
  );
}

function PriceOnlyPanel({ data, onReset }: { data: Extract<VerdictApiResponse, { state: "price_only" }>; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[22px] border border-oa-border bg-oa-card p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <StockLogo ticker={data.ticker} logoUrl={data.logo_url} size={56} market="US" />
      <div className="flex flex-col gap-1">
        <h3 className="text-[17px] font-medium tracking-tight text-oa-fg">{data.name}</h3>
        <div className="flex items-center justify-center gap-2">
          <span className="text-[15px] font-medium tabular-nums text-oa-fg">{data.priceStr}</span>
          {data.priceChangeStr && (
            <span className="text-[13px] font-medium tabular-nums" style={{ color: data.priceChangeStr.startsWith("+") ? "#059669" : "#dc2626" }}>
              {data.priceChangeStr}
            </span>
          )}
        </div>
      </div>
      <div className="max-w-[300px] rounded-[14px] bg-oa-bg px-4 py-3 text-[13px] leading-relaxed text-oa-muted-fg">
        We have price data but our full scoring model is still being built for this stock.
      </div>
      <button onClick={onReset} className="group inline-flex items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg">
        <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> Try another ticker
      </button>
    </div>
  );
}

function FullVerdictPanel({
  data,
  onReset,
  isSubscribed,
}: {
  data: Extract<VerdictApiResponse, { state: "full" }>;
  onReset: () => void;
  isSubscribed: boolean;
}) {
  const { ticker, stock, verdict, pillars, rsi, overall } = data;
  const pillarList = [
    { label: "Valuation", p: pillars.valuation },
    { label: "Growth",    p: pillars.growth },
    { label: "Quality",   p: pillars.quality },
    { label: "Momentum",  p: pillars.momentum },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* The card */}
      <div id="should-i-buy-card" className="overflow-hidden rounded-[28px] shadow-[0_16px_56px_rgba(0,0,0,0.12)]">

        {/* Top */}
        <div className="flex flex-col items-center gap-5 bg-oa-bg px-8 pb-8 pt-9 text-center">
          <div className="flex items-center gap-3 text-left">
            <StockLogo ticker={ticker} logoUrl={stock.logo_url} size={48} market="US" />
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-medium leading-tight tracking-tight text-oa-fg">
                {stock.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="oa-mono text-xs font-medium text-oa-muted-fg">{ticker}</span>
                <span className="h-3 w-px bg-oa-border" />
                <span className="text-[13px] font-medium tabular-nums text-oa-fg">{stock.priceStr}</span>
                {stock.priceChangeStr && (
                  <span className="text-xs font-medium tabular-nums" style={{ color: (stock.priceChange ?? 0) >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                    {stock.priceChangeStr}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-oa-border" />

          <div className="flex flex-col items-center gap-2">
            <h2 className="text-[26px] font-medium leading-[1.1] tracking-tight text-oa-fg md:text-[30px]">
              {verdict.level}
            </h2>
            <div data-score-pill className="flex items-center gap-1 rounded-full bg-oa-card px-3.5 py-1.5">
              <span className="text-xl font-medium leading-none tracking-tight tabular-nums" style={{ color: verdict.color }}>{overall.score}</span>
              <span className="text-xs font-medium tabular-nums text-oa-muted-fg">/100</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex flex-col gap-5 bg-oa-card px-6 pb-5 pt-6">
          <div className="h-px bg-oa-border" />

          {isSubscribed ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {pillarList.map(({ label, p }) => {
                  const barColor = p.score >= 60 ? "var(--signal-bullish)" : p.score >= 40 ? "var(--signal-neutral)" : "var(--signal-bearish)";
                  return (
                    <div key={label} className="flex flex-col gap-1.5 rounded-[14px] bg-oa-bg px-3 py-2.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-oa-muted-fg">{label}</span>
                        <VerdictBadge verdict={p.verdict} />
                      </div>
                      <span className="text-lg font-medium leading-none tabular-nums" style={{ color: barColor }}>{p.score}</span>
                      <div className="h-[3px] overflow-hidden rounded-full border border-oa-border bg-oa-card">
                        <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {typeof rsi === "number" && (rsi >= 70 || rsi <= 30) && (
                <>
                  <div className="h-px bg-oa-border" />
                  <div className="flex items-center justify-between gap-2 rounded-[14px] bg-oa-bg px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium tabular-nums text-oa-fg">RSI {rsi.toFixed(1)}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: rsi >= 70 ? "var(--signal-bearish)" : "var(--signal-bullish)" }}
                      >
                        {rsi >= 70 ? "Overbought" : "Oversold"}
                      </span>
                    </div>
                    <p className="text-right text-[11px] text-oa-muted-fg">
                      {rsi >= 70 ? "Pullback risk" : "Bounce zone"}
                    </p>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="rounded-[14px] border border-oa-border bg-oa-bg px-4 py-3 text-center">
              <p className="text-[13px] font-medium text-oa-fg">Free shows verdict + score.</p>
              <p className="mt-1 text-xs text-oa-muted-fg">Pro unlocks pillar breakdown, reasons, and RSI context.</p>
              <Link href="/subscribe" className={`mt-3 ${proCtaClassName({ size: "sm", className: "h-[34px] px-4 text-[12px]" })}`}>
                Unlock Pro
              </Link>
            </div>
          )}

          {/* Action row */}
          <div data-screenshot-exclude className="flex items-center justify-center gap-10 pt-1">
            <button onClick={onReset} className="group flex flex-col items-center gap-1.5">
              <div className="flex size-[52px] items-center justify-center rounded-full border border-oa-border bg-oa-card transition-all group-hover:border-oa-fg/30 group-hover:shadow-md">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-oa-muted-fg transition-colors group-hover:text-oa-fg" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-oa-muted-fg transition-colors group-hover:text-oa-fg">Try another</span>
            </button>

            <Link href={`/stock/${ticker}`} className="group flex flex-col items-center gap-1.5">
              <div className="flex size-[64px] items-center justify-center rounded-full bg-oa-primary shadow-lg transition-all group-hover:shadow-xl">
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <path d="M13 22.5C13 22.5 3.5 17 3.5 10C3.5 7.1 5.85 4.8 8.75 4.8C10.4 4.8 11.9 5.65 12.85 6.95C12.95 7.08 13.05 7.08 13.15 6.95C14.1 5.65 15.6 4.8 17.25 4.8C20.15 4.8 22.5 7.1 22.5 10C22.5 17 13 22.5 13 22.5Z" fill="white" />
                </svg>
              </div>
              <span className="text-[11px] font-medium text-oa-primary">Deep dive</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Share */}
      <div className="flex flex-col gap-2">
        <p className="oa-mono text-center text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Share this signal</p>
        <ShouldIBuyShare ticker={ticker} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main interactive component
// ---------------------------------------------------------------------------

type PanelState =
  | { phase: "demo" }
  | { phase: "loading"; ticker: string }
  | { phase: "result"; data: VerdictApiResponse };

export function ShouldIBuyInteractive({ searchIndex, isSubscribed }: { searchIndex: SearchEntry[]; isSubscribed: boolean }) {
  const [panel, setPanel] = useState<PanelState>({ phase: "demo" });

  async function handleSelect(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setPanel({ phase: "loading", ticker: t });
    try {
      const res = await fetch(`/api/should-i-buy-verdict/${encodeURIComponent(t)}`);
      const data: VerdictApiResponse = await res.json();
      setPanel({ phase: "result", data });
    } catch {
      setPanel({ phase: "result", data: { state: "no_coverage" } });
    }
  }

  function handleReset() {
    setPanel({ phase: "demo" });
  }

  return (
    <div className="mx-auto w-full max-w-[76rem] px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:items-center lg:gap-16">

        {/* LEFT: static content + search */}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-7">
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-oa-muted-fg">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Free tool
          </span>

          <div className="flex flex-col gap-4">
            <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.5rem] leading-[1.06] sm:text-6xl sm:leading-[1.04]">
              Should you buy it?
            </h1>
            <p className="max-w-[420px] text-[15px] leading-relaxed text-oa-muted-fg sm:text-base">
              Enter any ticker and we score it across valuation, growth, quality, and momentum, then give you a clear buy, hold, or avoid verdict.
            </p>
          </div>

          <div className="w-full max-w-md">
            <ShouldIBuySearch searchIndex={searchIndex} onSelect={handleSelect} />
          </div>

          {/* Popular tickers */}
          <div className="flex flex-wrap gap-2">
            {POPULAR_TICKERS.map((t) => (
              <button key={t} onClick={() => handleSelect(t)} className={`oa-mono ${PILL}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Verdict legend */}
          <div className="flex flex-col gap-2">
            <p className="oa-mono text-[10px] uppercase tracking-[0.12em] text-oa-muted-fg">Possible signals</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Strong buy", dot: "#10b981" },
                { label: "Buy signal", dot: "#34d399" },
                { label: "Hold",       dot: "#f59e0b" },
                { label: "Cautious",   dot: "#f97316" },
                { label: "Avoid",      dot: "#ef4444" },
              ].map(({ label, dot }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-oa-accent px-3 py-1 text-[11px] font-medium text-oa-fg">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: panel */}
        <div className="flex w-full min-h-[620px] shrink-0 flex-col lg:w-[400px]">
          {panel.phase === "demo" && <DemoPanel />}
          {panel.phase === "loading" && <LoadingPanel ticker={panel.ticker} />}
          {panel.phase === "result" && panel.data.state === "no_coverage" && (
            <NoCoveragePanel ticker={"that ticker"} onReset={handleReset} />
          )}
          {panel.phase === "result" && panel.data.state === "price_only" && (
            <PriceOnlyPanel data={panel.data} onReset={handleReset} />
          )}
          {panel.phase === "result" && panel.data.state === "full" && (
            <FullVerdictPanel data={panel.data} onReset={handleReset} isSubscribed={isSubscribed} />
          )}
        </div>
      </div>
    </div>
  );
}
