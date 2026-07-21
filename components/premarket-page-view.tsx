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

const CARD = "rounded-2xl border border-outline-variant bg-surface";
const KICK = "font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant";

const PHASE_LABEL: Record<string, string> = {
  trending_up: "Trending up",
  distribution: "Distribution",
  correction: "Correction",
  recovery: "Recovery",
  range: "Range-bound",
};

const RISK_LABEL: Record<string, string> = { on: "Risk-on", off: "Risk-off", mixed: "Mixed risk" };

function fmtPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

function signed(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function scoreStyle(score: number): { accent: string; label: string } {
  if (score >= 56) return { accent: "var(--signal-bullish)", label: "Constructive" };
  if (score <= 44) return { accent: "var(--signal-bearish)", label: "Cautious" };
  return { accent: "var(--signal-neutral)", label: "Mixed" };
}

function toneColor(tone: OpeningTone | "up" | "down" | "mixed"): string {
  if (tone === "positive" || tone === "up") return "var(--signal-bullish)";
  if (tone === "negative" || tone === "down") return "var(--signal-bearish)";
  return "var(--signal-neutral)";
}

function averageGroup(cues: OpeningCue[], group: string): number | null {
  const rows = cues.filter((cue) => cue.group === group);
  if (!rows.length) return null;
  return rows.reduce((total, row) => total + row.change_pct, 0) / rows.length;
}

function cueIsPositive(cue: OpeningCue): boolean {
  return cue.ticker === "VIX" ? cue.change_pct <= 0 : cue.change_pct >= 0;
}

function fallbackReport(movers: PremarketMovers | null): OpeningReport {
  const gainers = movers?.gappers_up ?? [];
  const losers = movers?.gappers_down ?? [];
  const total = gainers.length + losers.length;
  const breadth = total ? ((gainers.length - losers.length) / total) * 100 : 0;
  const score = Math.round(Math.max(35, Math.min(65, 50 + breadth * 0.14)));
  return {
    market: "US",
    generated_at: movers?.generated_at || "",
    phase: total ? "premarket" : "early",
    score,
    label: total ? "Initial pre-market read" : "Opening report warming up",
    direction: "mixed",
    confidence: "low",
    summary: "",
    drivers: [],
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

function OpeningScale({ score }: { score: number }) {
  return (
    <div>
      <div className="relative h-2 rounded-full bg-[linear-gradient(90deg,var(--signal-bearish),var(--signal-neutral),var(--signal-bullish))]">
        <span
          className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface bg-on-surface shadow-sm"
          style={{ left: `${Math.max(2, Math.min(98, score))}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-surface-variant">
        <span>Cautious</span>
        <span>Mixed</span>
        <span>Constructive</span>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div className="min-w-0">
      <p className={KICK}>{label}</p>
      <p className="mt-1 truncate text-[15px] font-extrabold tabular-nums text-on-surface sm:text-[17px]" style={{ color: tone === "neutral" ? undefined : toneColor(tone) }}>
        {value}
      </p>
    </div>
  );
}

function CueTable({ cues }: { cues: OpeningCue[] }) {
  if (!cues.length) {
    return <p className="px-5 py-8 text-[13px] text-on-surface-variant">Global pricing updates at the next scheduled run.</p>;
  }
  return (
    <>
      <div className="divide-y divide-outline-variant/45 sm:hidden">
        {cues.map((cue) => {
          const positive = cueIsPositive(cue);
          return (
            <div key={cue.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }} />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-on-surface">{cue.label}</p>
                  <p className="mt-0.5 font-mono text-[9.5px] text-on-surface-variant">{cue.ticker} · {cue.region}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[12px] font-bold tabular-nums" style={{ color: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{signed(cue.change_pct)}</p>
                <p className="mt-0.5 font-mono text-[9.5px] tabular-nums text-on-surface-variant">{fmtPrice(cue.price)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-outline-variant/70 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
            <th className="px-5 py-3 font-normal">Market</th>
            <th className="px-3 py-3 font-normal">Region</th>
            <th className="px-3 py-3 text-right font-normal">Last</th>
            <th className="px-5 py-3 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody>
          {cues.map((cue) => {
            const positive = cueIsPositive(cue);
            return (
              <tr key={cue.id} className="border-b border-outline-variant/45 last:border-b-0 hover:bg-surface-container-low">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-on-surface">{cue.label}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">{cue.ticker}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-on-surface-variant">{cue.region}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-on-surface">{fmtPrice(cue.price)}</td>
                <td className="px-5 py-3 text-right font-mono font-bold tabular-nums" style={{ color: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                  {signed(cue.change_pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}

function SessionTape({ sessions }: { sessions: OpeningReport["sessions"] }) {
  if (!sessions.length) return <p className="text-[12px] text-on-surface-variant">Waiting for session history.</p>;
  const max = Math.max(...sessions.map((row) => Math.abs(row.change_pct)), 0.5);
  return (
    <div className="grid grid-cols-5 gap-2">
      {sessions.map((session) => {
        const positive = session.change_pct >= 0;
        const height = 18 + (Math.abs(session.change_pct) / max) * 36;
        const label = new Date(`${session.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" });
        return (
          <div key={session.date} className="flex min-w-0 flex-col items-center">
            <span className="font-mono text-[9px] uppercase text-on-surface-variant">{label}</span>
            <div className="my-2 flex h-14 items-center">
              <span className="w-2 rounded-sm" style={{ height, background: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }} />
            </div>
            <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: positive ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
              {signed(session.change_pct, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MobileTabBar({ active, onSelect, upCount, downCount }: { active: Tab; onSelect: (tab: Tab) => void; upCount: number; downCount: number }) {
  return (
    <div className="flex border-b border-outline-variant lg:hidden">
      {([['up', 'Gapping up', upCount], ['down', 'Gapping down', downCount]] as const).map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`border-b-2 px-4 py-3 text-[12px] font-semibold transition-colors ${active === key ? "border-on-surface text-on-surface" : "border-transparent text-on-surface-variant"}`}
        >
          {label} <span className="font-mono text-[10px]">{count}</span>
        </button>
      ))}
    </div>
  );
}

function MoverTable({ label, rows, trackedIds, tone, showLabel = true }: { label: string; rows: PremarketRow[]; trackedIds: Set<string>; tone: "up" | "down"; showLabel?: boolean }) {
  if (!rows.length) return null;
  const color = tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return (
    <div className="min-w-0">
      {showLabel ? (
        <div className="flex items-center justify-between border-b border-outline-variant/70 px-4 py-3">
          <span className="text-[13px] font-semibold text-on-surface">{label}</span>
          <span className="font-mono text-[11px] font-bold" style={{ color }}>{rows.length}</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[330px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-outline-variant/50 text-left font-mono text-[9.5px] uppercase tracking-[0.07em] text-on-surface-variant">
              <th className="px-4 py-2.5 font-normal">Ticker</th>
              <th className="px-3 py-2.5 text-right font-normal">Gap</th>
              <th className="px-3 py-2.5 text-right font-normal">Price</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const up = row.pre_market_change_pct >= 0;
              return (
                <tr key={row.instrument_id} className="border-b border-outline-variant/40 last:border-b-0 hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <Link href={`/stock/${encodeURIComponent(row.ticker)}`} className="group flex min-w-0 items-center gap-2.5">
                      <StockLogo ticker={row.ticker} market="US" size={28} logoUrl={row.logo_url} />
                      <div className="min-w-0">
                        <p className="font-mono text-[12px] font-bold text-on-surface group-hover:text-accent-terminal">{row.ticker}</p>
                        {row.sector ? <p className="max-w-[125px] truncate text-[10px] text-on-surface-variant">{row.sector}</p> : null}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{signed(row.pre_market_change_pct)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-on-surface">${fmtPrice(row.pre_market_price)}</td>
                  <td className="px-3 py-3"><TrackButton ticker={row.ticker} instrumentId={row.instrument_id} isTracked={trackedIds.has(row.instrument_id)} variant="icon" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PremarketMoversTables({ movers, trackedIds }: { movers: PremarketMovers | null; trackedIds: Set<string> }) {
  const gappersUp = [...(movers?.gappers_up ?? [])].sort((a, b) => b.pre_market_change_pct - a.pre_market_change_pct);
  const gappersDown = [...(movers?.gappers_down ?? [])].sort((a, b) => a.pre_market_change_pct - b.pre_market_change_pct);
  const [tab, setTab] = useState<Tab>(gappersUp.length ? "up" : "down");
  const hasRows = gappersUp.length + gappersDown.length > 0;
  if (!hasRows) {
    return (
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="h-2 w-2 rounded-full bg-[var(--signal-neutral)]" />
        <div>
          <p className="text-[13px] font-semibold text-on-surface">Premarket pricing is not live yet</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-on-surface-variant">Quotes begin 4:00 AM ET</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <MobileTabBar active={tab} onSelect={setTab} upCount={gappersUp.length} downCount={gappersDown.length} />
      <div className="lg:hidden"><MoverTable label={tab === "up" ? "Gapping up" : "Gapping down"} rows={tab === "up" ? gappersUp : gappersDown} trackedIds={trackedIds} tone={tab === "up" ? "up" : "down"} showLabel={false} /></div>
      <div className="hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-outline-variant/70">
        <MoverTable label="Gapping up" rows={gappersUp} trackedIds={trackedIds} tone="up" />
        <MoverTable label="Gapping down" rows={gappersDown} trackedIds={trackedIds} tone="down" />
      </div>
    </>
  );
}

export function PremarketPageView({ movers, report, premarketLive, marketPhase, marketRisk, trackedIds = [] }: { movers: PremarketMovers | null; report: OpeningReport | null; premarketLive: boolean; marketPhase?: string | null; marketRisk?: string | null; trackedIds?: string[] }) {
  const data = report ?? fallbackReport(movers);
  const score = scoreStyle(data.score);
  const tracked = new Set(trackedIds);
  const futures = averageGroup(data.global_cues, "futures");
  const asia = averageGroup(data.global_cues, "asia");
  const sortedCues = [...data.global_cues].sort((a, b) => {
    const order: Record<string, number> = { futures: 0, asia: 1, europe: 2, macro: 3 };
    return (order[a.group] ?? 9) - (order[b.group] ?? 9);
  });
  const phase = marketPhase ? PHASE_LABEL[marketPhase] : null;
  const risk = marketRisk ? RISK_LABEL[marketRisk] : null;
  const socialTone: OpeningTone = data.social.sentiment_score > 10 ? "positive" : data.social.sentiment_score < -10 ? "negative" : "neutral";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1180px] px-3 py-4 sm:px-5 sm:py-7">
      <header className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: premarketLive ? "var(--signal-bullish)" : "var(--signal-neutral)" }} />
              {premarketLive ? "Premarket live" : data.phase === "early" ? "Overnight read" : "Latest read"}
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">Weekdays · 2:00 PM IST</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface sm:text-[30px]">US market opening</h1>
          <p className="mt-1 font-mono text-[11px] text-on-surface-variant">Futures · global markets · pre-market breadth</p>
        </div>
        <PremarketShareCard />
      </header>

      <section className={`${CARD} overflow-hidden`} style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="grid gap-6 px-4 py-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:gap-10 lg:p-7">
          <div className="min-w-0">
            <p className={KICK}>Expected opening</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <h2 className="text-[2rem] font-extrabold leading-none tracking-tight sm:text-[2.65rem]" style={{ color: score.accent }}>{score.label} setup</h2>
              <span className="pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">{data.confidence} confidence</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {phase ? <span className="rounded-md bg-surface-container-low px-2 py-1 font-mono text-[10px] font-semibold text-on-surface">{phase}</span> : null}
              {risk ? <span className="rounded-md bg-surface-container-low px-2 py-1 font-mono text-[10px] font-semibold text-on-surface">{risk}</span> : null}
              <span className="font-mono text-[10px] text-on-surface-variant">{data.generated_at ? `Updated ${relativeTime(data.generated_at)}` : "Preparing data"}</span>
            </div>
          </div>

          <div className="min-w-0 border-t border-outline-variant/60 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className={KICK}>Opening score</p>
                <p className="mt-1 text-[46px] font-black leading-none tracking-[-0.06em] tabular-nums text-on-surface">{data.score}<span className="ml-1 text-[16px] font-semibold tracking-normal text-on-surface-variant">/100</span></p>
              </div>
              <span className="pb-1 font-mono text-[11px] font-bold uppercase" style={{ color: score.accent }}>{score.label}</span>
            </div>
            <div className="mt-5"><OpeningScale score={data.score} /></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-outline-variant/60 px-4 py-4 sm:grid-cols-4 sm:px-6 lg:px-7">
          <Metric label="US futures" value={futures === null ? "—" : signed(futures)} tone={futures === null ? "neutral" : futures >= 0 ? "positive" : "negative"} />
          <Metric label="Asia" value={asia === null ? "—" : signed(asia)} tone={asia === null ? "neutral" : asia >= 0 ? "positive" : "negative"} />
          <Metric label="Pre-market" value={data.premarket.available ? `${data.premarket.up_count}↑ ${data.premarket.down_count}↓` : "Not live"} tone={data.premarket.available ? (data.premarket.breadth_score >= 0 ? "positive" : "negative") : "neutral"} />
          <Metric label="Social" value={data.social.available ? `${data.social.sentiment_score >= 0 ? "+" : ""}${data.social.sentiment_score.toFixed(0)}` : "—"} tone={data.social.available ? socialTone : "neutral"} />
        </div>
      </section>

      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-4">
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex items-end justify-between gap-3 border-b border-outline-variant/70 px-5 py-4">
              <div>
                <p className={KICK}>Global handoff</p>
                <h2 className="mt-1 text-[17px] font-bold tracking-tight text-on-surface">Market tape</h2>
              </div>
              <span className="font-mono text-[10px] text-on-surface-variant">{sortedCues.length} markets</span>
            </div>
            <CueTable cues={sortedCues} />
          </section>

          {data.news.length ? (
            <section className={`${CARD} overflow-hidden`}>
              <div className="border-b border-outline-variant/70 px-5 py-4">
                <p className={KICK}>Overnight catalysts</p>
              </div>
              <div className="divide-y divide-outline-variant/50">
                {data.news.slice(0, 6).map((item) => {
                  const label = item.headline || item.detail;
                  const content = (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 hover:bg-surface-container-low">
                      <span className="font-mono text-[11px] font-bold text-on-surface">{item.ticker}</span>
                      <p className="truncate text-[12.5px] text-on-surface-variant">{label}</p>
                      {item.gap_pct !== null && item.gap_pct !== undefined ? <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: item.gap_pct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{signed(item.gap_pct)}</span> : <span className="font-mono text-[9px] uppercase text-on-surface-variant">{item.source ?? "News"}</span>}
                    </div>
                  );
                  return item.url ? <a key={`${item.ticker}-${label}`} href={item.url} target="_blank" rel="noreferrer">{content}</a> : <div key={`${item.ticker}-${label}`}>{content}</div>;
                })}
              </div>
            </section>
          ) : null}

          <section className={`${CARD} overflow-hidden`}>
            <div className="flex items-end justify-between gap-3 border-b border-outline-variant/70 px-5 py-4">
              <div>
                <p className={KICK}>US pre-market</p>
                <h2 className="mt-1 text-[17px] font-bold tracking-tight text-on-surface">Movers</h2>
              </div>
              <span className="font-mono text-[10px] text-on-surface-variant">{movers?.generated_at ? relativeTime(movers.generated_at) : "4:00 AM ET"}</span>
            </div>
            <PremarketMoversTables movers={movers} trackedIds={tracked} />
          </section>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
          <section className={`${CARD} p-4 sm:p-5`}>
            <p className={`${KICK} mb-4`}>S&amp;P 500 · 5 sessions</p>
            <SessionTape sessions={data.sessions} />
          </section>

          {data.social.available || data.social.top_tickers.length ? (
            <section className={`${CARD} overflow-hidden`}>
              <div className="flex items-end justify-between gap-3 border-b border-outline-variant/60 px-4 py-4 sm:px-5">
                <div>
                  <p className={KICK}>Social tape</p>
                  <p className="mt-1 text-[24px] font-extrabold tabular-nums" style={{ color: toneColor(socialTone) }}>{data.social.sentiment_score >= 0 ? "+" : ""}{data.social.sentiment_score.toFixed(0)}</p>
                </div>
                <div className="text-right font-mono text-[9.5px] text-on-surface-variant">
                  <p><span style={{ color: "var(--signal-bullish)" }}>{data.social.positive_mentions}</span> positive</p>
                  <p className="mt-1"><span style={{ color: "var(--signal-bearish)" }}>{data.social.negative_mentions}</span> negative</p>
                </div>
              </div>
              {data.social.top_tickers.length ? (
                <div className="divide-y divide-outline-variant/50">
                  {data.social.top_tickers.slice(0, 6).map((ticker) => (
                    <div key={ticker.ticker} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <Link href={`/stock/${encodeURIComponent(ticker.ticker)}`} className="font-mono text-[12px] font-bold text-on-surface hover:text-accent-terminal">{ticker.ticker}</Link>
                      <span className="font-mono text-[10px] tabular-nums" style={{ color: toneColor(ticker.sentiment) }}>{ticker.mentions} mentions</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>

      <footer className="mt-6 border-t border-outline-variant/60 pt-4 font-mono text-[9.5px] uppercase tracking-[0.04em] text-on-surface-variant">
        Global pricing · monitored social feeds · pre-market quotes · not investment advice
      </footer>
    </div>
  );
}
