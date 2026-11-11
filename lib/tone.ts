/**
 * Good, bad or in between, for figures and facts a reader could take either way.
 *
 * One place for the thresholds so the same figure gets the same mark on every
 * page: the stock report, the screener, compare, Ask cards, the portfolio.
 * Pure functions only; the marks themselves (`ToneGlyph`, `Verdict`) live in the
 * kit. "up" is good for the company or the holder, "down" is bad, "flat" is
 * neither. Words describe the company or the data, never advice.
 */

export type Tone = "up" | "down" | "flat";

/** A tone with the one or two words that say it. */
export type ToneWord = { tone: Tone; word: string };

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * At or above `good` is up, below `bad` is down, anything between is flat. With
 * `lowerIsBetter` (debt to equity, drawdown): at or below `good` is up, above `bad` is down.
 */
export function judge(value: number, good: number, bad: number, lowerIsBetter = false): Tone {
  if (lowerIsBetter) return value <= good ? "up" : value > bad ? "down" : "flat";
  return value >= good ? "up" : value < bad ? "down" : "flat";
}

type Threshold = { good: number; bad: number; lowerIsBetter?: boolean };

/**
 * The thresholds, in the units the figure is shown in (percent as 12.5, ratios as 0.8).
 * Generic across sectors on purpose: a bank or a REIT can read high on debt and
 * thin on gross margin without anything being wrong.
 */
export const THRESHOLDS = {
  /** Gross margin, % of revenue. */
  grossMargin: { good: 40, bad: 15 },
  /** Operating margin, % of revenue. */
  operatingMargin: { good: 15, bad: 0 },
  /** Net (profit) margin, % of revenue. */
  netMargin: { good: 10, bad: 0 },
  /** Free cash flow, % of revenue. */
  fcfMargin: { good: 10, bad: 0 },
  /** Return on equity, %. */
  roe: { good: 15, bad: 0 },
  /** Return on invested capital, %. */
  roic: { good: 10, bad: 0 },
  /** Debt divided by shareholder equity. Lower is better; below zero means negative equity, which `toneFor` reads as bad. */
  debtToEquity: { good: 0.5, bad: 2, lowerIsBetter: true },
  /** Current assets over current liabilities. */
  currentRatio: { good: 1.5, bad: 1 },
  /** Revenue growth over a year, %. Anything under -0.5% is shrinking. */
  revenueGrowth: { good: 8, bad: -0.5 },
  /** EPS growth over a year, %. */
  epsGrowth: { good: 10, bad: 0 },
  /**
   * A 0 to 100 score from the fundamentals model. Matches the model's own words
   * (strong >= 75, solid >= 55, mixed >= 35, weak below), so a number and the
   * `scoreVerdict` chip beside it never disagree.
   */
  score: { good: 55, bad: 35 },
  /** Annualised Sharpe ratio. */
  sharpe: { good: 1, bad: 0.5 },
  /** Worst peak-to-trough fall, as a positive or negative %; judged on its size. Lower is better. */
  drawdown: { good: 15, bad: 30, lowerIsBetter: true },
  /** Beta against the S&P 500. Lower is steadier. */
  beta: { good: 0.8, bad: 1.3, lowerIsBetter: true },
  /** Weight of the largest holding in a portfolio, %. Lower is better. */
  topWeight: { good: 15, bad: 25, lowerIsBetter: true },
  /**
   * Effective number of positions (1 over the sum of squared weights). Lines up
   * with `topWeight`: an equal-weight book of 7 has a 14% largest holding, of 3 a 33% one.
   */
  effectivePositions: { good: 7, bad: 4 },
  /**
   * Volatility divided by the S&P 500's over the same period. The same cut the
   * strategy backtests use for "Smaller swings" and "Bigger swings"
   * (backend/agentdata/backtest_strategies.py `risk_label`), so one ratio reads the same everywhere.
   */
  relativeVolatility: { good: 0.85, bad: 1.15, lowerIsBetter: true },
  /** A 0 to 100 diversification score (how spread across sectors). */
  diversification: { good: 70, bad: 40 },
} as const satisfies Record<string, Threshold>;

export type Metric = keyof typeof THRESHOLDS;

