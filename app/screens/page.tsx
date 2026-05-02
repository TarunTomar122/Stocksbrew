import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { getCurrentMarket } from "@/lib/market";
import { getThematicScreens } from "@/lib/screens";
import type { ScreenMatchRow } from "@/lib/screens";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Screens · Tikrr",
  description:
    "Hand-picked thematic filters over Tikrr's four-pillar score — quality compounders, momentum leaders, oversold quality, and more.",
};

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top: {
    title: "Top Tikrr Score",
    subtitle: "Our house pick — the names with the best four-pillar composite right now.",
  },
  quality_compounders: {
    title: "Quality Compounders",
    subtitle: "Strong businesses built to grow year after year.",
  },
  cheap_growth: {
    title: "Growth at a Fair Price",
    subtitle: "Still growing fast, not priced for perfection yet.",
  },
  momentum_leaders: {
    title: "On a Tear",
    subtitle: "Leading the tape with the long-term trend intact.",
  },
  oversold_quality: {
    title: "Quality on Sale",
    subtitle: "Great businesses that just got marked down.",
  },
  near_52w_high: {
    title: "Near New Highs",
    subtitle: "Stocks within 3% of their 52-week peak.",
  },
  smart_money: {
    title: "Where the Pros Are",
    subtitle: "Heavy institutional ownership, solid overall scores.",
  },
};

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function PreviewRow({ row, market }: { row: ScreenMatchRow; market: "US" | "IN" }) {
  const change = row.day_change_pct;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  const tone = up
    ? "bg-[#ecfdf5] text-[#10b981]"
    : down
      ? "bg-[#fef2f2] text-[#ef4444]"
      : "bg-[#f3f4f6] text-[#6b7280]";

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-t border-[#f3f4f6]">
      <StockLogo ticker={row.ticker} market={market} size={28} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] font-semibold text-[#111111] truncate">
          {row.ticker}
        </span>
        <span className="text-[11px] text-[#6b7280] truncate">
          {row.name ?? row.sector ?? ""}
        </span>
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
      >
        {up ? "▲" : down ? "▼" : "•"} {fmtPct(change)}
      </span>
    </div>
  );
}

export default async function ScreensIndexPage() {
  const market = getCurrentMarket();
  const doc = await getThematicScreens(market);
  const screens = (doc?.screens ?? []).filter((s) => s.match_count > 0);

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        <header className="flex flex-col gap-3 max-w-[720px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Screens
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Opinionated filters, ranked by Tikrr score.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            Hand-picked themes layered over our four-pillar composite — valuation, growth, quality, momentum. Skip the screener; jump to the names that already match.
          </p>
          {doc && (
            <div className="flex items-center gap-3 mt-2 text-[12px] text-[#6b7280]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                {doc.coverage.intel_pro_docs} stocks scored
              </span>
              <span>·</span>
              <span>{screens.length} active screens</span>
            </div>
          )}
        </header>

        {screens.length === 0 ? (
          <div className="rounded-[24px] border border-[#e5e7eb] bg-white px-6 py-16 text-center">
            <h2 className="text-[18px] font-semibold text-[#111111]">
              No screens are populated yet.
            </h2>
            <p className="text-[14px] text-[#6b7280] mt-2 max-w-[480px] mx-auto">
              We&apos;re computing the latest scores. Check back in a few minutes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {screens.map((s) => {
              const copy = FRIENDLY_COPY[s.id] ?? {
                title: s.title,
                subtitle: s.tagline,
              };
              const isHouse = s.id === "tikrr_top";
              const top3 = s.matches.slice(0, 3);
              return (
                <Link
                  key={s.id}
                  href={`/screens/${encodeURIComponent(s.id)}?market=${market}`}
                  className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden hover:border-[#111111] transition-colors"
                >
                  <div className="px-5 pt-5 pb-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isHouse && (
                          <span className="text-[14px] text-[#7c3aed] leading-none">✦</span>
                        )}
                        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
                          {isHouse ? "House pick" : "Screen"}
                        </span>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#111111]">
                        {s.match_count} matches
                      </span>
                    </div>
                    <h2 className="text-[16px] font-semibold text-[#111111] tracking-[-0.01em]">
                      {copy.title}
                    </h2>
                    <p className="text-[13px] text-[#6b7280] leading-snug">
                      {copy.subtitle}
                    </p>
                  </div>
                  <div className="flex flex-col">
                    {top3.map((row) => (
                      <PreviewRow key={row.instrument_id} row={row} market={market} />
                    ))}
                  </div>
                  <div className="border-t border-[#f3f4f6] px-5 py-3 text-[13px] font-semibold text-[#0052ff]">
                    View all {s.match_count} matches →
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
