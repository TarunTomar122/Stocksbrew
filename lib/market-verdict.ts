/**
 * Is this good or bad for stocks right now? One plain verdict per "More markets" card on Market today (owner, Nov 12:
 * "all i wanted to know was if this is good or bad for the market"). Every verdict comes from a fixed rule over a
 * number we have; with the number missing there is no verdict, never a guess.
 *
 * The rules and their thresholds:
 * - VIX (the market's fear gauge): under 15 is good (calm), 15 to 25 is neutral, over 25 is bad (fear).
 * - The 10-year Treasury yield against a month ago: down more than 0.05 points is good (cheaper borrowing), up more
 *   than 0.05 points is bad, in between is neutral.
 * - The equity put/call ratio against its 20-day average: 0.03 or more below is good (traders bet on a rise), 0.03 or
 *   more above is bad (traders paid for protection), in between is neutral.
 * - Gold over the past month: up 5% or more is bad (money looking for safety), anything else is neutral.
 * - The dollar index at (within 1% of the range from) its one-year high is mildly bad (it shrinks big US companies'
 *   overseas sales); anything else is neutral.
 * - Fed odds on a prediction market: a hike is bad, a cut is good, no change is neutral. Other markets get no verdict.
 * - A day's move, where a page shows the day's change rather than the level (the briefing's strip): the 10-year yield up
 *   more than 0.02 points (2 bps) is bad and down as much is good; the VIX up more than 1% is bad and down as much is
 *   good; anything smaller is neutral. A rising yield or a rising VIX is never read as good, whatever the month did.
 * - What moved: of the stock indexes and funds among the biggest moves across markets, 70% or more gains is good,
 *   30% or less is bad, else neutral (three or more of them, or no verdict).
 */

export type Verdict = "good" | "bad" | "neutral";

export type VerdictLine = { verdict: Verdict; why: string };

export const VIX_CALM = 15;
export const VIX_FEAR = 25;
/** Percentage points the 10-year yield must move over the month to count. */
export const YIELD_FLAT = 0.05;
/** Percentage points the 10-year yield must move in a day to count (2 bps). */
export const YIELD_DAY_FLAT = 0.02;
/** Percent the VIX must move in a day to count. */
export const VIX_DAY_FLAT = 1;
/** How far the put/call ratio must sit from its usual level to count. */
export const PUT_CALL_FLAT = 0.03;
/** Gold's one-month gain that reads as a rush to safety, percent. */
export const GOLD_SURGE = 5;
/** Share of the biggest moves that must be gains (or losses) for a clear day. */
export const MOVES_CLEAR = 0.7;

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export function vixVerdict(vix: number | null | undefined): VerdictLine | null {
  if (!finite(vix) || vix <= 0) return null;
  if (vix < VIX_CALM) return { verdict: "good", why: "Calm: swings smaller than usual." };
  if (vix > VIX_FEAR) return { verdict: "bad", why: "Fearful: traders expect big swings." };
  return { verdict: "neutral", why: "Normal swings expected." };
}

/** `change` is today's yield minus a month ago's, in percentage points. */
export function yieldVerdict(change: number | null | undefined): VerdictLine | null {
  if (!finite(change)) return null;
  if (change < -YIELD_FLAT) return { verdict: "good", why: "Lower than a month ago: cheaper borrowing." };
  if (change > YIELD_FLAT) return { verdict: "bad", why: "Higher than a month ago: costlier borrowing." };
  return { verdict: "neutral", why: "About where it was a month ago." };
}

/** `change` is the yield's move over the day, in percentage points: a rise makes borrowing dearer, so it is bad for stocks. */
export function yieldDayVerdict(change: number | null | undefined): VerdictLine | null {
  if (!finite(change)) return null;
  if (change < -YIELD_DAY_FLAT) return { verdict: "good", why: "Yields fell today: cheaper borrowing." };
  if (change > YIELD_DAY_FLAT) return { verdict: "bad", why: "Yields rose today: costlier borrowing." };
  return { verdict: "neutral", why: "Yields barely moved today." };
}

