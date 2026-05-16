"use client";

import { useState } from "react";
import Link from "next/link";
import { ShouldIBuySearch } from "@/components/should-i-buy-search";
import { ShouldIBuyShare } from "@/components/should-i-buy-share";
import { StockLogo } from "@/components/stock-logo";
import type { SearchEntry } from "@/lib/search";
import type { VerdictApiResponse, PillarInfo } from "@/lib/should-i-buy-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_TICKERS = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "AMD"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    strong: { bg: "#ecfdf5", text: "#065f46", label: "Strong" },
    solid:  { bg: "#d1fae5", text: "#065f46", label: "Solid" },
    mixed:  { bg: "#fef3c7", text: "#92400e", label: "Mixed" },
    weak:   { bg: "#fef2f2", text: "#991b1b", label: "Weak" },
  };
  const s = map[verdict] ?? map["mixed"];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.text }}
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

function SampleCard({ ticker, name, verdict, score, bg, textColor, color, pillarScores }: SampleCardProps) {
  const pillars = [
    { label: "Val",    s: pillarScores[0] },
    { label: "Growth", s: pillarScores[1] },
    { label: "Qual",   s: pillarScores[2] },
    { label: "Mom",    s: pillarScores[3] },
  ];
  return (
    <div className="rounded-[20px] overflow-hidden w-full border border-black/5">
      <div className="px-5 pt-5 pb-4 flex flex-col items-center gap-3 text-center" style={{ background: bg }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: color + "22", color: textColor }}>
          {ticker.slice(0, 2)}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold" style={{ color: textColor }}>{ticker}</span>
          <span className="text-[11px]" style={{ color: textColor, opacity: 0.6 }}>{name}</span>
        </div>
        <div className="w-full h-px" style={{ background: color, opacity: 0.2 }} />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold tracking-[0.12em] uppercase" style={{ color: textColor, opacity: 0.55 }}>Signal</span>
          <span className="text-[15px] font-bold tracking-[-0.02em] leading-tight" style={{ color: textColor }}>{verdict}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full px-3 py-1" style={{ background: color + "22" }}>
          <span className="text-[16px] font-bold leading-none" style={{ color: textColor }}>{score}</span>
          <span className="text-[11px]" style={{ color: textColor, opacity: 0.5 }}>/100</span>
        </div>
      </div>
      <div className="bg-white px-4 py-3 flex flex-col gap-2">
        {pillars.map(({ label, s }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-[36px] shrink-0 text-[10px] font-medium text-[#9ca3af]">{label}</span>
            <div className="flex-1 h-[4px] rounded-full bg-[#f3f4f6] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s}%`, background: s >= 60 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444" }} />
            </div>
            <span className="w-[20px] shrink-0 text-right text-[10px] font-bold text-[#374151]">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoPanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-10">
      <p className="text-[13px] text-[#9ca3af] font-medium">← Pick a ticker to see its signal</p>
      <div className="relative w-full max-w-[300px] h-[500px]">
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
    <div className="rounded-[28px] overflow-hidden shadow-[0_16px_56px_rgba(0,0,0,0.10)] animate-pulse">
      {/* Colored top */}
      <div className="bg-[#f3f4f6] px-8 pt-9 pb-8 flex flex-col items-center gap-5">
        {/* Logo + name row */}
        <div className="flex items-center gap-3 self-stretch">
          <div className="w-12 h-12 rounded-xl bg-[#e5e7eb] shrink-0" />
          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-32 rounded-full bg-[#e5e7eb]" />
            <div className="h-2.5 w-24 rounded-full bg-[#e5e7eb]" />
          </div>
        </div>
        {/* Divider */}
        <div className="w-full h-px bg-[#e5e7eb]" />
        {/* Verdict text + score pill below */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-56 rounded-full bg-[#e5e7eb]" />
          <div className="h-8 w-28 rounded-full bg-[#e5e7eb]" />
        </div>
      </div>
      {/* White bottom */}
      <div className="bg-white px-6 pt-6 pb-6 flex flex-col gap-4">
        <div className="h-px bg-[#f3f4f6]" />
        {/* 2×2 pillar grid */}
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[10px] bg-[#f9fafb] px-3 py-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-14 rounded-full bg-[#e5e7eb]" />
                <div className="h-4 w-10 rounded-full bg-[#e5e7eb]" />
              </div>
              <div className="h-5 w-10 rounded-full bg-[#e5e7eb]" />
              <div className="h-[3px] w-full rounded-full bg-[#e5e7eb]" />
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[#9ca3af] text-center">Scoring {ticker}…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panels
// ---------------------------------------------------------------------------

function NoCoveragePanel({ ticker, onReset }: { ticker: string; onReset: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-[#f3f4f6] flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="#9ca3af" strokeWidth="1.5" />
          <path d="M12 8v4M12 16h.01" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[17px] font-bold text-[#111111]">No data for {ticker}</h3>
        <p className="text-[13px] text-[#6b7280] max-w-[280px]">
          This ticker isn't in our coverage universe yet.
        </p>
      </div>
      <button
        onClick={onReset}
        className="rounded-[10px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors"
      >
        Try another ticker
      </button>
    </div>
  );
}

function PriceOnlyPanel({ data, onReset }: { data: Extract<VerdictApiResponse, { state: "price_only" }>; onReset: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 flex flex-col items-center text-center gap-4">
      <StockLogo ticker={data.ticker} logoUrl={data.logo_url} size={56} market="US" />
      <div className="flex flex-col gap-1">
        <h3 className="text-[17px] font-bold text-[#111111]">{data.name}</h3>
        <div className="flex items-center justify-center gap-2">
          <span className="text-[15px] font-semibold text-[#111111]">{data.priceStr}</span>
          {data.priceChangeStr && (
            <span className="text-[13px] font-medium" style={{ color: data.priceChangeStr.startsWith("+") ? "#059669" : "#dc2626" }}>
              {data.priceChangeStr}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-[12px] bg-[#fef3c7] px-4 py-3 text-[13px] text-[#92400e] max-w-[300px] leading-[1.5]">
        We have price data but our full scoring model is still being built for this stock.
      </div>
      <button onClick={onReset} className="text-[13px] text-[#6b7280] hover:text-[#374151] transition-colors">
        ← Try another ticker
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
      <div id="should-i-buy-card" className="rounded-[28px] overflow-hidden shadow-[0_16px_56px_rgba(0,0,0,0.12)]">

        {/* Colored top */}
        <div className="px-8 pt-9 pb-8 flex flex-col items-center gap-5 text-center" style={{ background: verdict.bg }}>
          <div className="flex items-center gap-3 text-left">
            <StockLogo ticker={ticker} logoUrl={stock.logo_url} size={48} market="US" />
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-bold tracking-[-0.015em] leading-tight" style={{ color: verdict.textColor }}>
                {stock.name}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold" style={{ color: verdict.textColor, opacity: 0.55 }}>{ticker}</span>
                <span className="h-3 w-px" style={{ background: verdict.textColor, opacity: 0.2 }} />
                <span className="text-[13px] font-bold tabular-nums" style={{ color: verdict.textColor }}>{stock.priceStr}</span>
                {stock.priceChangeStr && (
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: (stock.priceChange ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
                    {stock.priceChangeStr}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="w-full h-px" style={{ background: verdict.color, opacity: 0.2 }} />

          <div className="flex flex-col items-center gap-2">
            <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em] leading-[1.1]" style={{ color: verdict.textColor }}>
              {verdict.level}
            </h2>
            <div data-score-pill className="flex items-center gap-1 rounded-full px-3.5 py-1.5" style={{ background: verdict.color + "22" }}>
              <span className="text-[20px] font-bold leading-none tracking-[-0.03em]" style={{ color: verdict.textColor }}>{overall.score}</span>
              <span className="text-[12px] font-medium" style={{ color: verdict.textColor, opacity: 0.55 }}>/ 100</span>
            </div>
          </div>
        </div>

        {/* White bottom */}
        <div className="bg-white px-6 pt-6 pb-5 flex flex-col gap-5">
          {/* Divider */}
          <div className="h-px bg-[#f3f4f6]" />

          {isSubscribed ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {pillarList.map(({ label, p }) => {
                  const barColor = p.score >= 60 ? "#10b981" : p.score >= 40 ? "#f59e0b" : "#ef4444";
                  return (
                    <div key={label} className="rounded-[10px] bg-[#f9fafb] px-3 py-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-medium text-[#9ca3af]">{label}</span>
                        <VerdictBadge verdict={p.verdict} />
                      </div>
                      <span className="text-[18px] font-bold tabular-nums leading-none" style={{ color: barColor }}>{p.score}</span>
                      <div className="h-[3px] rounded-full bg-[#e5e7eb] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {typeof rsi === "number" && (rsi >= 70 || rsi <= 30) && (
                <>
                  <div className="h-px bg-[#f3f4f6]" />
                  <div className="rounded-[10px] px-4 py-3.5 flex items-center justify-between gap-2" style={{ background: rsi >= 70 ? "#fef2f2" : "#ecfdf5" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: rsi >= 70 ? "#991b1b" : "#065f46" }}>RSI {rsi.toFixed(1)}</span>
                      <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ background: rsi >= 70 ? "#fecaca" : "#a7f3d0", color: rsi >= 70 ? "#991b1b" : "#065f46" }}>
                        {rsi >= 70 ? "Overbought" : "Oversold"}
                      </span>
                    </div>
                    <p className="text-[11px] text-right" style={{ color: rsi >= 70 ? "#991b1b" : "#065f46", opacity: 0.7 }}>
                      {rsi >= 70 ? "Pullback risk" : "Bounce zone"}
                    </p>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-center">
              <p className="text-[13px] font-semibold text-[#111111]">Free shows verdict + score.</p>
              <p className="text-[12px] text-[#6b7280] mt-1">Pro unlocks pillar breakdown, reasons, and RSI context.</p>
              <Link href="/subscribe" className="mt-3 inline-flex items-center justify-center h-[34px] rounded-full bg-[#111111] px-4 text-[12px] font-semibold text-white">
                Unlock Pro
              </Link>
            </div>
          )}

          {/* Action row */}
          <div data-screenshot-exclude className="flex items-center justify-center gap-10 pt-1">
            <button onClick={onReset} className="group flex flex-col items-center gap-1.5">
              <div className="w-[52px] h-[52px] rounded-full border-2 border-[#e5e7eb] bg-white flex items-center justify-center shadow-sm group-hover:border-[#ef4444] group-hover:shadow-md transition-all">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="#d1d5db" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold text-[#9ca3af] group-hover:text-[#ef4444] transition-colors">Try another</span>
            </button>

            <Link href={`/stock/${ticker}`} className="group flex flex-col items-center gap-1.5">
              <div className="w-[64px] h-[64px] rounded-full flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all" style={{ background: verdict.color }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <path d="M13 22.5C13 22.5 3.5 17 3.5 10C3.5 7.1 5.85 4.8 8.75 4.8C10.4 4.8 11.9 5.65 12.85 6.95C12.95 7.08 13.05 7.08 13.15 6.95C14.1 5.65 15.6 4.8 17.25 4.8C20.15 4.8 22.5 7.1 22.5 10C22.5 17 13 22.5 13 22.5Z" fill="white" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold transition-colors" style={{ color: verdict.color }}>Deep dive</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Share */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.08em] uppercase text-center">Share this signal</p>
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
    <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-14 md:py-20">
      <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-start">

        {/* ── LEFT: static content + search ── */}
        <div className="flex flex-col items-start gap-7 flex-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0052ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            Free tool
          </span>

          <div className="flex flex-col gap-4">
            <h1 className="text-[42px] md:text-[54px] font-bold tracking-[-0.035em] text-[#111111] leading-[1.05]">
              Should you<br /> buy it?
            </h1>
            <p className="text-[16px] text-[#6b7280] max-w-[400px] leading-[1.65]">
              Enter any ticker and we score it across valuation, growth, quality, and momentum - and give you a clear buy, hold, or avoid verdict.
            </p>
          </div>

          <div className="w-full max-w-md">
            <ShouldIBuySearch searchIndex={searchIndex} onSelect={handleSelect} />
          </div>

          {/* Popular tickers */}
          <div className="flex flex-wrap gap-2">
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => handleSelect(t)}
                className="rounded-full border border-[#e5e7eb] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
              >
                {t}
              </button>
            ))}
          </div>

          {/* Verdict legend */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.06em] uppercase">Possible signals</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Strong buy", bg: "#ecfdf5", text: "#065f46", dot: "#10b981" },
                { label: "Buy signal",  bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
                { label: "Hold",       bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
                { label: "Cautious",   bg: "#fff7ed", text: "#9a3412", dot: "#f97316" },
                { label: "Avoid",      bg: "#fef2f2", text: "#991b1b", dot: "#ef4444" },
              ].map(({ label, bg, text, dot }) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: bg, color: text }}>
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: panel ── */}
        <div className="w-full lg:w-[400px] shrink-0 flex flex-col min-h-[620px]">
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
