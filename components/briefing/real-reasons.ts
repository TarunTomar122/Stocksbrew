import { NO_CONFIRMED_REASON, type Briefing, type BriefingItem, type BriefingMarketMover } from "@/lib/briefing";
import { firstSentence } from "@/lib/briefing-read";
import { isCircularReason } from "@/lib/reason-quality";

/**
 * The briefing with every "confirmed" move reason that only says the move again ("Semiconductor rally drives SOXL
 * higher") turned back into a move with no reason (owner rules 7 and 8). Such a move then goes where every other
 * move without a reason goes: no read card, no reason line, a chip in "Also moved". The stored briefing is untouched;
 * this runs on what the page shows.
 */
export function withoutCircularReasons(briefing: Briefing): Briefing {
  let changed = false;
  const item = (entry: BriefingItem): BriefingItem => {
    if (entry.kind !== "price_move" || entry.reason_status !== "confirmed") return entry;
    if (!isCircularReason(firstSentence(entry.why), entry.ticker, entry.name)) return entry;
    changed = true;
    // The quote stays; the stories cited for the non-reason go with it.
    return { ...entry, why: NO_CONFIRMED_REASON, reason_status: "unconfirmed", evidence: entry.evidence.filter((source) => source.source === "Market quote") };
  };
  const mover = (entry: BriefingMarketMover): BriefingMarketMover => {
    if (entry.reason_status !== "confirmed" || !isCircularReason(entry.reason, entry.ticker, entry.name)) return entry;
    changed = true;
    return { ...entry, reason: "No confirmed reason yet", reason_status: "unconfirmed" };
  };
  const next: Briefing = {
    ...briefing,
    needs_you: briefing.needs_you.map(item),
    also_today: briefing.also_today.map(item),
    market: { ...briefing.market, gainers: briefing.market.gainers.map(mover), losers: briefing.market.losers.map(mover) },
  };
  return changed ? next : briefing;
}
