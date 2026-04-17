"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Stock } from "@/lib/api-types";
import type { DeltaCard, DeltaCardKind, DeltaCardPriority } from "@/lib/delta-cards";

import { PillRow } from "./pill-row";
import { DashboardCard, formatCurrency, formatPct, formatPctCompact, pctClass, sparkColor } from "./primitives";
import { Sparkline } from "./sparkline";

/* ══════════════════════════════════════════════════
   SIGNAL BOARD  — replaces the text list entirely
   Top: stat chips by signal type
   Middle: portfolio-level banners (narrative/blind spot) — compact, no body
   Bottom: per-stock signal tiles — sparkline + badge, NO body text
   ══════════════════════════════════════════════════ */

const KIND_LABELS: Record<DeltaCardKind | "all", string> = {
  all: "All",
  catalyst_shift: "Catalyst",
  price_move: "Price",
  earnings: "Earnings",
  technical: "Streak",
  news_sentiment: "News",
  blind_spot: "Blind spot",
  thesis_update: "Thesis",
  portfolio_narrative: "Summary",
};

const KIND_COLOR: Record<DeltaCardKind, string> = {
  catalyst_shift: "#D4AF37",
  price_move:     "#F59E0B",
  earnings:       "#818CF8",
  technical:      "#22D3EE",
  news_sentiment: "#94A3B8",
  blind_spot:     "#FB7185",
  thesis_update:  "#A78BFA",
  portfolio_narrative: "#8C94A8",
};

const PRIORITY_DOT: Record<DeltaCardPriority, string> = {
  high:   "bg-[#EF4444]",
  medium: "bg-[#D4AF37]",
  low:    "bg-[#555E75]",
};

type FilterId = DeltaCardKind | "all";

