import { askContext, formatAskContext } from "@/lib/ask-context";
import type { BriefingItem } from "@/lib/briefing";
import type { Insight } from "@/lib/insights";

/**
 * Links from the briefing into Ask that carry what they are about
 * (lib/ask-context.ts): in your own briefing, the briefing line itself
 * (`brief:NVDA:2026-11-10:<item id>`, re-read for you on the server); in the
 * market view, the stock. Same link shape as lib/next-steps.ts askHref, kept
 * here so the briefing's client bundle does not take that file's imports.
 */

type Line = Pick<BriefingItem, "id" | "ticker">;

/** The Ask context for one briefing line, or null when it has no stock. */
export function briefContext(item: Line, day: string, personal: boolean): string | null {
  const ticker = item.ticker?.trim().toUpperCase() || null;
  if (!ticker) return null;
  const context = personal ? askContext("brief", { ticker, day, id: item.id }) : null;
  return formatAskContext(context ?? askContext("stock", { ticker }) ?? { kind: "stock", ticker, id: null, day: null, example: false });
}

export function briefAskHref(question: string, context: string | null): string {
  return `/ask?q=${encodeURIComponent(question.trim())}${context ? `&ctx=${encodeURIComponent(context)}` : ""}`;
}

/**
 * The read's cards in your own briefing: a card about one of your briefing lines opens that line in Ask; a card
 * about several of your stocks opens your portfolio. Insight ids are "move-<item id>", "mover-<ticker>",
 * "call-<item id>", "earnings-<item id>" (lib/briefing-read.ts).
 */
export function readAskContext(items: ReadonlyArray<Line>, day: string): (insight: Insight) => string | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const firstFor = new Map<string, Line>();
  for (const item of items) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (ticker && !firstFor.has(ticker)) firstFor.set(ticker, item);
  }
  return (insight) => {
    const tickers = [...new Set(insight.tickers ?? [])];
    if (tickers.length !== 1) return "portfolio";
    const own = /^(?:move|call|earnings)-(.+)$/.exec(insight.id)?.[1];
    const item = (own ? byId.get(own) : undefined) ?? firstFor.get(tickers[0]!.toUpperCase());
    return item ? briefContext(item, day, true) : null;
  };
}
