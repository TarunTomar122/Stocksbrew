"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { ProCtaLink } from "@/components/pro-cta";
import { StockLogo } from "@/components/stock-logo";
import { PortfolioSearch } from "@/components/portfolio-search";
import { TrackInRadarButton } from "@/components/track-in-radar-button";
import type { SearchEntry } from "@/lib/search";
import type { PortfolioAnalysis, PortfolioStock, RiskFlag, Opportunity } from "@/lib/portfolio-analyzer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(s: number | null): string {
  if (s === null) return "var(--oa-muted-fg)";
  if (s >= 80) return "var(--signal-bullish)";
  if (s >= 60) return "var(--oa-fg)";
  if (s >= 40) return "var(--oa-muted-fg)";
  return "var(--signal-bearish)";
}

function scoreLabel(s: number | null): string {
  if (s === null) return "—";
  if (s >= 75) return "Strong";
  if (s >= 55) return "Solid";
  if (s >= 35) return "Mixed";
  return "Weak";
}

function fmtLarge(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const SAMPLE_PORTFOLIO = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN"];

const SECTOR_COLORS = [
  "var(--oa-primary)", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#d946ef", "#0ea5e9", "#a855f7", "#22c55e",
];

const VERDICT_META: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: "var(--oa-bg)", text: "var(--signal-bullish)", label: "Strong" },
  solid:  { bg: "var(--oa-bg)", text: "var(--signal-bullish)", label: "Solid" },
  mixed:  { bg: "var(--oa-bg)", text: "var(--signal-neutral)", label: "Mixed" },
  weak:   { bg: "var(--oa-bg)", text: "var(--signal-bearish)", label: "Weak" },
};

const RISK_META: Record<string, { icon: string; bg: string }> = {
  sector_concentration: { icon: "📊", bg: "var(--oa-bg)" },
  low_score:            { icon: "⚠️", bg: "var(--oa-bg)" },
  overbought:           { icon: "📈", bg: "var(--oa-bg)" },
};

const OPP_META: Record<string, { icon: string }> = {
  analyst_runway: { icon: "🎯" },
};

