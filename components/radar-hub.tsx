"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";

const CYAN = "#22d3ee";
const STANCE: Record<string, string> = {
  accumulate: "var(--signal-bullish)",
  trim: "var(--signal-neutral)",
  hold: CYAN,
  watch: CYAN,
  avoid: "var(--signal-bearish)",
};
const ACTIONABLE = new Set(["accumulate", "trim", "avoid"]);

export type RadarCall = {
  ticker: string;
  name?: string;
  logoUrl?: string | null;
  market: "US" | "IN";
  price: number | null;
  changePct: number | null;
  stance: string;
  action?: string;
  trigger?: string;
  covered: boolean;
};
export type RadarChange = { ticker: string; tone: "up" | "down" | "neutral"; text: string };
export type RadarSector = { label: string; pct: number };
export type RadarFactor = { label: string; score: number };
export type RadarSuggestion = { ticker: string; name?: string; reason?: string; market: "US" | "IN" };

function chg(v: number | null) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const up = v >= 0;
  return (
    <span className="font-mono text-[14px] tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}
const money = (v: number | null) => (typeof v === "number" ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

function CallRow({ c }: { c: RadarCall }) {
  const col = STANCE[c.stance?.toLowerCase()] ?? CYAN;
  return (
    <Link href={`/stock/${c.ticker}`} className="block border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-surface-container" style={{ borderColor: "var(--outline-variant)" }}>
      <div className="flex items-center gap-3 font-mono text-[13px]">
        <StockLogo ticker={c.ticker} logoUrl={c.logoUrl} market={c.market} size={24} />
        <span className="font-bold text-on-surface">{c.ticker}</span>
        {c.name && <span className="truncate text-on-surface-variant">{c.name}</span>}
        <span className="ml-auto flex min-w-[118px] flex-col items-end gap-1">
          <span className="text-[18px] leading-none text-on-surface tabular-nums">${money(c.price)}</span>
          {chg(c.changePct)}
        </span>
      </div>
      {c.covered ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[15px] font-bold uppercase" style={{ color: col }}>{c.stance}</span>
          {c.action && <span className="text-[13px] text-on-surface-variant">{c.action}</span>}
          {c.trigger && <span className="ml-auto font-mono text-[11px] text-on-surface-variant">🔔 {c.trigger}</span>}
        </div>
      ) : (
        <p className="mt-1.5 font-mono text-[12px] text-on-surface-variant">researching this name…</p>
      )}
    </Link>
  );
}

function CallTabs({ holdings, watching }: { holdings: RadarCall[]; watching: RadarCall[] }) {
  const tabs = [
    { key: "holdings", label: "holdings", calls: holdings },
    { key: "watching", label: "watching", calls: watching },
  ].filter((t) => t.calls.length > 0);
  const [active, setActive] = useState(tabs[0]?.key ?? "holdings");
  if (tabs.length === 0) return null;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const scroll = current.calls.length > 7;
  return (
    <div className="mt-7">
      <div className="mb-2 flex items-center gap-2">
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className="rounded px-3 py-1 font-mono text-[12px] transition-colors"
              style={
                on
                  ? { background: "color-mix(in srgb, var(--signal-bullish) 14%, transparent)", color: "var(--signal-bullish)" }
                  : { color: "var(--on-surface-variant)" }
              }
            >
              {t.label} <span className="opacity-60">{t.calls.length}</span>
            </button>
          );
        })}
      </div>
      <div className={`panel overflow-hidden ${scroll ? "max-h-[520px] overflow-y-auto" : ""}`}>
        {current.calls.map((c) => <CallRow key={c.ticker} c={c} />)}
      </div>
    </div>
  );
}

