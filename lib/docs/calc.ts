/**
 * The arithmetic behind the three calculators under /docs/tools. Pure, so the
 * page, the worked examples in the guides and the tests share one source.
 */

export type PositionSizeInput = {
  account: number;
  /** Risk as a percent of the account (1 means 1%). Ignored when `riskDollars` is set. */
  riskPct?: number | null;
  riskDollars?: number | null;
  entry: number;
  stop: number;
  /** Largest share of the account one position may take, in percent. */
  maxAllocationPct?: number | null;
  target?: number | null;
};

export type PositionSizeResult =
  | {
      ok: true;
      direction: "long" | "short";
      shares: number;
      positionValue: number;
      allocationPct: number;
      riskPerShare: number;
      /** What is lost if the stop is hit exactly, for the whole-share position. */
      riskAtStop: number;
      riskAtStopPct: number;
      /** The risk the inputs asked for, before rounding down to whole shares. */
      riskBudget: number;
      /** Reward for each unit of risk. Null without a target. */
      rewardToRisk: number | null;
      /** True when the allocation cap, not the risk budget, set the size. */
      cappedByAllocation: boolean;
      /** True when the target is on the wrong side of the entry for this direction. */
      targetOnWrongSide: boolean;
    }
  | { ok: false; reason: string };

function positive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function positionSize(input: PositionSizeInput): PositionSizeResult {
  if (!positive(input.account)) return { ok: false, reason: "Enter the size of your account." };
  if (!positive(input.entry)) return { ok: false, reason: "Enter the price you would buy at." };
  if (!positive(input.stop)) return { ok: false, reason: "Enter the price you would sell at if you are wrong." };
  if (input.entry === input.stop) return { ok: false, reason: "The stop is the same as the entry, so there is no risk to size against." };

  const riskBudget = positive(input.riskDollars)
    ? input.riskDollars
    : positive(input.riskPct)
      ? input.account * (input.riskPct / 100)
      : null;
  if (riskBudget == null) return { ok: false, reason: "Enter how much of the account you are willing to lose on this idea." };
  if (riskBudget > input.account) return { ok: false, reason: "The risk is larger than the account." };

  const direction = input.stop < input.entry ? "long" : "short";
  const riskPerShare = Math.abs(input.entry - input.stop);
  let shares = Math.floor(riskBudget / riskPerShare);
  let cappedByAllocation = false;

  if (positive(input.maxAllocationPct)) {
    const cap = Math.floor((input.account * Math.min(input.maxAllocationPct, 100)) / 100 / input.entry);
    if (cap < shares) {
      shares = cap;
      cappedByAllocation = true;
    }
  }
  // Without leverage a position cannot cost more than the account.
  const affordable = Math.floor(input.account / input.entry);
  if (affordable < shares) {
    shares = affordable;
    cappedByAllocation = true;
  }
  if (shares <= 0) {
    return {
      ok: false,
      reason: cappedByAllocation
        ? "At this price the account or the allocation cap does not cover one whole share."
        : "The risk budget does not cover one whole share. Raise the risk or move the stop closer.",
    };
  }

  const positionValue = shares * input.entry;
  const riskAtStop = shares * riskPerShare;
  const reward = positive(input.target) ? (direction === "long" ? input.target - input.entry : input.entry - input.target) : null;

  return {
    ok: true,
    direction,
    shares,
    positionValue,
    allocationPct: (positionValue / input.account) * 100,
    riskPerShare,
    riskAtStop,
    riskAtStopPct: (riskAtStop / input.account) * 100,
    riskBudget,
    rewardToRisk: reward != null && reward > 0 ? reward / riskPerShare : null,
    cappedByAllocation,
    targetOnWrongSide: reward != null && reward <= 0,
  };
}

export type CagrResult =
  | { ok: true; cagr: number; totalReturn: number; multiple: number; years: number }
  | { ok: false; reason: string };

/** Compound annual growth rate as a fraction (0.12 is 12% a year). */
export function cagr(start: number, end: number, years: number): CagrResult {
  if (!positive(start)) return { ok: false, reason: "Enter a starting value above zero." };
  if (!(typeof end === "number" && Number.isFinite(end) && end >= 0)) return { ok: false, reason: "Enter an ending value." };
  if (!positive(years)) return { ok: false, reason: "Enter a period longer than zero." };
  const multiple = end / start;
  return { ok: true, cagr: Math.pow(multiple, 1 / years) - 1, totalReturn: multiple - 1, multiple, years };
}

/** Years between two ISO dates, counted the way the backtest engine counts them: days / 365.25. */
export function yearsBetween(startIso: string, endIso: string): number | null {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 86_400_000 / 365.25;
}

/** What a starting value becomes at a steady yearly rate (a fraction) after some years. */
export function futureValue(start: number, rate: number, years: number): number {
  return start * Math.pow(1 + rate, years);
}

export type RecoveryResult =
  | {
      ok: true;
      /** The gain needed to get back to the old high, as a fraction (1 is +100%). */
      gainNeeded: number;
      /** What 100 becomes at the bottom. */
      valueAtBottom: number;
      /** Years to recover at the given yearly return. Null when no return was given or it is not positive. */
      yearsToRecover: number | null;
    }
  | { ok: false; reason: string };

/**
 * A fall of `drawdownPct` percent needs a larger gain to undo, because the
 * gain is earned on a smaller base: gain = d / (1 − d).
 */
export function drawdownRecovery(drawdownPct: number, annualReturnPct?: number | null): RecoveryResult {
  if (!positive(drawdownPct)) return { ok: false, reason: "Enter the size of the fall as a percent above zero." };
  if (drawdownPct >= 100) return { ok: false, reason: "A 100% fall cannot be recovered: there is nothing left to grow." };
  const d = drawdownPct / 100;
  const gainNeeded = d / (1 - d);
  const yearsToRecover = positive(annualReturnPct) ? Math.log(1 + gainNeeded) / Math.log(1 + annualReturnPct / 100) : null;
  return { ok: true, gainNeeded, valueAtBottom: 100 * (1 - d), yearsToRecover };
}

/** The table the drawdown guide and calculator show. */
export const RECOVERY_LADDER = [5, 10, 20, 30, 40, 50, 60, 75, 90] as const;
