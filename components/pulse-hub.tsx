"use client";

import Link from "next/link";
import { useState } from "react";
import { StockLogo } from "@/components/stock-logo";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";

const CYAN = "#22d3ee";

export type SectorCard = { label: string; avg: number; stocks: { ticker: string; changePct: number }[] };
export type RedditPick = { ticker: string; sentiment: string; summary: string; mention_count?: number };
export type EarningsPick = { ticker: string; company: string; eventDate: string; time: string; epsEstimate: number | null; epsOutlook?: string; reaction?: string };

const EPS_LABEL: Record<string, string> = { beat: "EPS beat", inline: "EPS inline", miss: "EPS miss", unclear: "EPS unclear" };
const MOVE_LABEL: Record<string, string> = { rally: "bullish", fade: "bearish", chop: "neutral", unclear: "unclear" };
const epsColor = (o?: string) => (o === "beat" ? "var(--signal-bullish)" : o === "miss" ? "var(--signal-bearish)" : o === "inline" ? "#22d3ee" : "var(--on-surface-variant)");
const moveColor = (m?: string) => (m === "rally" ? "var(--signal-bullish)" : m === "fade" ? "var(--signal-bearish)" : m === "chop" ? "#22d3ee" : "var(--on-surface-variant)");
export type PulseTopline = {
  gainers: number;
  losers: number;
  lead?: { label: string; avg: number } | null;
  lag?: { label: string; avg: number } | null;
  crowd?: string | null;
};

type Lens = "movers" | "reddit" | "sectors" | "earnings";