/**
 * The tone of a figure by name, or null when it is missing. Drawdown is judged on
 * its size, so −35 and 35 read the same. Negative debt to equity means the
 * company owes more than it owns, so it is bad, not "low debt".
 */
export function toneFor(metric: Metric, value: number | null | undefined): Tone | null {
  if (!fin(value)) return null;
  if (metric === "debtToEquity" && value < 0) return "down";
  const rule: Threshold = THRESHOLDS[metric];
  const v = metric === "drawdown" ? Math.abs(value) : value;
  return judge(v, rule.good, rule.bad, rule.lowerIsBetter ?? false);
}

/** Only good and bad get a mark beside a number; neutral gets nothing, since a gray mark reads as a minus sign. */
export function markFor(metric: Metric, value: number | null | undefined): Exclude<Tone, "flat"> | undefined {
  const tone = toneFor(metric, value);
  return tone === "up" || tone === "down" ? tone : undefined;
}

// ─── Verdict words ───────────────────────────────────────────────────────────

/**
 * A multiple (P/E, EV/EBITDA, P/S) against its sector average, from the gap in
 * percent (+ is above the sector). Within 10% either way reads as in line.
 */
export function multipleVsSector(gapPct: number | null | undefined): ToneWord | null {
  if (!fin(gapPct)) return null;
  if (gapPct <= -10) return { tone: "up", word: "Cheap vs sector" };
  if (gapPct >= 10) return { tone: "down", word: "Pricey vs sector" };
  return { tone: "flat", word: "In line" };
}

/**
 * Whether a multiple's own history is worth judging against: at least a year of
 * data that runs to within a month of today. A three-month or stale window would
 * call a stock cheap or pricey on too little. Dates are YYYY-MM-DD.
 */
export function historyJudged(from: string | null | undefined, to: string | null | undefined, today: string): boolean {
  const day = (iso: string | null | undefined) => {
    const time = iso ? Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(time) ? time / 86_400_000 : null;
  };
  const start = day(from);
  const end = day(to);
  const now = day(today);
  if (start == null || end == null || now == null) return false;
  return end - start >= 360 && now - end <= 30;
}

/** Today's multiple against its own history, from the share of past days it was lower (0 to 100). */
export function multipleVsHistory(percentile: number | null | undefined): ToneWord | null {
  if (!fin(percentile)) return null;
  if (percentile <= 25) return { tone: "up", word: "Cheap vs history" };
  if (percentile >= 75) return { tone: "down", word: "Pricey vs history" };
  return { tone: "flat", word: "Typical" };
}

/**
 * Price against the middle analyst target, from the gap to target in percent
 * (+ means the target is above the price). Within 5% either way is at target.
 */
export function priceVsTarget(upsidePct: number | null | undefined): ToneWord | null {
  if (!fin(upsidePct)) return null;
  if (upsidePct >= 5) return { tone: "up", word: "Below target" };
  if (upsidePct <= -5) return { tone: "down", word: "Above target" };
  return { tone: "flat", word: "At target" };
}

/**
 * Reported against expected, from the surprise in percent. Within 1% is in line, the same line the backend draws
 * when it stores beat/miss labels (backend/agentdata/earnings_calendar.py surprise_label), so every page agrees.
 */
export function surprise(surprisePct: number | null | undefined): ToneWord | null {
  if (!fin(surprisePct)) return null;
  if (surprisePct >= 1) return { tone: "up", word: "Beat" };
  if (surprisePct <= -1) return { tone: "down", word: "Missed" };
  return { tone: "flat", word: "In line" };
}

/** Same as `surprise`, from the two numbers. Null when either is missing or the estimate is zero. */
export function surpriseFrom(actual: number | null | undefined, estimate: number | null | undefined): ToneWord | null {
  if (!fin(actual) || !fin(estimate) || estimate === 0) return null;
  return surprise(((actual - estimate) / Math.abs(estimate)) * 100);
}

/**
 * Who is net buying: insiders, Congress or funds. Pass counts or dollar totals.
 * `who` is the noun in the word ("Insiders", "Congress", "Funds"). Same band as
 * `netSide`: within a tenth of the total either way is mixed.
 */
export function netFlow(buys: number, sells: number, who: string): ToneWord | null {
  const side = netSide(buys, sells);
  if (!side) return null;
  if (side.tone === "flat") return side;
  return { tone: side.tone, word: `${who} ${side.tone === "up" ? "buying" : "selling"}` };
}

