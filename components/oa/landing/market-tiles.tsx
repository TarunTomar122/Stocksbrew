import Link from "next/link";

import { Bar } from "@/components/oa/kit/skeleton";
import { StockLogo } from "@/components/stock-logo";
import { getAgentLog } from "@/lib/agent-log/server";
import { marketCheckTitle } from "@/lib/agent-log/words";
import { marketTiles } from "@/lib/landing-market-tiles";

/**
 * Under the hero: the day's check of the whole market as four figure tiles (a big figure, a few words, the stocks it
 * named as logos), each opening its evidence. From the jobs' own records (lib/agent-log), so the figures match the
 * briefing's rail. Nothing at all without at least two checks to show (owner rule 4).
 */

const GRID = "grid grid-cols-2 gap-2 sm:gap-3";

function signedPct(pct: number): string {
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

export async function MarketTiles({ className = "" }: { className?: string }) {
  const log = await getAgentLog();
  const tiles = marketTiles(log);
  if (!log || tiles.length === 0) return null;
  return (
    <section aria-label={marketCheckTitle(log)} className={className}>
      <h2 className="mb-3 text-[15px] font-medium text-oa-muted-fg">{marketCheckTitle(log)}</h2>
      <ul className={`${GRID} ${tiles.length === 4 ? "lg:grid-cols-4" : ""}`}>
        {tiles.map((tile) => (
          <li key={tile.source} className="min-w-0">
            <Link
              prefetch={false}
              href={tile.href}
              className="oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3 outline-none transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-fg/20 sm:px-4 sm:py-3.5"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[26px] font-medium leading-8 tracking-tight tabular-nums text-oa-fg sm:text-[30px] sm:leading-9">{tile.figure}</span>
                {tile.stocks.length > 0 ? (
                  <span className="flex shrink-0 -space-x-1.5 pt-1">
                    {tile.stocks.slice(0, 3).map((stock) => (
                      <StockLogo key={stock.ticker} ticker={stock.ticker} size={24} circle eager className="ring-2 ring-oa-card" />
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">{tile.label}</span>
              {tile.stocks.length === 1 && tile.stocks[0]!.pct != null ? (
                // The one stock the run named, with the move it measured.
                <span className="mt-1.5 text-[13px] leading-5 text-oa-muted-fg">
                  <span className="oa-mono font-semibold text-oa-fg">{tile.stocks[0]!.ticker}</span>{" "}
                  <span className={`tabular-nums ${tile.stocks[0]!.pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(tile.stocks[0]!.pct)}</span>
                </span>
              ) : tile.stocks.length > 0 ? (
                <span className="oa-mono mt-1.5 text-[13px] font-semibold leading-5 text-oa-fg">{tile.stocks.map((stock) => stock.ticker).join(", ")}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MarketTilesGhost({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <Bar className="mb-3 h-4 w-56" />
      <div className={`${GRID} lg:grid-cols-4`}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5">
            <Bar className="h-8 w-16" />
            <Bar className="mt-2 h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
