"use client";

import { useState } from "react";
import Link from "next/link";

import { PremarketShareCard } from "@/components/premarket-share-card";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { OpeningCue, OpeningReport, OpeningTone } from "@/lib/premarket-opening";
import type { PremarketMovers, PremarketRow } from "@/lib/premarket";
import { relativeTime } from "@/lib/freshness";

type Tab = "up" | "down";

const PHASE_LABEL: Record<string, string> = {
  trending_up: "trending up",
  distribution: "in distribution",
  correction: "in a correction",
  recovery: "recovering",
  range: "range-bound",
};

const RISK_LABEL: Record<string, string> = { on: "risk-on", off: "risk-off", mixed: "mixed" };

function fmtPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function toneColor(tone: OpeningTone | "up" | "down" | "mixed"): string {
  if (tone === "positive" || tone === "up") return "#059669";
  if (tone === "negative" || tone === "down") return "#e11d48";
  return "#b7791f";
}

function scoreStyle(score: number): { accent: string; glow: string; label: string } {
  if (score >= 56) return { accent: "#10b981", glow: "rgba(16,185,129,0.18)", label: "Constructive" };
  if (score <= 44) return { accent: "#fb7185", glow: "rgba(251,113,133,0.18)", label: "Cautious" };
  return { accent: "#f59e0b", glow: "rgba(245,158,11,0.16)", label: "Mixed" };
}

function fallbackReport(movers: PremarketMovers | null): OpeningReport {
  const gainers = movers?.gappers_up ?? [];
  const losers = movers?.gappers_down ?? [];
  const total = gainers.length + losers.length;
  const breadth = total ? ((gainers.length - losers.length) / total) * 100 : 0;
  const score = Math.round(Math.max(35, Math.min(65, 50 + breadth * 0.14)));
  const label = total ? "Initial pre-market read" : "Opening report warming up";
  return {
    market: "US",
    generated_at: movers?.generated_at || "",
    phase: total ? "premarket" : "early",
    score,
    label,
    direction: "mixed",
    confidence: "low",
    summary: total
      ? `${gainers.length} tracked names are gapping up and ${losers.length} are gapping down. Global market and social inputs are still being collected.`
      : "The next opening report is collecting global markets, overnight news, social conversation, and US pre-market pricing.",
    drivers: total
      ? [{ title: "Early pre-market breadth", detail: `${gainers.length} gappers up versus ${losers.length} down in the latest snapshot.`, tone: breadth > 0 ? "positive" : breadth < 0 ? "negative" : "neutral" }]
      : [],
    global_cues: [],
    sessions: [],
    premarket: {
      available: total > 0,
      generated_at: movers?.generated_at,
      quoted_count: movers?.quoted_count ?? 0,
      up_count: gainers.length,
      down_count: losers.length,
      breadth_score: breadth,
      average_gap_pct: total
        ? [...gainers, ...losers].reduce((sum, row) => sum + row.pre_market_change_pct, 0) / total
        : 0,
      top_gainers: gainers.slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, gap_pct: row.pre_market_change_pct, sector: row.sector || undefined })),
      top_losers: losers.slice(0, 5).map((row) => ({ ticker: row.ticker, name: row.name, gap_pct: row.pre_market_change_pct, sector: row.sector || undefined })),
    },
    social: {
      available: false,
      positive_mentions: 0,
      negative_mentions: 0,
      neutral_mentions: 0,
      sentiment_score: 0,
      top_tickers: [],
    },
    news: [],
  };
}

function ScoreDial({ score, label, confidence }: { score: number; label: string; confidence: string }) {
  const style = scoreStyle(score);
  const circumference = 2 * Math.PI * 43;
  const dash = Math.max(8, Math.min(circumference, (score / 100) * circumference));
  return (
    <div className="relative flex h-[128px] w-[128px] shrink-0 items-center justify-center rounded-full" style={{ background: style.glow }}>
      <svg className="absolute inset-0 -rotate-90" width="128" height="128" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r="43" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" />
        <circle
          cx="64"
          cy="64"
          r="43"
          fill="none"
          stroke={style.accent}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="relative flex flex-col items-center text-center">
        <span className="text-[34px] font-black leading-none tracking-[-0.06em] text-white">{score}</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#a7bbb5]">{confidence} confidence</span>
      </div>
    </div>
  );
}