export function WhatsNewCard({
  cards,
  stockMap,
}: {
  cards: DeltaCard[];
  stockMap?: Map<string, Stock>;
}) {
  const [filter, setFilter] = useState<FilterId>("all");

  // Split portfolio-level cards from stock-level cards
  const portfolioCards = cards.filter(
    (c) => c.entity.kind === "portfolio" || c.entity.kind === "market",
  );
  const stockCards = cards.filter(
    (c) => c.entity.kind === "stock" || c.entity.kind === "sector",
  );

  // Build kind counts from stock cards only (portfolio gets its own lane)
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: stockCards.length };
    stockCards.forEach((c) => { counts[c.kind] = (counts[c.kind] ?? 0) + 1; });
    return counts;
  }, [stockCards]);

  const filterPills = useMemo(() => {
    const kinds = Array.from(new Set(stockCards.map((c) => c.kind)));
    const ordered = [{ id: "all", label: "All", count: kindCounts.all }];
    kinds.forEach((k) => {
      if (!kindCounts[k]) return;
      ordered.push({ id: k, label: KIND_LABELS[k as DeltaCardKind] ?? k, count: kindCounts[k] });
    });
    return ordered;
  }, [stockCards, kindCounts]);

  const visibleStock = useMemo(
    () => filter === "all" ? stockCards : stockCards.filter((c) => c.kind === filter),
    [stockCards, filter],
  );

  const totalCount = cards.length;

  return (
    <DashboardCard
      title="What's new"
      eyebrow={`${totalCount} signal${totalCount === 1 ? "" : "s"} since yesterday`}
      rightSlot={
        filterPills.length > 1 ? (
          <PillRow
            pills={filterPills}
            activeId={filter}
            onSelect={(id) => setFilter(id as FilterId)}
            size="sm"
          />
        ) : null
      }
      padding="none"
    >
      {/* ── Portfolio-level banners (compact, no body text) ── */}
      {portfolioCards.length > 0 && (
        <div className="flex flex-col divide-y divide-[#1F2738] border-b border-[#252E42]">
          {portfolioCards.map((card) => (
            <PortfolioBanner key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* ── Per-stock signal tiles grid ── */}
      {visibleStock.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-[#8C94A8]">
          No signals in this category.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-[#1F2738] sm:grid-cols-2">
          {visibleStock.map((card) => {
            const stock = stockMap?.get(card.entity.label.toUpperCase());
            return (
              <SignalTile key={card.id} card={card} stock={stock} />
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

/* ── Compact portfolio banner — just the headline, no body ── */
function PortfolioBanner({ card }: { card: DeltaCard }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[card.priority]}`} />
      <span
        className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
        style={{
          color: KIND_COLOR[card.kind],
          background: `${KIND_COLOR[card.kind]}18`,
        }}
      >
        {KIND_LABELS[card.kind]}
      </span>
      <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#F5F6F8]/80">
        {card.title}
      </p>
    </div>
  );
}

/* ── Stock signal tile — sparkline + signal badge, no body text ── */
function SignalTile({ card, stock }: { card: DeltaCard; stock?: Stock }) {
  const closes = stock?.recentCloses && stock.recentCloses.length >= 2
    ? stock.recentCloses
    : stock
      ? [stock.price.previousClose, stock.price.open || stock.price.previousClose, stock.price.current]
      : null;
  const tone = stock ? sparkColor(stock.price.changePct) : "neutral";
  const kindColor = KIND_COLOR[card.kind];

  const inner = (
    <div className="flex flex-col gap-2.5 bg-[#141A26] p-4 transition-colors hover:bg-[#1A2130]">
      {/* Top row: symbol + priority dot + kind badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[card.priority]}`} />
          <span className="text-[13px] font-bold text-[#F5F6F8]">{card.entity.label}</span>
        </div>
        <span
          className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: kindColor, background: `${kindColor}18` }}
        >
          {KIND_LABELS[card.kind]}
        </span>
      </div>

      {/* Middle: sparkline */}
      {closes ? (
        <div className="h-10">
          <Sparkline values={closes} tone={tone} height={40} strokeWidth={1.6} />
        </div>
      ) : (
        <div className="h-10" />
      )}

      {/* Bottom: signal headline + price change */}
      <div className="flex items-end justify-between gap-2">
        <p className="flex-1 text-[11px] font-medium leading-tight text-[#F5F6F8]/70" style={{ maxWidth: "70%" }}>
          {card.title}
        </p>
        {stock && (
          <div className="flex flex-col items-end shrink-0">
            <span className="font-mono text-[12px] font-semibold tabular-nums text-[#F5F6F8]">
              {formatCurrency(stock.price.current, stock.currency)}
            </span>
            <span className={`font-mono text-[10px] tabular-nums ${pctClass(stock.price.changePct)}`}>
              {formatPctCompact(stock.price.changePct)}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (card.href) {
    return <Link href={card.href} className="block">{inner}</Link>;
  }
  return inner;
}

/* ══════════════════════════════════════════════════
   MOVERS BAR CHART  — horizontal bar chart, biggest moves at top
   ══════════════════════════════════════════════════ */

type MoverTab = "gainers" | "losers" | "active";

export function TodaysMoversCard({
  stocks,
  market,
}: {
  stocks: Stock[];
  market: "us" | "india";
}) {
  const [tab, setTab] = useState<MoverTab>("gainers");

  const sorted = useMemo(() => {
    const copy = [...stocks];
    if (tab === "gainers") {
      return copy.filter((s) => s.price.changePct > 0).sort((a, b) => b.price.changePct - a.price.changePct);
    }
    if (tab === "losers") {
      return copy.filter((s) => s.price.changePct < 0).sort((a, b) => a.price.changePct - b.price.changePct);
    }
    return copy.sort((a, b) => {
      if (a.price.volume && b.price.volume) return b.price.volume - a.price.volume;
      return Math.abs(b.price.changePct) - Math.abs(a.price.changePct);
    });
  }, [stocks, tab]);

  const rows = sorted.slice(0, 7);
  const maxAbs = Math.max(...rows.map((s) => Math.abs(s.price.changePct)), 0.01);

  const pills = [
    { id: "gainers", label: "Gainers" },
    { id: "losers", label: "Losers" },
    { id: "active", label: "Most active" },
  ];

  return (
    <DashboardCard
      title="Today's movers"
      eyebrow="Your watchlist"
      rightSlot={
        <PillRow pills={pills} activeId={tab} onSelect={(id) => setTab(id as MoverTab)} size="sm" />
      }
    >
      {rows.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[#8C94A8]">
          {tab === "gainers" ? "No gainers today." : tab === "losers" ? "No losers today." : "No data."}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((s) => {
            const barPct = (Math.abs(s.price.changePct) / maxAbs) * 100;
            const isUp = s.price.changePct >= 0;
            const barColor = isUp ? "bg-[#22C55E]" : "bg-[#EF4444]";

            return (
              <Link
                key={s.symbol}
                href={`/stock/${encodeURIComponent(s.symbol)}?market=${market}`}
                className="group flex items-center gap-3 transition-opacity hover:opacity-80"
              >
                {/* symbol */}
                <span className="w-12 shrink-0 text-[12px] font-semibold text-[#F5F6F8]">{s.symbol}</span>

                {/* bar */}
                <div className="relative flex-1">
                  <div className="h-5 overflow-hidden rounded-[4px] bg-[#1A2130]">
                    <div
                      className={`h-full rounded-[4px] transition-all ${barColor}`}
                      style={{
                        width: `${barPct}%`,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  {/* price label inside or beside bar */}
                  <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] tabular-nums text-[#F5F6F8]/70">
                    {formatCurrency(s.price.current, s.currency)}
                  </span>
                </div>

                {/* pct */}
                <span
                  className={`w-14 shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums ${pctClass(s.price.changePct)}`}
                >
                  {formatPct(s.price.changePct)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