export function RadarHub({
  flagged,
  total,
  lead,
  holdings,
  watching,
  suggestions,
  changed,
  sectors,
  factors,
  regime,
  isSubscribed,
  atLimit,
  builtLabel,
}: {
  flagged: number;
  total: number;
  lead?: { ticker: string; stance: string; chg: number | null } | null;
  holdings: RadarCall[];
  watching: RadarCall[];
  suggestions: RadarSuggestion[];
  changed: RadarChange[];
  sectors: RadarSector[];
  factors: RadarFactor[];
  regime?: string | null;
  isSubscribed: boolean;
  atLimit: boolean;
  builtLabel?: string;
}) {
  const hasBook = sectors.length > 0 || factors.length > 0 || Boolean(regime);
  const leadCol = lead ? STANCE[lead.stance?.toLowerCase()] ?? CYAN : CYAN;
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10">
      {/* TOP-LINE */}
      <div className="flex items-center gap-3">
        <div className="font-mono text-[12px]" style={{ color: CYAN }}>// your radar</div>
        {!isSubscribed && (
          <Link href="/subscribe" className="ml-auto rounded px-2 py-1 font-mono text-[11px]" style={{ background: "color-mix(in srgb, var(--signal-neutral) 16%, transparent)", color: "var(--signal-neutral)" }}>FREE · {total}/3</Link>
        )}
      </div>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">The market, on your stocks.</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-on-surface-variant">
        {flagged > 0 ? (
          <>
            <b className="text-on-surface">{flagged} {flagged === 1 ? "name needs" : "names need"} a look today.</b>
            {lead && (
              <> {lead.ticker} is <b style={{ color: leadCol }}>{lead.stance}</b>{typeof lead.chg === "number" ? <> ({lead.chg >= 0 ? "▲" : "▼"}{Math.abs(lead.chg).toFixed(1)}%)</> : null}.</>
            )}
          </>
        ) : (
          <>Tracking {total} {total === 1 ? "name" : "names"}. Nothing needs action today{builtLabel ? ` · refreshed ${builtLabel}` : ""}.</>
        )}
      </p>

      {/* THE CALLS — one table, holdings/watching tabs */}
      <CallTabs holdings={holdings} watching={watching} />

      {/* SUGGESTIONS */}
      {suggestions.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 font-mono text-[12px] text-on-surface-variant"><span style={{ color: "var(--signal-bullish)" }}>$</span> stocks worth watching</div>
          <div className="panel overflow-hidden">
            {suggestions.slice(0, 6).map((s) => (
              <Link key={s.ticker} href={`/stock/${s.ticker}`} className="flex items-center gap-3 border-t px-5 py-3 font-mono text-[13px] transition-colors first:border-t-0 hover:bg-surface-container" style={{ borderColor: "var(--outline-variant)" }}>
                <StockLogo ticker={s.ticker} market={s.market} size={22} />
                <span className="w-16 font-bold text-on-surface">{s.ticker}</span>
                <span className="truncate text-on-surface-variant">{s.reason || s.name}</span>
                <span className="ml-auto whitespace-nowrap rounded px-2 py-0.5 text-[11px]" style={{ background: "color-mix(in srgb, var(--signal-bullish) 14%, transparent)", color: "var(--signal-bullish)" }}>+ track</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* WHAT CHANGED */}
      {changed.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 font-mono text-[12px] text-on-surface-variant"><span style={{ color: "var(--signal-bullish)" }}>$</span> what changed</div>
          <div className="panel p-1.5">
            {changed.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 font-mono text-[13px]">
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: e.tone === "down" ? "var(--signal-bearish)" : e.tone === "up" ? "var(--signal-bullish)" : CYAN }} />
                <span className="w-14 font-bold text-on-surface">{e.ticker}</span>
                <span className="text-on-surface-variant">{e.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WHOLE BOOK */}
      {hasBook && (
        <div className="mt-8">
          <div className="mb-2 font-mono text-[12px] text-on-surface-variant">
            <span style={{ color: "var(--signal-bullish)" }}>$</span> your whole book{!isSubscribed && <span className="text-on-surface-variant"> · Pro</span>}
          </div>
          <div className="relative">
            <div className={`grid gap-3 sm:grid-cols-3 ${isSubscribed ? "" : "pointer-events-none select-none blur-[6px]"}`}>
              {/* SECTOR EXPOSURE — bars + concentration flag */}
              <div className="panel p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">sector exposure</p>
                <div className="space-y-2.5 font-mono text-[12px]">
                  {sectors.slice(0, 5).map((s) => {
                    const hot = s.pct >= 40;
                    return (
                      <div key={s.label}>
                        <div className="flex justify-between">
                          <span className="truncate text-on-surface-variant">{s.label}</span>
                          <span style={{ color: hot ? "var(--signal-neutral)" : "var(--on-surface)" }}>{Math.round(s.pct)}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--surface-container-highest)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct)}%`, background: hot ? "var(--signal-neutral)" : "var(--signal-bullish)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sectors[0] && sectors[0].pct >= 40 && (
                  <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--signal-neutral)" }}>⚠ {Math.round(sectors[0].pct)}% in {sectors[0].label} — concentrated</p>
                )}
              </div>
              {/* FACTOR TILT — scored bars */}
              <div className="panel p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">factor tilt</p>
                <div className="space-y-2.5 font-mono text-[12px]">
                  {factors.map((f) => {
                    const col = f.score >= 70 ? "var(--signal-bullish)" : f.score <= 40 ? "var(--signal-bearish)" : "var(--on-surface)";
                    return (
                      <div key={f.label}>
                        <div className="flex justify-between">
                          <span className="capitalize text-on-surface-variant">{f.label}</span>
                          <span style={{ color: col }}>{f.score >= 70 ? "high" : f.score <= 40 ? "low" : "mid"} · {Math.round(f.score)}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--surface-container-highest)" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(4, f.score))}%`, background: col }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* REGIME READ */}
              <div className="panel p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">regime read</p>
                <p className="text-[13px] leading-relaxed text-on-surface-variant">{regime || "Risk-on tape; your tilt is in favor. Watch sector concentration."}</p>
                {factors.length > 0 && (
                  <p className="mt-3 border-t pt-3 font-mono text-[11px] text-on-surface-variant" style={{ borderColor: "var(--outline-variant)" }}>
                    leaning <b className="text-on-surface">{[...factors].sort((a, b) => b.score - a.score)[0]?.label}</b>, light on <b className="text-on-surface">{[...factors].sort((a, b) => a.score - b.score)[0]?.label}</b>
                  </p>
                )}
              </div>
            </div>
            {!isSubscribed && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: "color-mix(in srgb, var(--background) 55%, transparent)" }}>
                <div className="panel max-w-sm p-6 text-center" style={{ boxShadow: "0 8px 40px rgba(0,0,0,.4), inset 0 0 0 1px color-mix(in srgb, var(--signal-bullish) 25%, transparent)" }}>
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-widest" style={{ color: "var(--signal-bullish)" }}>🔒 whole book · Pro</p>
                  <p className="text-[15px] font-semibold text-on-surface">See your whole book, not one stock at a time.</p>
                  <p className="mt-1.5 text-[13px] text-on-surface-variant">Sector exposure, factor tilt, regime fit and rebalance, across everything you hold.</p>
                  <Link href="/subscribe" className="mt-4 inline-block rounded px-5 py-2.5 font-mono text-[13px] font-bold" style={{ background: "var(--signal-bullish)", color: "var(--background)" }}>unlock your whole book →</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CAP */}
      {!isSubscribed && (
        <div className="mt-8 panel flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-[15px] font-semibold text-on-surface">{atLimit ? "You're at your 3-stock limit." : `You're watching ${total} of your stocks.`}</p>
            <p className="mt-0.5 text-[13px] text-on-surface-variant">Add your whole book and get pinged the moment any of them moves 4%+.</p>
          </div>
          <Link href="/subscribe" className="whitespace-nowrap rounded px-5 py-2.5 font-mono text-[13px] font-bold" style={{ background: "var(--signal-bullish)", color: "var(--background)" }}>track everything →</Link>
        </div>
      )}
    </div>
  );
}
