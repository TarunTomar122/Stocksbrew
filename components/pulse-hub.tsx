"use client";

import Link from "next/link";
import { useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { InterestingStocksFeed } from "@/components/interesting-stocks-feed";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { StockLogo } from "@/components/stock-logo";
import type { InterestingStockRow } from "@/lib/interesting-stocks";
import type { OpeningReport } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";

export type SectorCard = { label: string; avg: number; stocks: { ticker: string; changePct: number }[] };
export type RedditPick = {
  ticker: string;
  sentiment: string;
  summary: string;
  mention_count?: number;
  catalysts?: string[];
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
};
export type EarningsPick = { ticker: string; company: string; eventDate: string; time: string; epsEstimate: number | null; epsOutlook?: string; reaction?: string };
export type RecentEarningsPick = { ticker: string; company: string; eventDate: string; headline: string; epsTag?: string };
export type PulseTopline = {
  gainers: number;
  losers: number;
  lead?: { label: string; avg: number } | null;
  lag?: { label: string; avg: number } | null;
  crowd?: string | null;
};

type Lens = "today" | "moving" | "earnings" | "setups";

const TABS: { id: Lens; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "activity" },
  { id: "moving", label: "Moving now", icon: "trending_up" },
  { id: "earnings", label: "Earnings", icon: "calendar_today" },
  { id: "setups", label: "Setups", icon: "stars" },
];

const EPS_LABEL: Record<string, string> = { beat: "EPS beat", inline: "EPS inline", miss: "EPS miss", unclear: "EPS unclear" };
const MOVE_LABEL: Record<string, string> = { rally: "bullish", fade: "bearish", chop: "neutral", unclear: "unclear" };

function chipTone(value?: string) {
  if (value === "beat" || value === "rally" || value === "bullish" || value === "positive") {
    return { color: "var(--signal-bullish)", background: "color-mix(in srgb, var(--signal-bullish) 12%, var(--surface))" };
  }
  if (value === "miss" || value === "fade" || value === "bearish" || value === "negative") {
    return { color: "var(--signal-bearish)", background: "color-mix(in srgb, var(--signal-bearish) 11%, var(--surface))" };
  }
  return { color: "var(--signal-neutral)", background: "var(--surface-container-low)" };
}

function fmtDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pct(value: number) {
  const up = value >= 0;
  return <span className="font-mono font-semibold tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{up ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%</span>;
}