function CueCard({ cue }: { cue: OpeningCue }) {
  const positive = cue.change_pct >= 0;
  return (
    <div className="rounded-2xl border border-[#dfe8e5] bg-white p-4 shadow-[0_8px_24px_rgba(24,63,53,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold text-[#17342c]">{cue.label}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#789087]">{cue.region}</p>
        </div>
        <span
          className="rounded-full px-2 py-1 text-[11px] font-bold tabular-nums"
          style={{ color: positive ? "#047857" : "#be123c", background: positive ? "#ecfdf5" : "#fff1f2" }}
        >
          {signed(cue.change_pct)}
        </span>
      </div>
      <p className="mt-4 font-mono text-[12px] text-[#587067]">{cue.ticker}</p>
    </div>
  );
}

function SessionTape({ sessions }: { sessions: OpeningReport["sessions"] }) {
  if (!sessions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d8e3df] bg-[#fbfdfc] px-4 py-6 text-[13px] leading-relaxed text-[#71867f]">
        The five-session S&amp;P tape will appear after the first scheduled report is built.
      </div>
    );
  }
  const max = Math.max(...sessions.map((row) => Math.abs(row.change_pct)), 0.5);
  return (
    <div className="grid grid-cols-5 gap-2">
      {sessions.map((session) => {
        const positive = session.change_pct >= 0;
        const height = 24 + (Math.abs(session.change_pct) / max) * 42;
        const label = new Date(`${session.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" });
        return (
          <div key={session.date} className="flex min-w-0 flex-col items-center gap-2 rounded-xl bg-[#f6faf8] px-1.5 py-3">
            <span className="text-[10px] font-bold text-[#70847d]">{label}</span>
            <div className="flex h-16 items-center">
              <div className="w-3 rounded-full" style={{ height, background: positive ? "#10b981" : "#fb7185" }} />
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: positive ? "#047857" : "#be123c" }}>
              {signed(session.change_pct, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MobileTabBar({ active, onSelect, upCount, downCount }: { active: Tab; onSelect: (tab: Tab) => void; upCount: number; downCount: number }) {
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "up", label: "Gapping up", count: upCount },
    { key: "down", label: "Gapping down", count: downCount },
  ];
  return (
    <div className="flex items-center gap-1.5 lg:hidden">
      {tabs.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${active === key ? "bg-[#10231f] text-white" : "bg-[#edf4f1] text-[#37564c] hover:bg-[#dce8e3]"}`}
        >
          {label}
          <span className={`text-[10px] font-semibold tabular-nums ${active === key ? "text-white/70" : "text-[#789087]"}`}>{count}</span>
        </button>
      ))}
    </div>
  );
}

