import { NO_CONFIRMED_REASON, type Briefing, type BriefingItem, type BriefingMarketMover } from "@/lib/briefing";
import { firstSentence } from "@/lib/briefing-read";
import { shortCompanyName } from "@/lib/plain-copy";
import { isCircularReason } from "@/lib/reason-quality";

const FELL = /^(?:sinks?|sank|falls?|fell|drops?|dropped|slides?|slid|tumbles?|tumbled|plunges?|plunged|slumps?|slumped|sheds?|retreats?|retreated|declines?|declined)\b/i;
const ROSE = /^(?:jumps?|jumped|rises?|rose|soars?|soared|surges?|surged|rallies|rallied|climbs?|climbed|gains?|gained|pops?|popped|spikes?|spiked|advances?|advanced)\b/i;
/** A move this small either way says nothing about which way a headline's verb should go. */
const CONTRADICT_MIN_PCT = 1;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A reason whose headline leads with another stock on the same page moving the other way to that stock's own figure
 * there: "Nvidia stock sinks as …" on AMD's card while NVDA's card says +2.9% (judges, ship 42). Our own numbers
 * contradict it, so it is no confirmed reason for this page. Only the headline's subject counts, never a name
 * mentioned further on. Pure.
 */
export function contradictsPage(why: string, ticker: string, others: ReadonlyArray<{ ticker: string; name: string; pct: number | null }>): boolean {
  const head = firstSentence(why).trim();
  if (!head) return false;
  for (const other of others) {
    if (other.ticker === ticker || other.pct == null || Math.abs(other.pct) < CONTRADICT_MIN_PCT) continue;
    // The ticker only as written in capitals (ALL, NOW and ON are words too); the company name in any case.
    const names: Array<[string, string]> = [[other.ticker, ""], [shortCompanyName(other.name), "i"]];
    for (const [name, flags] of names) {
      if (!name || name.length < 2) continue;
      const subject = new RegExp(`^${escape(name)}(?:'s|’s)?(?:\\s+(?:stock|shares))?\\s+(.*)$`, flags).exec(head);
      if (!subject) continue;
      const verb = subject[1] ?? "";
      if ((other.pct > 0 && FELL.test(verb)) || (other.pct < 0 && ROSE.test(verb))) return true;
    }
  }
  return false;
}

/**
 * The briefing with every "confirmed" move reason that only says the move again ("Semiconductor rally drives SOXL
 * higher"), or that our own figures on the page contradict, turned back into a move with no reason (owner rules 7
 * and 8), and every story our figures contradict left out. Such a move then goes where every other
 * move without a reason goes: no read card, no reason line, a chip in "Also moved". The stored briefing is untouched;
 * this runs on what the page shows.
 */
export function withoutCircularReasons(briefing: Briefing): Briefing {
  let changed = false;
  // Every stock with a move of its own on the page, for a headline about one of them that our figure contradicts.
  const onPage = [...briefing.needs_you, ...briefing.also_today]
    .filter((entry) => entry.ticker && entry.day_change_pct != null)
    .map((entry) => ({ ticker: entry.ticker, name: entry.name ?? entry.ticker, pct: entry.day_change_pct }))
    .concat((briefing.quiet?.names ?? []).map((name) => ({ ticker: name.ticker, name: name.ticker, pct: name.day_change_pct })));
  const item = (entry: BriefingItem): BriefingItem => {
    if (entry.kind !== "price_move" || entry.reason_status !== "confirmed") return entry;
    if (!isCircularReason(firstSentence(entry.why), entry.ticker, entry.name) && !contradictsPage(entry.why, entry.ticker, onPage)) return entry;
    changed = true;
    // The quote stays; the stories cited for the non-reason go with it.
    return { ...entry, why: NO_CONFIRMED_REASON, reason_status: "unconfirmed", evidence: entry.evidence.filter((source) => source.source === "Market quote") };
  };
  const mover = (entry: BriefingMarketMover): BriefingMarketMover => {
    if (entry.reason_status !== "confirmed" || !isCircularReason(entry.reason, entry.ticker, entry.name)) return entry;
    changed = true;
    return { ...entry, reason: "No confirmed reason yet", reason_status: "unconfirmed" };
  };
  // A story whose headline says another stock on the page went the other way to our own figure for it ("Nvidia stock
  // sinks as …" on AMD's card while NVDA's says +2.9%, judges ship 42) is not this card's to tell: it is left out.
  const kept = (entry: BriefingItem): boolean => {
    if (entry.kind !== "news") return true;
    const title = entry.headline.replace(/^News on [^:]+:\s*/, "");
    if (!contradictsPage(title, entry.ticker, onPage)) return true;
    changed = true;
    return false;
  };
  const next: Briefing = {
    ...briefing,
    needs_you: briefing.needs_you.filter(kept).map(item),
    also_today: briefing.also_today.filter(kept).map(item),
    market: { ...briefing.market, gainers: briefing.market.gainers.map(mover), losers: briefing.market.losers.map(mover) },
  };
  return changed ? next : briefing;
}
