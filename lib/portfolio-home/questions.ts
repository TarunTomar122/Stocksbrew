import { askHref } from "@/lib/next-steps";

import type { HomeMode, HomeSources, Noticed } from "./pick";

/**
 * The questions offered beside the Ask box on the My stocks overview, drawn
 * from the holdings and this week's findings. Only questions Ask's tools can
 * answer: news (get_news), our call and the company (get_stock), returns against
 * the S&P 500 (get_price_history), side by side (compare_stocks), the next
 * report (get_earnings) and, for a signed-in person with holdings, what changed
 * in their own portfolio (get_portfolio_changes). Ask does not know the example
 * portfolio, so the example only gets questions about named stocks. Nothing is
 * asked until the person taps one. Pure, so it can be tested.
 */

export const MAX_QUESTIONS = 4;
/** At most this many come from the findings, so the portfolio-wide ones still fit. */
const FROM_FINDINGS = 2;

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

export type HomeQuestion = { question: string; href: string };

function clean(ticker: string | null | undefined): string | null {
  const symbol = (ticker ?? "").trim().toUpperCase();
  return TICKER.test(symbol) ? symbol : null;
}

const beforeReport = (ticker: string) => `What should I know before ${ticker} reports earnings?`;
const latestNews = (ticker: string) => `What is the latest news on ${ticker}?`;
const vsMarket = (ticker: string) => `How has ${ticker} done against the S&P 500 this year?`;

/** The question a finding raises, or null when it is not about one stock. */
export function questionFor(item: Noticed): string | null {
  const ticker = clean(item.ticker);
  if (!ticker) return null;
  if (item.tool === "earnings") return beforeReport(ticker);
  if (item.id.startsWith("reason-")) return latestNews(ticker);
  if (item.id.startsWith("ideas-loss-")) return latestNews(ticker);
  // The x-ray's company and the crash replay's hardest-hit stock are both on Analysis.
  if (item.id.startsWith("ideas-trim-") || item.tool === "xray") return vsMarket(ticker);
  return null;
}

/** "AAPL, MSFT and NVDA". */
function listWords(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The three biggest companies once funds are opened up, as the x-ray ranks them. */
function biggest(sources: Partial<HomeSources>): string[] {
  const xray = sources.xray?.state === "ready" ? sources.xray.value.xray : null;
  const fromXray = (xray?.companies ?? []).map((company) => clean(company.ticker)).filter((ticker): ticker is string => ticker !== null);
  return [...new Set(fromXray)].slice(0, 3);
}

/** The next holding to report, for a "before it reports" question when no finding raised one. */
function nextReporter(sources: Partial<HomeSources>): string | null {
  const season = sources.season?.state === "ready" ? sources.season.value.season : null;
  const first = season?.reporting.find((stock) => stock.kind === "holding" && stock.next);
  return clean(first?.ticker);
}

/**
 * Up to four questions: what the leading findings raise (at most two), then,
 * for a person's own holdings, what changed since yesterday, then a side by side
 * of the biggest companies, then the next report and the news on the biggest
 * one to fill. Each question appears once.
 */
export function pickQuestions(input: {
  lead: Noticed[];
  rest: Noticed[];
  sources: Partial<HomeSources>;
  mode: HomeMode;
  /** Questions already offered elsewhere on the page (on each lead finding), so the box does not repeat them. */
  skip?: string[];
}): HomeQuestion[] {
  const out: string[] = [];
  const skip = new Set(input.skip ?? []);
  const add = (question: string | null) => {
    if (question && !skip.has(question) && !out.includes(question) && out.length < MAX_QUESTIONS) out.push(question);
  };

  const fromFindings = [...input.lead, ...input.rest].map(questionFor).filter((question): question is string => question !== null);
  for (const question of [...new Set(fromFindings)].filter((question) => !skip.has(question)).slice(0, FROM_FINDINGS)) add(question);

  if (input.mode === "mine") add("What changed in my portfolio since yesterday?");
  const top = biggest(input.sources);
  if (top.length >= 2) add(`Compare ${listWords(top)} on valuation and one-year return.`);
  const reporter = nextReporter(input.sources);
  if (reporter) add(beforeReport(reporter));
  // One news question is enough; with one already asked, the biggest company gets the S&P 500 one instead.
  if (top[0]) add(out.some((question) => question.startsWith("What is the latest news")) ? vsMarket(top[0]) : latestNews(top[0]));
  if (input.mode === "mine") add("Which of my holdings has the weakest call right now?");

  // Portfolio-wide questions open on the person's (or the example's) portfolio; the rest name their stock in the words.
  const context = input.mode === "mine" ? "portfolio" : "ex.portfolio";
  return out.map((question) => ({ question, href: askHref(question, /\b(my|portfolio)\b/i.test(question) ? context : null) }));
}