/** A fundamentals pillar or overall verdict word from the scoring model. */
export function scoreVerdict(raw: string | null | undefined): Tone | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "strong" || text === "solid") return "up";
  if (text === "weak" || text === "poor") return "down";
  if (text === "mixed" || text === "average" || text === "fair") return "flat";
  return null;
}

/**
 * RSI in a word. Overbought and oversold are traders' warnings about a stretched
 * move, not a judgment of the company, so both stay neutral.
 */
export function rsiWord(rsi: number | null | undefined): ToneWord | null {
  if (!fin(rsi) || rsi < 0 || rsi > 100) return null;
  if (rsi >= 70) return { tone: "flat", word: "Overbought" };
  if (rsi <= 30) return { tone: "flat", word: "Oversold" };
  return { tone: "flat", word: "Normal" };
}

/**
 * Bullish or bearish chatter, from a sentiment label, said in plain words:
 * "Hopeful" (expects a rise) or "Worried" (expects a fall).
 */
export function moodWord(raw: string | null | undefined): ToneWord | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (/bull|positive|optimis/.test(text)) return { tone: "up", word: "Hopeful" };
  if (/bear|negative|pessimis/.test(text)) return { tone: "down", word: "Worried" };
  if (/neutral|mixed/.test(text)) return { tone: "flat", word: "Mixed" };
  return null;
}

/**
 * How often a strategy or mix beat its benchmark, from the years it beat and the
 * years counted. Six in ten or better is up, four in ten or worse is down. Under
 * three years is too few to call, so it gets no tone.
 */
export function beatShare(beat: number | null | undefined, years: number | null | undefined): Tone | null {
  if (!fin(beat) || !fin(years) || years < 3 || beat < 0 || beat > years) return null;
  const share = beat / years;
  return share >= 0.6 ? "up" : share <= 0.4 ? "down" : "flat";
}

/** How spread a portfolio is, from a 0 to 100 diversification score. */
export function spreadWord(score: number | null | undefined): ToneWord | null {
  const tone = toneFor("diversification", score);
  if (!tone) return null;
  return { tone, word: tone === "up" ? "Spread out" : tone === "down" ? "Concentrated" : "Moderate" };
}

/** Where a research call sits: the add side, the middle, or the trim side. */
function callSide(stance: string | null | undefined): number | null {
  const text = String(stance ?? "").trim().toLowerCase();
  if (/^(accumulate|add|buy|strong buy)$/.test(text)) return 1;
  if (/^(hold|watch|neutral)$/.test(text)) return 0;
  if (/^(trim|avoid|sell|reduce|strong sell)$/.test(text)) return -1;
  return null;
}

/**
 * A change of research call, as the direction it moved: Hold to Accumulate is
 * upgraded, Hold to Trim is downgraded. Moves within the middle (Hold to Watch)
 * and unknown calls get nothing.
 */
export function callShift(from: string | null | undefined, to: string | null | undefined): ToneWord | null {
  const before = callSide(from);
  const after = callSide(to);
  if (before === null || after === null || before === after) return null;
  return after > before ? { tone: "up", word: "Upgraded" } : { tone: "down", word: "Downgraded" };
}

// ─── Flows and markets ───────────────────────────────────────────────────────

/**
 * Which way one filing leaned: a fund's adds against its trims, a lawmaker's buys
 * against their sales. Pass dollars when the filing has them, counts when not.
 * Within a tenth of the total either way is mixed.
 */
export function netSide(bought: number | null | undefined, sold: number | null | undefined): ToneWord | null {
  const b = fin(bought) ? Math.max(0, bought) : 0;
  const s = fin(sold) ? Math.max(0, sold) : 0;
  const total = b + s;
  if (total === 0) return null;
  if (Math.abs(b - s) <= total * 0.1) return { tone: "flat", word: "Mixed" };
  return b > s ? { tone: "up", word: "Bought more than sold" } : { tone: "down", word: "Sold more than bought" };
}

/**
 * The Treasury curve from the 10-year minus 2-year spread in basis points, the
 * same cut as the markets reading: below zero is inverted, the classic
 * recession warning; under 10 bps is flat; above that is the normal upward slope.
 */
