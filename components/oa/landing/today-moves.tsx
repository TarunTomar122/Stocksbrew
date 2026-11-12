import Link from "next/link";

import { loadDeskMovers, todayET } from "@/app/(app)/explore/desk-data";
import { signedPct, sourceTime } from "@/components/briefing/format";
import { StockCard, StockCardGrid, stockGridFill } from "@/components/briefing/stock-card";
import { oldestStamp } from "@/lib/quote-time";

import { SectionHead } from "./shared";

const ROWS = 3;
/**
 * Proof one: today's biggest moves with a confirmed reason, as stock cards (the logo and ticker, the move as the
 * one big figure, the reason in one sentence), the whole card opening the stock. They come from Market today's own
 * loader, so a stock shows the same move, the same reason and the same time here as there (the first three of its
 * cards), and the head links to the full list. The section renders its own head, so on a day with no confirmed
 * reason yet the whole section stays out instead of showing an empty strip (owner rules 4 and 7).
 */
export async function TodayMoves() {
  const movers = await loadDeskMovers(todayET());
  const rows = [...movers.up, ...movers.down]
    .filter((row) => row.reason)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, ROWS);
  if (rows.length === 0) return null;
  // The moves are live quotes (lib/daily-anomalies.ts re-prices the feed), so they carry the time they were priced
  // (the oldest of the three), the way Market today and the briefing date the same numbers.
  const pricedAt = sourceTime(oldestStamp(rows.map((row) => row.priceAsOf)));

  return (
    <section id="live" className="scroll-mt-24">
      <SectionHead
        title="Why stocks moved today."
        href="/explore#moves"
        hrefLabel="See every move today"
      />
      <StockCardGrid wide>
        {rows.map((row, index) => (
          <StockCard
            key={row.ticker}
            ticker={row.ticker}
            name={row.name || row.ticker}
            figure={signedPct(row.changePct, 1)}
            tone={row.changePct >= 0 ? "up" : "down"}
            sentence={row.reason}
            fill={stockGridFill(index, rows.length, true)}
            cover={
              <Link
                prefetch={false}
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                aria-label={`${row.ticker}: why it moved`}
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