/** `changePct` is the VIX's move over the day, percent: a rising fear gauge is bad for stocks. */
export function vixDayVerdict(changePct: number | null | undefined): VerdictLine | null {
  if (!finite(changePct)) return null;
  if (changePct < -VIX_DAY_FLAT) return { verdict: "good", why: "Fear eased today." };
  if (changePct > VIX_DAY_FLAT) return { verdict: "bad", why: "Fear rose today." };
  return { verdict: "neutral", why: "Fear barely moved today." };
}

export function putCallVerdict(ratio: number | null | undefined, usual: number | null | undefined): VerdictLine | null {
  if (!finite(ratio) || !finite(usual) || usual <= 0) return null;
  const diff = ratio - usual;
  if (diff <= -PUT_CALL_FLAT) return { verdict: "good", why: "Fewer bets on a fall than usual." };
  if (diff >= PUT_CALL_FLAT) return { verdict: "bad", why: "More bets on a fall than usual." };
  return { verdict: "neutral", why: "Bets in their usual mix." };
}

/** `monthPct` is gold's change over the past month, percent. */
export function goldVerdict(monthPct: number | null | undefined): VerdictLine | null {
  if (!finite(monthPct)) return null;
  if (monthPct >= GOLD_SURGE) return { verdict: "bad", why: "Surging: money is looking for safety." };
  return { verdict: "neutral", why: "No rush to safety." };
}

export function dollarVerdict(price: number | null | undefined, low1y: number | null | undefined, high1y: number | null | undefined): VerdictLine | null {
  if (!finite(price) || !finite(low1y) || !finite(high1y) || high1y <= low1y) return null;
  if (price >= high1y - (high1y - low1y) * 0.01) return { verdict: "bad", why: "At a one-year high: hurts overseas sales." };
  return { verdict: "neutral", why: "Below its one-year high." };
}

/** `move` is the Fed outcome the market favours, as fedOutcomeWords says it ("raises rates by…", "cuts…", "holds…"). */
export function fedVerdict(move: string | null | undefined): VerdictLine | null {
  if (!move) return null;
  if (/^raises\b/.test(move)) return { verdict: "bad", why: "A hike makes borrowing costlier." };
  if (/^cuts\b/.test(move)) return { verdict: "good", why: "A cut makes borrowing cheaper." };
  if (/^holds\b/.test(move)) return { verdict: "neutral", why: "No change to rates expected." };
  return null;
}

export function movesVerdict(gains: number, total: number): VerdictLine | null {
  if (!Number.isInteger(gains) || !Number.isInteger(total) || total < 3 || gains < 0 || gains > total) return null;
  // Only funds and indexes are counted (gold, gas or bitcoin rallying is not a good day for stocks), so it says so.
  const why =
    gains === total
      ? `All ${total} of the biggest fund and index moves were gains.`
      : `${gains === 0 ? "None" : gains} of the ${total} biggest fund and index moves were gains.`;
  if (gains / total >= MOVES_CLEAR) return { verdict: "good", why };
  if (gains / total <= 1 - MOVES_CLEAR) return { verdict: "bad", why };
  return { verdict: "neutral", why };
}

/** "4 of 6 good for stocks": the cards with a verdict, counted once for the section's title row. */
export function verdictTally(verdicts: ReadonlyArray<Verdict | null | undefined>): string | null {
  const known = verdicts.filter((verdict): verdict is Verdict => Boolean(verdict));
  if (known.length === 0) return null;
  return `${known.filter((verdict) => verdict === "good").length} of ${known.length} good for stocks`;
}

export const VERDICT_WORDS: Record<Verdict, string> = { good: "Good for stocks", bad: "Bad for stocks", neutral: "Neutral" };