export function yieldCurveWord(spreadBps: number | null | undefined): ToneWord | null {
  if (!fin(spreadBps)) return null;
  if (spreadBps < 0) return { tone: "down", word: "Inverted" };
  if (spreadBps < 10) return { tone: "flat", word: "Flat" };
  return { tone: "up", word: "Normal" };
}

/**
 * One-month implied volatility against three-month. Near above far means options
 * price stress now, worth a mark; the usual upward shape is neutral, so it never
 * reads "calm" beside a VIX that is high.
 */
export function volCurveWord(near: number | null | undefined, far: number | null | undefined): ToneWord | null {
  if (!fin(near) || !fin(far)) return null;
  return near > far ? { tone: "down", word: "Stressed" } : { tone: "flat", word: "Usual shape" };
}

/** The VIX level in a word: 15 or under is calm, 25 or over is stressed, between is average. */
export function vixWord(level: number | null | undefined): ToneWord | null {
  if (!fin(level) || level <= 0) return null;
  if (level <= 15) return { tone: "up", word: "Calm" };
  if (level >= 25) return { tone: "down", word: "Stressed" };
  return { tone: "flat", word: "Average" };
}

/**
 * A Fed outcome label from a prediction market ("Hike 25bps", "Cut 50bps",
 * "No change"), as what it means for stocks: a hike is a headwind, a cut a tailwind.
 */
export function fedMoveWord(label: string | null | undefined): ToneWord | null {
  const text = String(label ?? "").trim().toLowerCase();
  if (!text) return null;
  // "No cuts" and "0 hikes" mean no move; check them before the words they contain.
  if (/\b(no (change|cuts?|hikes?|move)|0 (cuts?|hikes?)|none|unchanged|hold|holds|pause|maintains?)\b/.test(text)) {
    return { tone: "flat", word: "No change" };
  }
  if (/\b(hikes?|raises?|increases?)\b/.test(text)) return { tone: "down", word: "Headwind" };
  if (/\b(cuts?|lowers?|decreases?)\b/.test(text)) return { tone: "up", word: "Tailwind" };
  return null;
}

/**
 * A written earnings line ("EPS of $1.20 beat the $1.10 estimate") as Beat or
 * Missed, or guidance ("raised its full-year outlook") as Raised or Cut. Only
 * when the sentence points one way: a beat on one line and a miss on another,
 * or a negation ("did not beat"), returns null so the chip never overstates it.
 */
export function sentenceOutcome(text: string | null | undefined, kind: "results" | "guidance"): ToneWord | null {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return null;
  // "did not beat", "didn't beat", "failed to top": any negation near the verb and the line gets no chip.
  if (/(?:\b(?:not|no|without|failed to)\b|n't)\W+(?:\w+\W+){0,2}(beat|miss|top|exceed|raise|cut|lower)/.test(t)) return null;
  // Guidance verbs are common words ("increased spending", "cut costs"); they only count in a line about the outlook.
  if (kind === "guidance" && !/\b(guidance|guide[sd]?|outlook|forecasts?|targets?)\b/.test(t)) return null;
  const up =
    kind === "results"
      ? /\b(beat|beats|topped|tops|exceeded|exceeds|(ahead of|above) (the )?(estimates?|consensus|expectations?|forecasts?))\b/.test(t)
      : /\b(raised|raises|raising|lifted|lifts|boosted|increased|hiked|above (the )?(estimate|consensus)s?)\b/.test(t);
  const down =
    kind === "results"
      ? /\b(missed|misses|miss|fell short|short of|below (the )?(estimates?|consensus|expectations?|forecasts?))\b/.test(t)
      : /\b(cut|cuts|lowered|lowers|reduced|reduces|slashed|withdrew|withdrawn|below (the )?(estimate|consensus)s?)\b/.test(t);
  if (up && !down) return { tone: "up", word: kind === "results" ? "Beat" : "Raised" };
  if (down && !up) return { tone: "down", word: kind === "results" ? "Missed" : "Cut" };
  if (!up && !down && /\b(in line|inline|matched|met (the )?(estimate|consensus|expectation)|reaffirm|reiterat|maintain|kept|unchanged)/.test(t)) {
    return { tone: "flat", word: kind === "results" ? "In line" : "Kept" };
  }
  return null;
}
