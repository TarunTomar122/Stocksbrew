/**
 * What a person sees while a fund is being added on demand (lib/funds/on-demand.ts).
 * Pure and safe in the browser: the fund page's adding state and the import
 * review both read their words from here.
 */

export type FundKind = "etf" | "mutual_fund";

/**
 * none:      nobody has asked yet.
 * adding:    the request is queued or the worker is on it.
 * ready:     the worker covered it (as a fund, or as a stock when Yahoo said it is one).
 * not_found: Yahoo does not know it as a fund and nothing else placed it.
 */
export type FundRequestState = "none" | "adding" | "ready" | "not_found";

const RUNNABLE = new Set(["queued", "retry", "pending", "running"]);

/** The state of a `stock_requests` document. */
export function fundRequestStateOf(data: Record<string, unknown> | null | undefined): FundRequestState {
  if (!data) return "none";
  if (data.fulfilled === true || data.status === "fulfilled") return "ready";
  // Yahoo said it is no fund; the stock lane may still place it, and then it is "ready".
  if (data.fund_check === "not_a_fund") return "not_found";
  const status = typeof data.status === "string" ? data.status : "queued";
  return RUNNABLE.has(status) ? "adding" : "not_found";
}

export type FundAddingStep = FundRequestState | "error" | "slow";

export type FundAddingView = {
  title: string;
  /** At most one short line, only when it adds something. */
  line: string | null;
  tone: "busy" | "done" | "missing" | "error";
};

/** The adding state's title and line for each step. */
export function fundAddingView(ticker: string, kind: FundKind, step: FundAddingStep): FundAddingView {
  const t = ticker.toUpperCase();
  switch (step) {
    case "ready":
      return { title: `${t} is ready`, line: null, tone: "done" };
    case "not_found":
      return { title: `We couldn't find a fund called ${t}`, line: "Check the ticker, or search for the fund by name.", tone: "missing" };
    case "error":
      return { title: `We couldn't add ${t} right now`, line: "Try again in a minute.", tone: "error" };
    case "slow":
      return { title: `Still adding ${t}`, line: "This one is taking longer than usual. Check back later today.", tone: "busy" };
    default:
      return {
        title: `Adding ${t} now`,
        line:
          kind === "mutual_fund"
            ? "Check back in a few minutes. Mutual funds are priced once a day."
            : "Check back in a few minutes for its price, costs and holdings.",
        tone: "busy",
      };
  }
}

/** The line under a fund in the import review that we are adding now. */
export function importAddingLine(kind: FundKind | null | undefined): string {
  return kind === "mutual_fund" ? "New to us, adding it now. Priced once a day." : "New to us, adding it now. Prices in a few minutes.";
}
