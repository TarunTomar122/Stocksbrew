/**
 * What the Ask panel starts from on the page you are on: the stock you are
 * reading, the research report, My stocks, the memo, your briefing. Pure, so
 * the panel (client), and the tests read the same rules. Returns a `ctx` value
 * (lib/ask-context.ts) or null when the page is not about one item.
 *
 * - /stock/NVDA and its tabs → stock:NVDA
 * - /stock/NVDA/research/<key> → research:NVDA:<key>
 * - /calendar/earnings/NVDA → stock:NVDA
 * - /portfolio/memo → memo (ex.memo when the page shows the example)
 * - /portfolio, /watchlist → portfolio (ex.portfolio when the page shows the example)
 * - /briefing → portfolio, signed in only (signed out it is the market's day)
 * - /agents?job=<id> → agent:<id>, signed in only
 */

import { askContext, formatAskContext, type AskContext } from "@/lib/ask-context";

export type PageAskInput = {
  /** The public path (lib/use-public-pathname.ts), never the cached copy's internal one. */
  pathname: string;
  /** The query string, with or without the leading "?". */
  search?: string;
  signedIn: boolean;
  /** The page is showing the example portfolio (signed out, or no holdings yet). */
  example: boolean;
};

function pick(context: AskContext | null): string | null {
  return context ? formatAskContext(context) : null;
}

export function pageAskContext({ pathname, search = "", signedIn, example }: PageAskInput): string | null {
  const parts = pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const [first, second, third, fourth] = parts;
  if (first === "stock" && second) {
    if (third === "research" && fourth) return pick(askContext("research", { ticker: second, id: fourth })) ?? pick(askContext("stock", { ticker: second }));
    return pick(askContext("stock", { ticker: second }));
  }
  if (first === "calendar" && second === "earnings" && third) return pick(askContext("stock", { ticker: third }));
  // The example is only a subject for someone who has no portfolio of their own; signed out, it is the only one.
  const exampleView = example || !signedIn;
  if (first === "portfolio" && second === "memo") return pick(askContext("memo", { example: exampleView }));
  if (first === "portfolio" || first === "watchlist") return pick(askContext("portfolio", { example: exampleView }));
  if (first === "briefing" && signedIn && !example) return pick(askContext("portfolio"));
  if (first === "agents" && signedIn) {
    const job = new URLSearchParams(search).get("job");
    return job ? pick(askContext("agent", { id: job })) : null;
  }
  return null;
}