function MoverTable({ label, rows, trackedIds, tone, showLabel = true }: { label: string; rows: PremarketRow[]; trackedIds: Set<string>; tone: "up" | "down"; showLabel?: boolean }) {
  if (!rows.length) return null;
  const color = tone === "up" ? "#10b981" : "#ef4444";
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {showLabel ? (
        <div className="hidden items-center gap-2 px-1 lg:flex">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#17342c]">{label}</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color }}>{rows.length}</span>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-[#dfe8e5] bg-white px-3 shadow-[0_8px_24px_rgba(24,63,53,0.04)] sm:px-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#eef3f0] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8aa099]">
                <th className="px-3 py-3 font-semibold">Ticker</th>
                <th className="px-3 py-3 text-right font-semibold">Gap</th>
                <th className="px-3 py-3 text-right font-semibold">Pre-market</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const up = row.pre_market_change_pct >= 0;
                const pctColor = up ? "#059669" : "#e11d48";
                return (
                  <tr key={row.instrument_id} className="border-b border-[#eef3f0] last:border-b-0 hover:bg-[#f8fbf9]">
                    <td className="px-3 py-3">
                      <Link href={`/stock/${encodeURIComponent(row.ticker)}`} className="group flex min-w-0 items-center gap-2.5">
                        <StockLogo ticker={row.ticker} market="US" size={28} logoUrl={row.logo_url} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[#17342c] group-hover:text-[#047857]">{row.ticker}</div>
                          {row.sector ? <div className="max-w-[140px] truncate text-[11px] text-[#849890]">{row.sector}</div> : null}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right"><span className="font-semibold tabular-nums" style={{ color: pctColor }}>{signed(row.pre_market_change_pct)}</span></td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-[#17342c]">${fmtPrice(row.pre_market_price)}</td>
                    <td className="px-3 py-3"><TrackButton ticker={row.ticker} instrumentId={row.instrument_id} isTracked={trackedIds.has(row.instrument_id)} variant="icon" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PremarketMoversTables({ movers, trackedIds }: { movers: PremarketMovers | null; trackedIds: Set<string> }) {
  const gappersUp = [...(movers?.gappers_up ?? [])].sort((a, b) => b.pre_market_change_pct - a.pre_market_change_pct);
  const gappersDown = [...(movers?.gappers_down ?? [])].sort((a, b) => a.pre_market_change_pct - b.pre_market_change_pct);
  const [tab, setTab] = useState<Tab>(gappersUp.length ? "up" : "down");
  const showTabs = gappersUp.length > 0 && gappersDown.length > 0;
  const hasRows = gappersUp.length + gappersDown.length > 0;
  if (!hasRows) {
    return <div className="rounded-2xl border border-dashed border-[#d8e3df] bg-[#fbfdfc] px-5 py-7 text-[13px] leading-relaxed text-[#71867f]">Live gappers will populate here as soon as US pre-market quotes start printing.</div>;
  }
  return (
    <div className="flex flex-col gap-4">
      {showTabs ? <MobileTabBar active={tab} onSelect={setTab} upCount={gappersUp.length} downCount={gappersDown.length} /> : null}
      <div className="lg:hidden"><MoverTable label={tab === "up" ? "Gapping up" : "Gapping down"} rows={tab === "up" ? gappersUp : gappersDown} trackedIds={trackedIds} tone={tab === "up" ? "up" : "down"} showLabel={false} /></div>
      <div className="hidden gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <MoverTable label="Gapping up" rows={gappersUp} trackedIds={trackedIds} tone="up" />
        <MoverTable label="Gapping down" rows={gappersDown} trackedIds={trackedIds} tone="down" />
      </div>
    </div>
  );
}

export function PremarketPageView({ movers, report, premarketLive, marketPhase, marketRisk, trackedIds = [] }: { movers: PremarketMovers | null; report: OpeningReport | null; premarketLive: boolean; marketPhase?: string | null; marketRisk?: string | null; trackedIds?: string[] }) {
  const data = report ?? fallbackReport(movers);
  const score = scoreStyle(data.score);
  const phase = marketPhase ? PHASE_LABEL[marketPhase] : null;
  const risk = marketRisk ? RISK_LABEL[marketRisk] : null;
  const tracked = new Set(trackedIds);
  const cues = [...data.global_cues].sort((a, b) => {
    const order: Record<string, number> = { futures: 0, asia: 1, europe: 2, macro: 3 };
    return (order[a.group] ?? 9) - (order[b.group] ?? 9);
  });

  return (
    <div className="flex flex-col gap-10">
      <section className="relative overflow-hidden rounded-[28px] bg-[#0d2923] px-5 py-6 text-white shadow-[0_20px_55px_rgba(18,57,47,0.16)] sm:px-7 sm:py-8 lg:px-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#10b981]/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-80 rounded-full bg-[#0ea5e9]/10 blur-3xl" />
        <div className="relative flex flex-col gap-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#c6ddd6]">
                <span className={`h-1.5 w-1.5 rounded-full ${premarketLive ? "bg-[#34d399]" : "bg-[#fbbf24]"}`} />
                {premarketLive ? "US pre-market live" : data.phase === "early" ? "Overnight read" : "Latest opening read"}
              </span>
              <span className="text-[11px] font-medium text-[#8eaaa1]">Refreshes 10:00 &amp; 15:30 IST</span>
            </div>
            <span className="text-[11px] text-[#a7bbb5]">{data.generated_at ? `Updated ${relativeTime(data.generated_at)}` : "Preparing sources"}</span>
          </div>

          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <ScoreDial score={data.score} label={data.label} confidence={data.confidence} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#9ab8ae]">Expected opening sentiment</p>
                <h2 className="mt-2 text-[29px] font-black leading-[1.03] tracking-[-0.05em] text-white sm:text-[38px]">{data.label}</h2>
                <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[#c6d8d3] sm:text-[15px]">{data.summary}</p>
                {phase ? <p className="mt-3 text-[12px] text-[#9fbbb2]">Broader market is {phase}{risk ? `, ${risk}` : ""}.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"><PremarketShareCard /></div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {([
              { label: "Opening score", value: `${data.score}/100`, detail: score.label, tone: data.score >= 56 ? "up" : data.score <= 44 ? "down" : "mixed" },
              { label: "Pre-market breadth", value: data.premarket.available ? `${data.premarket.up_count} up / ${data.premarket.down_count} down` : "Waiting for prints", detail: data.premarket.available ? `${signed(data.premarket.average_gap_pct)} avg gap` : "US pricing begins 4:00 AM ET", tone: data.premarket.breadth_score > 10 ? "up" : data.premarket.breadth_score < -10 ? "down" : "mixed" },
              { label: "Social tape", value: data.social.available ? `${data.social.sentiment_score >= 0 ? "+" : ""}${data.social.sentiment_score.toFixed(0)}` : "Collecting", detail: data.social.available ? "Monitored Reddit conversations" : "No fresh snapshot", tone: data.social.sentiment_score > 10 ? "up" : data.social.sentiment_score < -10 ? "down" : "mixed" },
            ] as Array<{ label: string; value: string; detail: string; tone: "up" | "down" | "mixed" }>).map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#99b7ae]">{metric.label}</p>
                <p className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-white">{metric.value}</p>
                <p className="mt-1 text-[11px]" style={{ color: toneColor(metric.tone) }}>{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-[#dfe8e5] bg-[#fbfdfc] p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Global handoff</p><h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">What the world handed to Wall Street</h2></div>
            <span className="text-[11px] text-[#789087]">Live market cues where available</span>
          </div>
          {cues.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cues.slice(0, 8).map((cue) => <CueCard key={cue.id} cue={cue} />)}</div> : <div className="rounded-2xl border border-dashed border-[#d8e3df] bg-white px-4 py-7 text-[13px] text-[#71867f]">Global futures and overseas-index prices will appear after the opening job completes.</div>}
        </div>

        <div className="rounded-[24px] border border-[#dfe8e5] bg-white p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Last 5 US sessions</p>
          <h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">S&amp;P 500 tape</h2>
          <div className="mt-5"><SessionTape sessions={data.sessions} /></div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Opening drivers</p><h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">Why the setup leans this way</h2></div><span className="text-[12px] text-[#789087]">Signals, not a price prediction</span></div>
        {data.drivers.length ? <div className="grid gap-4 md:grid-cols-3">{data.drivers.map((driver) => <article key={`${driver.title}-${driver.detail}`} className="rounded-2xl border border-[#dfe8e5] bg-white p-5 shadow-[0_8px_24px_rgba(24,63,53,0.04)]"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: toneColor(driver.tone) }} /><h3 className="text-[14px] font-bold text-[#17342c]">{driver.title}</h3></div><p className="mt-3 text-[13px] leading-relaxed text-[#61776f]">{driver.detail}</p></article>)}</div> : <div className="rounded-2xl border border-dashed border-[#d8e3df] bg-[#fbfdfc] px-5 py-7 text-[13px] text-[#71867f]">Drivers appear after the morning model combines fresh global pricing, news and conversation signals.</div>}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#dfe8e5] bg-white p-5 sm:p-6">
          <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Social conversation</p><h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">What is getting attention</h2></div>{data.social.available ? <span className="text-[12px] font-bold" style={{ color: toneColor(data.social.sentiment_score > 10 ? "up" : data.social.sentiment_score < -10 ? "down" : "mixed") }}>{data.social.sentiment_score >= 0 ? "+" : ""}{data.social.sentiment_score.toFixed(0)} tape</span> : null}</div>
          {data.social.top_tickers.length ? <div className="mt-5 flex flex-col gap-3">{data.social.top_tickers.map((ticker) => <div key={ticker.ticker} className="rounded-xl bg-[#f6faf8] px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[14px] font-bold text-[#17342c]">{ticker.ticker}</span><span className="text-[11px] font-bold" style={{ color: toneColor(ticker.sentiment) }}>{ticker.mentions} mentions · {ticker.sentiment}</span></div>{ticker.summary ? <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-[#688078]">{ticker.summary}</p> : null}</div>)}</div> : <p className="mt-5 rounded-xl bg-[#f6faf8] px-4 py-5 text-[13px] leading-relaxed text-[#71867f]">The social tape fills from the latest monitored investing conversations, then stays separate from the market-price signal.</p>}
        </div>
        <div className="rounded-[24px] border border-[#dfe8e5] bg-white p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Overnight news</p><h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">Catalysts behind the gap</h2>
          {data.news.length ? <div className="mt-5 flex flex-col divide-y divide-[#edf3f0]">{data.news.map((item) => { const body = <><div className="flex items-center gap-2"><span className="font-mono text-[12px] font-bold text-[#17342c]">{item.ticker}</span>{item.gap_pct !== null && item.gap_pct !== undefined ? <span className="text-[11px] font-bold" style={{ color: item.gap_pct >= 0 ? "#047857" : "#be123c" }}>{signed(item.gap_pct)}</span> : null}{item.source ? <span className="ml-auto text-[10px] text-[#8ba099]">{item.source}</span> : null}</div><p className="mt-1.5 text-[12px] leading-relaxed text-[#5e746c]">{item.detail}</p></>; return item.url ? <a key={`${item.ticker}-${item.detail}`} href={item.url} target="_blank" rel="noreferrer" className="py-3 first:pt-0 hover:opacity-75">{body}</a> : <div key={`${item.ticker}-${item.detail}`} className="py-3 first:pt-0">{body}</div>; })}</div> : <p className="mt-5 rounded-xl bg-[#f6faf8] px-4 py-5 text-[13px] leading-relaxed text-[#71867f]">Overnight catalysts are pulled from the existing pre-market news context once live gappers are available.</p>}
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0b8a67]">Live price action</p><h2 className="mt-1 text-[21px] font-bold tracking-[-0.03em] text-[#17342c]">US pre-market movers</h2></div><span className="text-[12px] text-[#789087]">{movers?.generated_at ? `Updated ${relativeTime(movers.generated_at)}` : "Waiting for US pre-market"}</span></div>
        <PremarketMoversTables movers={movers} trackedIds={tracked} />
      </section>

      <footer className="rounded-2xl border border-[#e0e9e5] bg-[#f8fbf9] px-5 py-4 text-[11px] leading-relaxed text-[#71867f]">
        {data.source_note ?? "This report combines global-market pricing, the latest five US sessions, monitored investing conversations, Firecrawl-first news context and live pre-market snapshots."} Pre-market trading can be thin and volatile; this is context, not investment advice.
      </footer>
    </div>
  );
}