type InputMode = "paste" | "search";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionOpener({ num, title, meta }: { num: string; title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--oa-border)] pt-8 mb-5">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-medium tracking-[0.12em] uppercase text-[var(--oa-muted-fg)] tabular-nums">§ {num}</span>
        <h2 className="text-[20px] font-medium tracking-[-0.015em] text-[var(--oa-fg)]">{title}</h2>
      </div>
      {meta && <span className="text-[12px] text-[var(--oa-muted-fg)]">{meta}</span>}
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null;
  const clamped = Math.min(Math.max(score, 0), 100);
  return (
    <div className="relative h-1.5 rounded-full bg-[var(--oa-bg)] overflow-hidden w-16">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamped}%`, background: scoreColor(score) }} />
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  const m = VERDICT_META[verdict ?? ""] ?? { bg: "var(--oa-bg)", text: "var(--oa-muted-fg)", label: verdict ?? "—" };
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: m.bg, color: m.text }}>
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Input Section
// ---------------------------------------------------------------------------

function InputSection({
  searchIndex,
  tickers,
  onAddTickers,
  onRemoveTicker,
  onAnalyze,
  loading,
}: {
  searchIndex: SearchEntry[];
  tickers: string[];
  onAddTickers: (ts: string[]) => void;
  onRemoveTicker: (t: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<InputMode>("paste");
  const [pasteText, setPasteText] = useState("");

  function handlePasteAnalyze() {
    const parsed = pasteText
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length >= 1 && t.length <= 16);
    if (parsed.length) onAddTickers(parsed);
    setPasteText("");
  }

  const modes: { key: InputMode; label: string; icon: React.ReactNode }[] = [
    {
      key: "paste",
      label: "Paste tickers",
      icon: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M4 5h5M4 7h5M4 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: "search",
      label: "Search",
      icon: (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Mode tabs */}
      <div className="flex gap-1.5">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
              mode === m.key
                ? "bg-oa-primary text-white"
                : "bg-[var(--oa-bg)] text-[var(--oa-muted-fg)] hover:bg-[var(--oa-border)] hover:text-[var(--oa-fg)]"
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode content */}
      {mode === "paste" && (
        <div className="flex flex-col gap-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePasteAnalyze(); }}}
            placeholder="NVDA, AAPL, MSFT, GOOGL, AMZN..."
            rows={3}
            className="w-full rounded-xl border border-[var(--oa-border)] bg-oa-bg p-4 text-[14px] text-[var(--oa-fg)] placeholder:text-[var(--oa-muted-fg)] outline-none focus:border-[var(--oa-fg)] focus:bg-oa-card transition-all resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePasteAnalyze}
              disabled={!pasteText.trim()}
              className="inline-flex items-center h-9 rounded-full bg-oa-primary px-5 text-[12px] font-medium text-white transition-[filter] hover:brightness-110 disabled:opacity-40"
            >
              Add to list
            </button>
            {tickers.length === 0 && !pasteText.trim() && (
              <button
                onClick={() => onAddTickers(SAMPLE_PORTFOLIO)}
                className="inline-flex items-center h-9 rounded-full border border-[var(--oa-border)] px-4 text-[12px] font-medium text-[var(--oa-muted-fg)] transition-colors hover:border-[var(--oa-fg)]/30 hover:text-[var(--oa-fg)]"
              >
                Try a sample portfolio
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "search" && (
        <PortfolioSearch searchIndex={searchIndex} onSelect={(ticker) => onAddTickers([ticker])} />
      )}

      {/* Selected tickers chip list */}
      {tickers.length > 0 && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--oa-fg)]">
              {tickers.length} stock{tickers.length > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={() => onAddTickers([])}
              className="text-[11px] text-[var(--oa-muted-fg)] hover:text-[#ef4444] transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tickers.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--oa-border)] bg-oa-card pl-3 pr-1.5 py-1 text-[12px] font-medium text-[var(--oa-fg)]"
              >
                {t}
                <button
                  onClick={() => onRemoveTicker(t)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[var(--oa-bg)] transition-colors"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="var(--oa-muted-fg)" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={onAnalyze}
            disabled={loading || tickers.length === 0}
            className="self-start inline-flex items-center justify-center h-11 rounded-full bg-oa-primary px-7 text-[13px] font-medium text-white hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Analyzing...
              </span>
            ) : (
              "Analyze portfolio →"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function SummaryCard({ analysis }: { analysis: PortfolioAnalysis }) {
  const { factor_tilt, diversification_score, total_market_cap, total_stocks, stocks_with_scores, summary } = analysis;
  const avgScore = factor_tilt.overall;
  const verdict = scoreLabel(avgScore);
  const vm = VERDICT_META[verdict] ?? { bg: "var(--oa-bg)", text: "var(--oa-muted-fg)" };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="col-span-2 md:col-span-1 rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--oa-muted-fg)]">Portfolio score</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[48px] font-medium tracking-[-0.03em] leading-none" style={{ color: scoreColor(avgScore) }}>
            {avgScore ?? "—"}
          </span>
          {avgScore !== null && <span className="text-[13px] font-medium text-[var(--oa-muted-fg)]">/ 100</span>}
        </div>
        <span className="inline-block self-start rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: vm.bg, color: vm.text }}>
          {verdict}
        </span>
        {summary && <p className="text-[12px] text-[var(--oa-muted-fg)] leading-[1.5] mt-1">{summary}</p>}
      </div>

      <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--oa-muted-fg)]">Diversification</span>
        <span className="text-[40px] font-medium tracking-[-0.03em] leading-none" style={{ color: scoreColor(diversification_score) }}>
          {diversification_score}
        </span>
        <span className="text-[11px] text-[var(--oa-muted-fg)]">/ 100</span>
        <p className="text-[12px] text-[var(--oa-muted-fg)] leading-snug mt-1">
          {diversification_score >= 70 ? "Well spread across sectors." :
           diversification_score >= 40 ? "Moderate diversification." :
           "Highly concentrated."}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--oa-muted-fg)]">Holdings</span>
        <span className="text-[40px] font-medium tracking-[-0.03em] leading-none text-[var(--oa-fg)]">{total_stocks}</span>
        <span className="text-[11px] text-[var(--oa-muted-fg)]">{stocks_with_scores} with scores</span>
      </div>

      <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 flex flex-col gap-2">
        <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--oa-muted-fg)]">Total mkt cap</span>
        <span className="text-[28px] font-medium tracking-[-0.03em] leading-none text-[var(--oa-fg)] break-all">{fmtLarge(total_market_cap)}</span>
        {total_market_cap !== null && total_stocks > 0 && (
          <span className="text-[11px] text-[var(--oa-muted-fg)]">avg {fmtLarge(total_market_cap / total_stocks)} / stock</span>
        )}
      </div>
    </div>
  );
}

function SectorPieChart({ allocation }: { allocation: PortfolioAnalysis["sector_allocation"] }) {
  if (!allocation.length) return null;
  const data = allocation.map((a) => ({ name: a.sector, value: a.count }));
  return (
    <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5">
      <h3 className="text-[13px] font-medium text-[var(--oa-fg)] mb-4">Sector allocation</h3>
      <div className="flex flex-col md:flex-row items-center gap-5">
        <div className="w-44 h-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={2} dataKey="value">
                {data.map((_, i) => (
                  <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 flex flex-col gap-2 w-full">
          {allocation.map((s, i) => (
            <div key={s.sector} className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
              <span className="flex-1 text-[12px] font-medium text-[var(--oa-fg)] truncate">{s.sector}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-[var(--oa-bg)] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.weight_pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                </div>
                <span className="text-[12px] font-medium text-[var(--oa-fg)] tabular-nums w-8 text-right">{s.weight_pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FactorRadar({ tilt }: { tilt: PortfolioAnalysis["factor_tilt"] }) {
  const data = [
    { factor: "Valuation", score: tilt.valuation ?? 0 },
    { factor: "Growth",    score: tilt.growth ?? 0 },
    { factor: "Quality",   score: tilt.quality ?? 0 },
    { factor: "Momentum",  score: tilt.momentum ?? 0 },
  ];
  if (!data.some((d) => d.score > 0)) return null;

  return (
    <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5">
      <h3 className="text-[13px] font-medium text-[var(--oa-fg)]">Factor tilt</h3>
      <p className="text-[11px] text-[var(--oa-muted-fg)] mt-0.5 mb-3">Average across 4 pillars · 0–100</p>
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid stroke="var(--oa-border)" />
            <PolarAngleAxis dataKey="factor" tick={{ fontSize: 11, fill: "var(--oa-muted-fg)" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--oa-muted-fg)" }} />
            <Radar dataKey="score" stroke="var(--oa-primary)" fill="var(--oa-primary)" fillOpacity={0.1} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1">
        {data.map((d) => (
          <div key={d.factor} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--oa-bg)] px-3 py-1.5">
            <span className="text-[11px] text-[var(--oa-muted-fg)]">{d.factor}</span>
            <span className="text-[13px] font-medium tabular-nums" style={{ color: scoreColor(d.score || null) }}>{d.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingCard({ stock, index }: { stock: PortfolioStock; index: number }) {
  const positive = (stock.day_change_pct ?? 0) >= 0;
  const vm = VERDICT_META[stock.verdict ?? ""] ?? { bg: "var(--oa-bg)", text: "var(--oa-muted-fg)", label: "—" };
  return (
    <Link
      href={`/stock/${stock.ticker}`}
      className="group flex flex-col gap-4 rounded-2xl border border-[var(--oa-border)] bg-oa-card p-4 hover:border-[var(--oa-fg)] hover:shadow-sm transition-all"
    >
      {/* Top row: index + verdict badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-[var(--oa-muted-fg)] tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <VerdictBadge verdict={stock.verdict} />
      </div>

      {/* Logo + ticker + name */}
      <div className="flex items-center gap-3">
        <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} size={36} market={stock.market} />
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-medium text-[var(--oa-fg)] leading-none">{stock.ticker}</span>
          <span className="text-[11px] text-[var(--oa-muted-fg)] mt-0.5 truncate">{stock.name}</span>
        </div>
      </div>

      {/* Price + day change */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[18px] font-medium tabular-nums text-[var(--oa-fg)] leading-none">
          {stock.price !== null ? `$${stock.price.toFixed(2)}` : "—"}
        </span>
        <span className="text-[13px] font-medium tabular-nums" style={{ color: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
          {fmtPct(stock.day_change_pct)}
        </span>
      </div>

      {/* Score bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--oa-muted-fg)]">Score</span>
          <span className="text-[13px] font-medium tabular-nums" style={{ color: scoreColor(stock.scores.overall) }}>
            {stock.scores.overall ?? "—"}
          </span>
        </div>
        <ScoreBar score={stock.scores.overall} />
      </div>

      {/* Footer: sector + RSI + mkt cap */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--oa-bg)]">
        <span className="text-[11px] text-[var(--oa-muted-fg)] truncate">{stock.sector}</span>
        <div className="flex items-center gap-2 shrink-0">
          {stock.rsi !== null && (
            <span
              className="text-[10px] font-medium tabular-nums rounded-md px-1.5 py-0.5"
              style={{
                background: "var(--oa-bg)",
                color: stock.rsi >= 70 ? "var(--signal-bearish)" : stock.rsi <= 30 ? "var(--signal-bullish)" : "var(--oa-muted-fg)",
              }}
            >
              RSI {stock.rsi.toFixed(0)}
            </span>
          )}
          <span className="text-[11px] text-[var(--oa-muted-fg)] tabular-nums">{fmtLarge(stock.market_cap)}</span>
        </div>
      </div>
    </Link>
  );
}

function RiskFlagsCard({ flags, logoMap }: { flags: RiskFlag[]; logoMap: Map<string, string | null> }) {
  if (!flags.length) return null;
  return (
    <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5">
      <h3 className="text-[13px] font-medium text-[var(--oa-fg)] mb-3 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-oa-bg text-[13px]">⚠️</span>
        Risk flags
        <span className="text-[11px] font-normal text-[var(--oa-muted-fg)]">{flags.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {flags.map((f, i) => {
          const meta = RISK_META[f.kind] ?? { icon: "⚠️", bg: "var(--oa-bg)" };
          return (
            <div key={i} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: meta.bg }}>
              {f.ticker ? (
                <StockLogo ticker={f.ticker} logoUrl={logoMap.get(f.ticker) ?? null} market="US" size={32} />
              ) : (
                <span className="text-[15px] shrink-0">{meta.icon}</span>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--oa-fg)]">{f.headline}</p>
                <p className="text-[12px] text-[var(--oa-muted-fg)] mt-0.5 leading-relaxed">{f.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunitiesCard({ opportunities, logoMap }: { opportunities: Opportunity[]; logoMap: Map<string, string | null> }) {
  if (!opportunities.length) return null;
  return (
    <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5">
      <h3 className="text-[13px] font-medium text-[var(--oa-fg)] mb-3 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-oa-bg text-[13px]">💡</span>
        Opportunities
        <span className="text-[11px] font-normal text-[var(--oa-muted-fg)]">{opportunities.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {opportunities.map((o, i) => (
          <div key={i} className="rounded-xl bg-oa-bg px-4 py-3 flex items-center gap-3">
            <StockLogo ticker={o.ticker} logoUrl={logoMap.get(o.ticker) ?? null} market="US" size={32} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--oa-fg)]">{o.headline}</p>
              <p className="text-[12px] text-[var(--oa-muted-fg)] mt-0.5 leading-relaxed">{o.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissingTickersNote({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return (
    <div className="rounded-xl border border-oa-border bg-oa-bg px-4 py-3 flex items-start gap-2.5">
      <span className="text-[14px] mt-0.5">⚠️</span>
      <div>
        <p className="text-[12px] font-medium text-oa-fg">
          Couldn&apos;t resolve: {missing.join(", ")}
        </p>
        <p className="text-[11px] text-oa-muted-fg mt-0.5">
          These may be delisted, renamed, or not in our universe.
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 h-32">
            <div className="h-2.5 w-20 rounded-full bg-[var(--oa-bg)] mb-3" />
            <div className="h-10 w-14 rounded-lg bg-[var(--oa-bg)] mb-2" />
            <div className="h-2 w-24 rounded-full bg-[var(--oa-bg)]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 h-64">
          <div className="h-3 w-28 rounded-full bg-[var(--oa-bg)] mb-4" />
          <div className="h-48 rounded-xl bg-[var(--oa-bg)]" />
        </div>
        <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 h-64">
          <div className="h-3 w-24 rounded-full bg-[var(--oa-bg)] mb-4" />
          <div className="h-48 rounded-xl bg-[var(--oa-bg)]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pro CTA — shown after results
// ---------------------------------------------------------------------------

function ProCTA() {
  return (
    <div className="rounded-3xl border border-[var(--oa-border)] bg-oa-card p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-8">
      <div className="flex flex-col gap-4 flex-1">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-oa-card border border-[var(--oa-border)] px-3 py-1 text-[11px] font-medium text-[var(--oa-fg)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            This was a one-time snapshot
          </span>
          <h3 className="text-[22px] md:text-[26px] font-medium tracking-[-0.02em] text-[var(--oa-fg)] leading-[1.2]">
            Your portfolio changes every day.<br />Your analysis should too.
          </h3>
        </div>
        <p className="text-[14px] text-[var(--oa-muted-fg)] leading-relaxed max-w-[480px]">
          stocksbrew Pro tracks each of your stocks daily, flagging risk before it hits, surfacing opportunities you&apos;d miss, and telling you exactly what to do with every holding every morning.
        </p>
        <ul className="flex flex-col gap-2">
          {[
            "Daily verdict on every stock you own: Accumulate, Trim, Hold, Avoid",
            "Risk alerts the moment something changes in your portfolio",
            "Full pillar breakdown: Valuation · Growth · Quality · Momentum",
            "Morning brief with what actually matters before the open",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] text-[var(--oa-fg)]">
              <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="7" fill="#ecfdf5"/>
                <path d="M4 7l2.2 2.2L10 5" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-start md:items-center gap-3 shrink-0">
        <ProCtaLink href="/subscribe" size="lg" showStar className="px-8">
          Start your Watchlist →
        </ProCtaLink>
        <Link
          href="/watchlist"
          className="text-[12px] font-medium text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)] transition-colors"
        >
          See a demo first
        </Link>
        <p className="text-[11px] text-[var(--oa-muted-fg)]">Free for 3 stocks · No credit card</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PortfolioAnalyzer({ searchIndex }: { searchIndex: SearchEntry[] }) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Build a ticker → instrument_id map from searchIndex for the Track CTA
  const tickerToInstrumentId = new Map(
    searchIndex.map((e) => [e.ticker.toUpperCase(), e.instrument_id])
  );

  function handleAddTickers(newTs: string[]) {
    if (newTs.length === 0) { setTickers([]); return; }
    setTickers((prev) => {
      const combined = [...prev, ...newTs];
      return [...new Set(combined.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
    });
  }

  function handleRemoveTicker(t: string) {
    setTickers((prev) => prev.filter((x) => x !== t));
  }

  const handleAnalyze = useCallback(async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/portfolio-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Request failed");
      }
      const data: PortfolioAnalysis = await res.json();
      setAnalysis(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-6 md:px-20 lg:px-32 py-8 md:py-12">

      {/* ── Header ── */}
      <div className="flex flex-col gap-6 mb-10">
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--oa-border)] bg-oa-card px-3 py-1 text-[11px] font-medium text-[var(--oa-fg)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            Free tool
          </span>
          <h1 className="text-[36px] md:text-[48px] font-medium tracking-[-0.03em] text-[var(--oa-fg)] leading-[1.05]">
            Portfolio analyzer
          </h1>
          <p className="text-[15px] text-[var(--oa-muted-fg)] max-w-[540px] leading-relaxed">
            Paste your tickers or search by company. Get sector allocation, factor tilt, risk flags, and opportunities instantly, for free.
          </p>
        </div>

        {/* Value props row */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: "📊", label: "Sector breakdown" },
            { icon: "🎯", label: "Factor tilt" },
            { icon: "⚠️", label: "Risk flags" },
            { icon: "💡", label: "Opportunities" },
            { icon: "📈", label: "RSI signals" },
          ].map((v) => (
            <span key={v.label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oa-border)] bg-oa-card px-3 py-1 text-[12px] font-medium text-[var(--oa-fg)]">
              <span>{v.icon}</span>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Input card ── */}
      {!analysis && (
        <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-6">
          <InputSection
            searchIndex={searchIndex}
            tickers={tickers}
            onAddTickers={handleAddTickers}
            onRemoveTicker={handleRemoveTicker}
            onAnalyze={handleAnalyze}
            loading={loading}
          />
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="mt-10">
          <LoadingSkeleton />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mt-6 rounded-xl border border-oa-border bg-oa-bg px-4 py-3 flex items-start gap-2.5">
          <span className="text-[14px] mt-0.5">⚠️</span>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--signal-bearish)" }}>{error}</p>
            <button onClick={() => setError(null)} className="mt-1 text-[12px] text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)] transition-colors">
              ← Try again
            </button>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {analysis && !loading && (
        <div ref={resultsRef} className="flex flex-col gap-12 mt-2">
          {/* Edit / back */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <button
              onClick={() => { setAnalysis(null); }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7 3L4 6l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Analyze different portfolio
            </button>

            <div className="flex flex-wrap gap-1.5">
              {tickers.map((t) => (
                <span key={t} className="inline-flex items-center rounded-full border border-[var(--oa-border)] bg-oa-card px-2.5 py-0.5 text-[11px] font-medium text-[var(--oa-fg)]">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {analysis.missing_tickers.length > 0 && (
            <MissingTickersNote missing={analysis.missing_tickers} />
          )}

          {/* § 01 — Overview */}
          <div>
            <SectionOpener num="01" title="Overview" meta={`${analysis.total_stocks} stocks`} />
            <SummaryCard analysis={analysis} />
          </div>

          {/* § 02 — Allocation */}
          <div>
            <SectionOpener num="02" title="Allocation & factors" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SectorPieChart allocation={analysis.sector_allocation} />
              <FactorRadar tilt={analysis.factor_tilt} />
            </div>
          </div>

          {/* § 03 — Holdings + Track CTA */}
          <div className="flex flex-col gap-5">
            <SectionOpener num="03" title="Holdings" meta={`${analysis.stocks.length} stocks`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {analysis.stocks.map((s, i) => (
                <HoldingCard key={s.ticker} stock={s} index={i} />
              ))}
            </div>

            {/* Track CTA — inline below holdings */}
            {(() => {
              const instrumentIds = analysis.stocks
                .map((s) => tickerToInstrumentId.get(s.ticker.toUpperCase()))
                .filter((id): id is string => !!id);
              if (instrumentIds.length === 0) return null;
              return (
                <div className="rounded-2xl border border-[var(--oa-border)] bg-oa-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-oa-card border border-[var(--oa-border)] text-[16px]">📡</span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-[14px] font-medium text-[var(--oa-fg)] tracking-[-0.01em]">
                        Start tracking to get the full picture
                      </p>
                      <p className="text-[12px] text-[var(--oa-muted-fg)] leading-relaxed">
                        Add these stocks to your Watchlist for current calls, portfolio gaps, analyst targets and alerts.
                      </p>
                    </div>
                  </div>
                  <TrackInRadarButton instrumentIds={instrumentIds} positionType="holding" className="shrink-0" />
                </div>
              );
            })()}
          </div>

          {/* § 04 — Risk & Opportunities */}
          {(analysis.risk_flags.length > 0 || analysis.opportunities.length > 0) && (() => {
            const logoMap = new Map(analysis.stocks.map((s) => [s.ticker, s.logo_url]));
            return (
              <div>
                <SectionOpener num="04" title="Risk & opportunities" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RiskFlagsCard flags={analysis.risk_flags} logoMap={logoMap} />
                  <OpportunitiesCard opportunities={analysis.opportunities} logoMap={logoMap} />
                </div>
              </div>
            );
          })()}

          {/* Pro CTA */}
          <ProCTA />
        </div>
      )}

      {/* ── Empty hint ── */}
      {!analysis && !loading && tickers.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="flex items-center -space-x-3">
            {SAMPLE_PORTFOLIO.map((t) => (
              <StockLogo key={t} ticker={t} size={40} circle className="border-2 border-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]" />
            ))}
          </div>
          <p className="text-[14px] font-medium text-[var(--oa-fg)]">Add your stocks above to get started</p>
          <p className="text-[12px] text-[var(--oa-muted-fg)]">Paste tickers or search by company name</p>
        </div>
      )}
    </div>
  );
}