const TIME_LABEL: Record<string, string> = { bmo: "before open", amc: "after close", during: "intraday" };
function fmtDate(d: string) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pctEl(v: number) {
  const up = v >= 0;
  return (
    <span style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

function sentimentColor(s: string) {
  return s === "bearish" ? "var(--signal-bearish)" : s === "bullish" ? "var(--signal-bullish)" : CYAN;
}

export function PulseHub({
  items,
  reddit,
  sectors,
  earnings,
  topline,
}: {
  items: ScannerItem[];
  reddit: RedditPick[];
  sectors: SectorCard[];
  earnings: EarningsPick[];
  topline: PulseTopline;
}) {
  const [lens, setLens] = useState<Lens>("movers");

  const tab = (k: Lens, label: string) => {
    const on = lens === k;
    return (
      <button
        type="button"
        onClick={() => setLens(k)}
        className="-mb-px border-b-2 px-4 py-2.5 font-mono text-[13px] transition-colors"
        style={on ? { borderColor: "var(--signal-bullish)", color: "var(--on-surface)" } : { borderColor: "transparent", color: "var(--on-surface-variant)" }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      {/* header + synthesized top-line */}
      <div className="mb-1 font-mono text-[12px]" style={{ color: CYAN }}>// market today</div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">The market, right now.</h1>
        <span className="mt-2 flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--signal-bullish)" }} /> live
        </span>
      </div>
      {topline.lead && (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-on-surface-variant">
          <b style={{ color: topline.lead.avg >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
            {topline.lead.avg >= 0 ? "Risk-on." : "Risk-off."}
          </b>{" "}
          {topline.lead.label} leading {pctEl(topline.lead.avg)}
          {topline.lag && <> , {topline.lag.label} lagging {pctEl(topline.lag.avg)}</>}.
        </p>
      )}

      {/* lens tabs */}
      <div className="mt-7 flex gap-1 border-b" style={{ borderColor: "var(--outline-variant)" }}>
        {tab("movers", "Movers")}
        {tab("reddit", "Reddit")}
        {tab("sectors", "Sectors")}
        {tab("earnings", "Earnings")}
      </div>

      {/* MOVERS */}
      {lens === "movers" && (
        <div className="pt-6">
          {items.length > 0 ? <MoversScanner items={items} detailed /> : <p className="font-mono text-[13px] text-on-surface-variant">No standout moves right now.</p>}
        </div>
      )}

      {/* REDDIT */}
      {lens === "reddit" && (
        <div className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {reddit.length > 0 ? (
            reddit.map((r) => (
              <div key={r.ticker} className="panel p-4">
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[12px]">
                  <StockLogo ticker={r.ticker} market="US" size={20} />
                  <Link href={`/stock/${r.ticker}`} className="font-bold text-on-surface hover:underline">{r.ticker}</Link>
                  {typeof r.mention_count === "number" && <span className="text-on-surface-variant">{r.mention_count} mentions</span>}
                  <span className="ml-auto rounded px-2 py-0.5 text-[10px]" style={{ color: sentimentColor(r.sentiment), background: `color-mix(in srgb, ${sentimentColor(r.sentiment)} 14%, transparent)` }}>{r.sentiment}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">{r.summary}</p>
              </div>
            ))
          ) : (
            <p className="font-mono text-[13px] text-on-surface-variant">No buzz scanned yet.</p>
          )}
        </div>
      )}

      {/* SECTORS */}
      {lens === "sectors" && (
        <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {sectors.map((s) => (
            <div key={s.label} className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[15px] font-semibold text-on-surface">{s.label}</span>
                <span className="font-mono text-[13px] font-bold">{pctEl(s.avg)}</span>
              </div>
              <div>
                {s.stocks.map((x) => (
                  <Link key={x.ticker} href={`/stock/${x.ticker}`} className="flex items-center gap-2.5 border-t py-2.5 first:border-t-0 hover:opacity-80" style={{ borderColor: "var(--outline-variant)" }}>
                    <StockLogo ticker={x.ticker} market="US" size={22} />
                    <span className="font-mono text-[13px] text-on-surface">{x.ticker}</span>
                    <span className="ml-auto font-mono text-[13px]">{pctEl(x.changePct)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* EARNINGS */}
      {lens === "earnings" && (
        <div className="pt-6">
          {earnings.length > 0 ? (
            <>
              <p className="mb-4 text-[13px] text-on-surface-variant">Upcoming reports. Open any name for our pre-earnings read, the EPS call and the likely reaction.</p>
              <div className="panel overflow-hidden">
                {earnings.map((e) => (
                  <Link key={`${e.ticker}-${e.eventDate}`} href={`/stock/${e.ticker}`} className="flex items-center gap-3 border-t px-5 py-3.5 font-mono text-[13px] transition-colors first:border-t-0 hover:bg-surface-container" style={{ borderColor: "var(--outline-variant)" }}>
                    <StockLogo ticker={e.ticker} market="US" size={24} />
                    <span className="w-16 font-bold text-on-surface">{e.ticker}</span>
                    <span className="hidden truncate text-on-surface-variant sm:block">{e.company}</span>
                    <span className="ml-auto flex items-center gap-3">
                      {e.epsOutlook && (
                        <span className="rounded px-2 py-0.5 text-[11px]" style={{ color: epsColor(e.epsOutlook), background: `color-mix(in srgb, ${epsColor(e.epsOutlook)} 14%, transparent)` }}>
                          {EPS_LABEL[e.epsOutlook] ?? e.epsOutlook}{e.reaction ? ` · ${MOVE_LABEL[e.reaction] ?? e.reaction}` : ""}
                        </span>
                      )}
                      {typeof e.epsEstimate === "number" && <span className="hidden text-on-surface-variant md:inline">est <span className="text-on-surface">${e.epsEstimate.toFixed(2)}</span></span>}
                      <span className="rounded px-2 py-0.5 text-[11px] text-on-surface-variant" style={{ background: "color-mix(in srgb, var(--on-surface) 6%, transparent)" }}>{fmtDate(e.eventDate)} · {TIME_LABEL[e.time] ?? e.time}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="font-mono text-[13px] text-on-surface-variant">No earnings in the window.</p>
          )}
        </div>
      )}
    </div>
  );
}