function MarketContext({ sectors, reddit }: { sectors: SectorCard[]; reddit: RedditPick[] }) {
  const rankedSectors = [...sectors].sort((a, b) => b.avg - a.avg).slice(0, 5);
  const crowd = reddit[0];
  if (rankedSectors.length === 0 && !crowd) return null;

  return (
    <section className="my-8 grid border-y border-outline-variant lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:divide-x lg:divide-outline-variant">
      {rankedSectors.length > 0 ? (
        <div className="py-6 lg:pr-8">
          <p className="landing-section-kicker text-landing-brand">Market context</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-on-surface">Sector leadership</h2>
          <div className="mt-4 divide-y divide-outline-variant/70">
            {rankedSectors.map((sector) => (
              <div key={sector.label} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-4 py-2.5 text-[13px]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-semibold text-on-surface">{sector.label}</span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-on-surface-variant">{sector.stocks.slice(0, 3).map((stock) => stock.ticker).join(" · ")}</span>
                </div>
                <span className="text-right">{pct(sector.avg)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {crowd ? (
        <Link href={`/stock/${crowd.ticker}`} className="group py-6 lg:pl-8">
          <p className="landing-section-kicker text-landing-reddit">Crowd watch</p>
          <div className="mt-2 flex items-center gap-2.5">
            <StockLogo ticker={crowd.ticker} market="US" size={28} />
            <span className="font-bold text-on-surface">{crowd.ticker}</span>
            <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]" style={chipTone(crowd.sentiment)}>{crowd.sentiment}</span>
            {crowd.mention_count ? <span className="ml-auto font-mono text-[10px] text-on-surface-variant">{crowd.mention_count} posts</span> : null}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant group-hover:text-on-surface">{crowd.summary}</p>
          <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-landing-reddit">Open {crowd.ticker} <span aria-hidden>→</span></span>
        </Link>
      ) : null}
    </section>
  );
}

function OpeningSetup({ report, movers, marketPhase, marketRisk }: { report: OpeningReport | null; movers: PremarketMovers | null; marketPhase?: string | null; marketRisk?: string | null }) {
  if (!report && !movers) return null;
  const gaps = [...(movers?.gappers_up ?? []), ...(movers?.gappers_down ?? [])]
    .sort((left, right) => Math.abs(right.pre_market_change_pct) - Math.abs(left.pre_market_change_pct))
    .slice(0, 5);
  const toneColor = report?.direction === "positive" ? "var(--signal-bullish)" : report?.direction === "negative" ? "var(--signal-bearish)" : "var(--on-surface)";

  return (
    <section className="border-b border-outline-variant pb-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] lg:divide-x lg:divide-outline-variant">
        <div className="lg:pr-8">
          <p className="landing-section-kicker text-landing-brand">Opening setup</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-xl font-bold tracking-tight" style={{ color: toneColor }}>{report?.label ?? "Pre-market activity"}</h2>
            {report ? <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-on-surface-variant">{report.confidence} confidence</span> : null}
          </div>
          {report?.summary ? <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-surface-variant">{report.summary}</p> : null}
          {report?.drivers?.length ? <div className="mt-5 divide-y divide-outline-variant/70 border-y border-outline-variant/70">{report.drivers.slice(0, 3).map((driver) => <div key={driver.title} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 py-2.5"><span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: driver.tone === "positive" ? "var(--signal-bullish)" : driver.tone === "negative" ? "var(--signal-bearish)" : "var(--signal-neutral)" }} /><p className="text-[13px] leading-relaxed text-on-surface"><span className="font-semibold">{driver.title}: </span><span className="text-on-surface-variant">{driver.detail}</span></p></div>)}</div> : null}
        </div>
        <div className="lg:pl-8">
          <p className="landing-section-kicker text-landing-brand">Pre-market</p>
          <div className="mt-3 grid grid-cols-3 divide-x divide-outline-variant text-center">
            <div><p className="font-mono text-[10px] uppercase text-on-surface-variant">Up</p><p className="mt-1 text-lg font-bold text-[var(--signal-bullish)]">{report?.premarket.up_count ?? movers?.gappers_up.length ?? 0}</p></div>
            <div><p className="font-mono text-[10px] uppercase text-on-surface-variant">Down</p><p className="mt-1 text-lg font-bold text-[var(--signal-bearish)]">{report?.premarket.down_count ?? movers?.gappers_down.length ?? 0}</p></div>
            <div><p className="font-mono text-[10px] uppercase text-on-surface-variant">Phase</p><p className="mt-1 text-sm font-bold text-on-surface">{marketPhase ?? marketRisk ?? "Pre-open"}</p></div>
          </div>
          {gaps.length ? <div className="mt-5 divide-y divide-outline-variant/70 border-t border-outline-variant/70">{gaps.map((gap) => <Link key={gap.instrument_id} href={`/stock/${gap.ticker}`} className="flex items-center gap-2 py-2.5 hover:bg-surface-container-low"><StockLogo ticker={gap.ticker} market="US" size={20} /><span className="font-semibold text-on-surface">{gap.ticker}</span><span className="ml-auto font-mono text-[12px] font-semibold" style={{ color: gap.pre_market_change_pct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{gap.pre_market_change_pct >= 0 ? "▲" : "▼"} {Math.abs(gap.pre_market_change_pct).toFixed(2)}%</span></Link>)}</div> : null}
        </div>
      </div>
    </section>
  );
}

function PremarketLedger({ report, movers }: { report: OpeningReport | null; movers: PremarketMovers | null }) {
  const gainers = [...(movers?.gappers_up ?? [])].sort((left, right) => right.pre_market_change_pct - left.pre_market_change_pct);
  const losers = [...(movers?.gappers_down ?? [])].sort((left, right) => left.pre_market_change_pct - right.pre_market_change_pct);
  if (gainers.length === 0 && losers.length === 0) return null;
  const reasons = new Map((report?.news ?? [])
    .filter((item) => item.ticker && item.tape_line)
    .map((item) => [item.ticker.toUpperCase(), item.tape_line!]));
  const renderRows = (rows: PremarketMovers["gappers_up"], tone: "up" | "down") => rows.map((row) => {
    const reason = reasons.get(row.ticker.toUpperCase());
    return (
      <Link key={row.instrument_id} href={`/stock/${row.ticker}`} className="grid grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_5.5rem] items-center gap-4 border-t border-outline-variant/70 px-4 py-3 first:border-t-0 hover:bg-surface-container-low sm:px-5">
        <span className="flex min-w-0 items-center gap-2.5"><StockLogo ticker={row.ticker} market="US" size={24} /><span className="min-w-0"><span className="block font-bold text-on-surface">{row.ticker}</span><span className="block truncate text-[10px] text-on-surface-variant">{row.name}</span></span></span>
        {reason ? <span className="min-w-0 line-clamp-2 text-[12px] leading-[1.45] text-on-surface-variant">{reason}</span> : <span aria-hidden />}
        <span className="text-right font-mono text-[12px] font-semibold" style={{ color: tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>{tone === "up" ? "▲" : "▼"} {Math.abs(row.pre_market_change_pct).toFixed(2)}%</span>
      </Link>
    );
  });

  return (
    <section className="mt-10">
      <div className="mb-4"><p className="landing-section-kicker text-landing-brand">All pre-market moves</p><h2 className="mt-1 text-xl font-bold tracking-tight text-on-surface">Gainers and losers before the open</h2></div>
      <div className="grid overflow-hidden rounded-xl border border-outline-variant bg-surface lg:grid-cols-2 lg:divide-x lg:divide-outline-variant">
        <div><div className="border-b border-outline-variant px-4 py-3 sm:px-5"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--signal-bullish)]">Gainers · {gainers.length}</span></div>{renderRows(gainers, "up")}</div>
        <div><div className="border-b border-outline-variant px-4 py-3 sm:px-5"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--signal-bearish)]">Losers · {losers.length}</span></div>{renderRows(losers, "down")}</div>
      </div>
    </section>
  );
}

function EarningsLedger({ recentEarnings, earnings }: { recentEarnings: RecentEarningsPick[]; earnings: EarningsPick[] }) {
  if (recentEarnings.length === 0 && earnings.length === 0) return <p className="pt-6 text-[13px] text-on-surface-variant">No earnings in the window.</p>;
  return (
    <div className="pt-6">
      {recentEarnings.length > 0 ? (
        <section>
          <div className="mb-3"><p className="landing-section-kicker text-landing-brand">Just reported</p><h2 className="mt-1 text-lg font-bold text-on-surface">What changed after results</h2></div>
          <div className="pulse-list-panel">
            {recentEarnings.map((item) => (
              <Link key={`${item.ticker}-${item.eventDate}`} href={`/earnings-intel/${encodeURIComponent(item.ticker)}`} className="pulse-list-row items-start">
                <StockLogo ticker={item.ticker} market="US" size={24} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-on-surface">{item.ticker}</span><span className="text-[11px] text-on-surface-variant">{item.company}</span></div><p className="mt-1 text-[13px] leading-snug text-on-surface-variant">{item.headline}</p></div>
                <div className="shrink-0 text-right"><p className="font-mono text-[10px] text-on-surface-variant">{fmtDate(item.eventDate)}</p>{item.epsTag ? <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={chipTone(item.epsTag)}>{EPS_LABEL[item.epsTag] ?? item.epsTag}</span> : null}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {earnings.length > 0 ? (
        <section className={recentEarnings.length > 0 ? "mt-8" : undefined}>
          <div className="mb-3"><p className="landing-section-kicker text-landing-brand">Next 7 days</p><h2 className="mt-1 text-lg font-bold text-on-surface">Upcoming reports</h2></div>
          <div className="pulse-list-panel">
            {earnings.map((item) => <Link key={`${item.ticker}-${item.eventDate}`} href={`/stock/${item.ticker}`} className="pulse-list-row"><StockLogo ticker={item.ticker} market="US" size={24} /><span className="w-14 shrink-0 font-bold text-on-surface">{item.ticker}</span><span className="hidden min-w-0 flex-1 truncate text-on-surface-variant sm:block">{item.company}</span><span className="ml-auto flex items-center gap-2"><span className="font-mono text-[10px] text-on-surface-variant">{fmtDate(item.eventDate)} · {item.time === "bmo" ? "before open" : item.time === "amc" ? "after close" : item.time}</span>{item.epsOutlook ? <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={chipTone(item.epsOutlook)}>{EPS_LABEL[item.epsOutlook] ?? item.epsOutlook}</span> : null}{item.reaction ? <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide" style={chipTone(item.reaction)}>{MOVE_LABEL[item.reaction] ?? item.reaction}</span> : null}</span></Link>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function PulseHub({
  items, sectors, reddit, earnings, recentEarnings, premarketMovers = null, premarketReport = null, marketPhase, marketRisk, interestingStocks = [], fullItemLimit, isSubscribed = false,
}: {
  items: ScannerItem[]; sectors: SectorCard[]; reddit: RedditPick[]; earnings: EarningsPick[]; recentEarnings: RecentEarningsPick[]; premarketMovers?: PremarketMovers | null; premarketReport?: OpeningReport | null; marketPhase?: string | null; marketRisk?: string | null; interestingStocks?: InterestingStockRow[]; fullItemLimit?: number; isSubscribed?: boolean;
}) {
  const [lens, setLens] = useState<Lens>("today");
  const showPremarket = Boolean(premarketMovers || premarketReport);

  return (
    <>
      <nav className="pulse-tabs" aria-label="Pulse views">{TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setLens(tab.id)} className={`pulse-tab ${lens === tab.id ? "pulse-tab-active" : ""}`}><AnimatedIcon name={tab.icon} size={17} className="pulse-tab-icon" aria-hidden />{tab.label}</button>)}</nav>
      {lens === "today" ? <div className="pt-6">
        {showPremarket ? <OpeningSetup report={premarketReport} movers={premarketMovers} marketPhase={marketPhase} marketRisk={marketRisk} /> : null}
        <MarketContext sectors={sectors} reddit={reddit} />
        {showPremarket ? <PremarketLedger report={premarketReport} movers={premarketMovers} /> : null}
      </div> : null}
      {lens === "moving" ? <div className="pt-6"><div className="mb-4"><p className="landing-section-kicker text-landing-brand">Moving now</p><h2 className="mt-1 text-xl font-bold tracking-tight text-on-surface">Stocks with a reason to open</h2></div>{items.length ? <MoversScanner items={items} detailed variant="pulse" showCount fullItemLimit={fullItemLimit} lockedPreviewCount={2} /> : <p className="text-[13px] text-on-surface-variant">No source-backed moves right now.</p>}</div> : null}
      {lens === "earnings" ? <EarningsLedger recentEarnings={recentEarnings} earnings={earnings} /> : null}
      {lens === "setups" ? <div className="pt-6"><div className="mb-4"><p className="landing-section-kicker text-landing-brand">Research queue</p><h2 className="mt-1 text-xl font-bold tracking-tight text-on-surface">Setups worth researching</h2></div><InterestingStocksFeed rows={interestingStocks} isSubscribed={isSubscribed} lockedPreviewCount={2} /></div> : null}
    </>
  );
}
