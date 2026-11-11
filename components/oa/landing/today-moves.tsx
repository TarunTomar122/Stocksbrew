import { StockLogo } from "@/components/stock-logo";
import { getLandingAnomalies } from "@/components/terminal-landing-streams";
import { moveReason } from "@/lib/briefing";
import { shortCompanyName } from "@/lib/plain-copy";

import { heroTicker } from "./hero-briefing";
import { ChangeText } from "./shared";
import { moveLine } from "./track-grid";

const ROWS = 3;
// A line that only restates the move: "moved sharply today", "surged 9% today", "rebounds sharply with little news",
// "reverses sharply after a 59% earlier gain". Anchored to the end, so "Zeta rose 12% after earnings" still passes.
const NO_REASON =
  /\b(?:moved sharply|is (?:up|down) [\d.]+%|(?:rose|fell|jumped|dropped|climbed|surged|slid|sank|gained|tumbled|soared|plunged) [\d.]+%)(?: today)?\.?$|\bwith little news\.?$|\breverses sharply after (?:an? )?[\d.]+% (?:earlier )?(?:gain|drop|fall|rise)\.?$/i;

/**
 * Proof one: today's biggest moves with a confirmed reason, each in one sentence
 * with a bar for the size of the move. The hero's stock is left out so the
 * page never says the same thing twice. On a day with no confirmed reason
 * yet it says so in one line instead of showing an empty card.
 */
export async function TodayMoves() {
  const [anomalies, skip] = await Promise.all([getLandingAnomalies().catch(() => []), heroTicker()]);
  const rows = anomalies
    // Confirmed reasons only, by the briefing's own rule (sources, and a cause that is more than the price action),
    // so "moved sharply today" or "reverses after an earlier gain" never passes for a reason here.
    .filter((item) => moveReason(item).status === "confirmed" && Number.isFinite(item.day_change_pct) && item.ticker?.toUpperCase() !== skip)
    // The feed still marks a few bare price notes as confirmed; a sentence that only restates the move is not a reason.
    .filter((item) => !NO_REASON.test(moveLine(item)))
    .sort((a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct))
    .slice(0, ROWS);
  if (rows.length === 0) {
    return (
      <p className="oa-surface border border-oa-border bg-oa-card px-4 py-4 text-[15px] leading-6 text-oa-muted-fg sm:px-5">
        The briefing lists every big move of the day as we check it.
      </p>
    );
  }

  return (
    <ul className="oa-surface divide-y divide-oa-border overflow-hidden border border-oa-border bg-oa-card">
      {rows.map((item) => {
        return (
          <li key={item.instrument_id}>
            <a
              href={`/stock/${item.ticker}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-4 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[minmax(0,1fr)_6rem] sm:px-5"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[15px] leading-6">
                  <StockLogo ticker={item.ticker} size={22} circle />
                  <span className="font-medium text-oa-fg">{shortCompanyName(item.name) || item.ticker}</span>
                  <span className="oa-mono text-[13px] text-oa-muted-fg">{item.ticker}</span>
                </span>
                <span className="mt-1 block text-pretty text-[15px] leading-6 text-oa-fg/85">{moveLine(item)}</span>
              </span>
              {/* The move as a number only, no size bar (owner, Nov 11). */}
              <span className="flex flex-col items-end justify-start pt-0.5">
                <ChangeText pct={item.day_change_pct} className="text-[15px] font-medium" />
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
