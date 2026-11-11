import Link from "next/link";

import { sourceTime } from "@/components/briefing/format";
import { StockCard, StockCardGrid, stockGridFill } from "@/components/briefing/stock-card";
import { getLandingAnomalies } from "@/components/landing-data";
import { moveReason } from "@/lib/briefing";
import { oldestStamp } from "@/lib/quote-time";
import { isCircularReason } from "@/lib/reason-quality";

import { SectionHead } from "./shared";
import { moveLine } from "./track-grid";

const ROWS = 3;
/**
 * Proof one: today's biggest moves with a confirmed reason, as stock cards (the logo and ticker, the move as the
 * one big figure, the reason in one sentence), the whole card opening the stock. The section renders its own head, so on a day with no confirmed
 * reason yet the whole section stays out instead of showing an empty strip (owner rules 4 and 7).
 */
export async function TodayMoves() {
  const anomalies = await getLandingAnomalies().catch(() => []);
  const rows = anomalies
    // Confirmed reasons only, by the briefing's own rule (sources, and a cause that is more than the price action),
    // so "moved sharply today" or "reverses after an earlier gain" never passes for a reason here.
    .filter((item) => moveReason(item).status === "confirmed" && Number.isFinite(item.day_change_pct))
    // The feed still marks a few bare price notes as confirmed; a sentence that only restates the move ("moved
    // sharply today", "semiconductor rally drives SOXL higher") names no cause, so it is not a reason.
    .filter((item) => !isCircularReason(moveLine(item), item.ticker, item.name))
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
    .slice(0, ROWS);
  if (rows.length === 0) return null;
  // The moves are live quotes (lib/daily-anomalies.ts re-prices the feed), so they carry the time they were priced
  // (the oldest of the three), the way the briefing dates the same numbers.
  const pricedAt = sourceTime(oldestStamp(rows.map((item) => item.price_as_of)));

  return (
    <section id="live" className="scroll-mt-24">
      <SectionHead
        title="Why stocks moved today."
        lede="Every market day we look for the reason behind each big move, and show it only when a source backs it."
        href="/briefing"
        hrefLabel="See today's briefing"
      />
      <StockCardGrid wide>
        {rows.map((item, index) => (
          <StockCard
            key={item.instrument_id}
            ticker={item.ticker}
            name={item.name || item.ticker}
            figure={signedPct(item.day_change_pct)}
            tone={item.day_change_pct >= 0 ? "up" : "down"}
            sentence={fullStop(moveLine(item))}
            fill={stockGridFill(index, rows.length, true)}
            cover={
              <Link
                prefetch={false}
                href={`/stock/${encodeURIComponent(item.ticker)}`}
                aria-label={`${item.ticker}: why it moved`}
                className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
              />
            }
          />
        ))}
      </StockCardGrid>
      {pricedAt ? <p className="mt-3 text-[13px] text-oa-muted-fg">As of {pricedAt}</p> : null}
    </section>
  );
}

/** The reason as a whole sentence: "CoreWeave raises its forecast as AI demand and capacity strengthen." */
function fullStop(text: string): string {
  const value = text.trim();
  return !value || /[.!?…"”)]$/.test(value) ? value : `${value}.`;
}

/** "+16.5%", "−3.1%": the card's figure, with a real minus sign. */
function signedPct(value: number): string {
  const shown = Number(value.toFixed(1));
  return `${shown > 0 ? "+" : shown < 0 ? "\u2212" : ""}${Math.abs(shown).toFixed(1)}%`;
}
