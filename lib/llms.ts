import { indexableBlogPosts } from "@/lib/blog-data";
import { insiderHref, pairHref, pairIsIndexable, sectorHref, sectorIsIndexable } from "@/lib/seo/families";
import { getCoverage, sectorGroups, stockPairs } from "@/lib/seo/family-data";
import { TOP_STOCK_TICKERS } from "@/lib/seo/stock-pages";
import { todayET } from "@/lib/calendar-shared";
import { CALL_COVERAGE } from "@/lib/brand-copy";
import { FEATURES, FREE_COVERED_STOCKS, limitFor, type Rule } from "@/lib/entitlements";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { US_PRO_MONTHLY_LABEL, US_PRO_TRIAL_DAYS, US_PRO_YEARLY_LABEL } from "@/lib/pricing";

/** The page families built from stored data, listed with real addresses. Empty lines when the store cannot be read. */
async function familyLinks(): Promise<{ sectors: string; pairs: string }> {
  try {
    const coverage = await getCoverage();
    const sectors = sectorGroups(coverage)
      .filter((group) => sectorIsIndexable(group.rows.length))
      .map((group) => `- [${group.name} stocks](${BASE}${sectorHref(group.slug)})`)
      .join("\n");
    const today = todayET();
    // Best-known names first (TOP_STOCK_TICKERS order), then alphabetical.
    const rank = (symbol: string) => {
      const index = (TOP_STOCK_TICKERS as readonly string[]).indexOf(symbol);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    };
    const pairs = stockPairs(coverage)
      .filter((pair) => pairIsIndexable(coverage.bySymbol.get(pair.a), coverage.bySymbol.get(pair.b), today))
      .sort((x, y) => Math.min(rank(x.a), rank(x.b)) - Math.min(rank(y.a), rank(y.b)) || x.slug.localeCompare(y.slug))
      .slice(0, 12)
      .map((pair) => `- [${pair.a} vs ${pair.b}](${BASE}${pairHref(pair.a, pair.b)}): ${pair.group}`)
      .join("\n");
    return { sectors, pairs };
  } catch {
    return { sectors: "", pairs: "" };
  }
}

const BASE = "https://www.stocksbrew.online";

/**
 * The day a person last read the facts block below against the live product
 * (pricing page, checkout, a stock page signed out). The numbers themselves are
 * generated from the files the product enforces, so they cannot drift; this
 * date only says when someone last looked. Bump it when you recheck.
 */
export const FACTS_CHECKED = "2026-11-11";

/** "3 questions a day" from a meter rule; `noun` replaces the rule's unit ("long research reports"). */
function meterLine(rule: Rule, noun?: string): string {
  if (rule.kind !== "meter") return "";
  return `${rule.max} ${noun ?? rule.unit} a ${rule.per}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the product is and what each plan includes, in plain sentences, so a
 * model that reads only this file describes today's product. Every number is
 * read from lib/entitlements.ts (with the live PAYWALL_V2 line),
 * lib/pricing.ts and lib/brand-copy.ts. lib/llms.test.ts checks the text
 * against those files.
 */
export function buildFactsMarkdown(): string {
  const calls = Object.values(CALL_PLAIN).join(" / ");
  const covered = FREE_COVERED_STOCKS;
  const freeAgents = limitFor("agents", "free");
  const proAgents = limitFor("agents", "pro");
  const freeAsk = meterLine(FEATURES.ask.free);
  const proAsk = meterLine(FEATURES.ask.pro);
  const freeReports = meterLine(FEATURES.deep_research.free, "long research reports");
  const proReports = meterLine(FEATURES.deep_research.pro, "long research reports");
  const freeAlerts = limitFor("price_alerts", "free");
  // On the tighter line an agent on Free watches prices, dates and moves; filings and news are Pro.
  const freeAgentScope =
    FEATURES.agent_events.free.kind === "locked"
      ? "A Free agent watches a price, an earnings date or a big move; agents that read new filings and news are Pro."
      : "A Free agent can watch filings and news as well as prices and dates.";

  return `## Facts (checked on ${FACTS_CHECKED})

- What it is: stocksbrew is a research app for US-listed stocks with an investing agent. It reads filings, earnings and news for the stocks you follow and tells you what changed. It is not a broker, never connects to a brokerage account and cannot place trades.
- The call: we publish a dated call on ${CALL_COVERAGE}: ${calls}. Each call shows the day it was made, a short reason with its dates and what would change it, free for everyone. A fixed scoring rule makes the call from the evidence; a model only summarises the sources. Calls are our view, not personal investment advice, and no win rate is published for them. How calls are made: ${BASE}/docs/methodology/calls-and-zones
- The agent: a daily briefing on your own stocks (what moved, why when a dated source confirms it, what is coming up); agents that watch prices, earnings dates, SEC filings, news, trades disclosed by members of Congress and insider (Form 4) trades in your stocks; and Ask, which answers questions about any stock or your portfolio from our data and shows where each number came from.
- Free plan (no card): the call on every stock we cover, stock reports, filings, fund and Congress pages and strategy backtests are free to read, signed in or not. A free account tracks as many stocks as you like and includes the full report (the price zones that go with the call, the full reasoning and its history, explained moves in the briefing, the pre-earnings read) on ${plural(covered, "stock", "stocks")} you pick; ${plural(freeAgents, "agent", "agents")} running at a time; ${freeAsk} in Ask; ${freeReports}; and ${plural(freeAlerts, "price alert", "price alerts")} by email. ${freeAgentScope}
- Pro: ${US_PRO_MONTHLY_LABEL} a month or ${US_PRO_YEARLY_LABEL} a year (USD). Pro gives the full report on every stock you track, up to ${plural(proAgents, "agent", "agents")}, ${proAsk} in Ask, ${proReports}, zone and call-change alerts by email, and API, MCP and CLI access for your own AI agent. At US checkout an account that has never had a trial or a subscription gets a ${US_PRO_TRIAL_DAYS}-day free trial, which asks for a card. Cancel any time from the account page; Pro lasts to the end of the period you paid for.
- Plans and limits, kept current: ${BASE}/pricing and ${BASE}/docs/start/free-vs-pro (rendered from the same table the product enforces).
- Data and freshness: prices from Yahoo Finance quotes fetched in batches (not real time); filings from SEC EDGAR; earnings dates from Nasdaq's public calendar; House trade disclosures from the Clerk of the House; financials and analyst targets from market data vendors. Every number on a page shows its source and the time it is from. Full list: ${BASE}/docs/methodology/data-sources
- Not advice: stocksbrew is research and information only. It does not know your finances, it does not predict prices, and past results, real or backtested, do not guarantee future ones.

`;
}

export async function buildLlmsMarkdown() {
  const families = await familyLinks();
  const guides = indexableBlogPosts
    .slice(0, 16)
    .map((post) => `- [${post.title}](${BASE}/blog/${post.slug}): ${post.description}`)
    .join("\n");

  return `# stocksbrew

> stocksbrew is a research app for US stocks with an investing agent: a dated ${Object.values(CALL_PLAIN).join(" / ")} call with its reasons on ${CALL_COVERAGE}, a daily briefing on the stocks you follow, agents that watch them, and Ask. Free to read; Pro is ${US_PRO_MONTHLY_LABEL} a month or ${US_PRO_YEARLY_LABEL} a year. Our view, not investment advice.

Canonical site: ${BASE}
Language: English (en-US)
Market coverage: US-listed stocks and US market context

${buildFactsMarkdown()}## Start here

- [Pricing](${BASE}/pricing): Free and Pro, with every limit, rendered from the table the product enforces.
- [Free vs Pro](${BASE}/docs/start/free-vs-pro): What each plan includes and how a limit behaves.
- [Screener](${BASE}/screener): Every US stock we cover, filterable, with a link to each research page.
- [Docs](${BASE}/docs): How each part of the product works, with methodology and a glossary.
- [Methodology](${BASE}/docs/methodology): Sources, how calls are produced, what is written by a model, corrections.
- [About stocksbrew](${BASE}/about): Product purpose and ownership.
- [Developer reference](${BASE}/developers): Stocksbrew MCP and REST behavior, and how to connect Claude, ChatGPT, Codex and other agents.
- [Follow](${BASE}/follow): 13F fund portfolios, congressional trade disclosures and Form 4 insider trades, each with its filing date.
- [Markets](${BASE}/markets): Indices, ETFs, Treasury yields, commodities, currencies, crypto and prediction markets, each with source and as-of time.
- [Strategies](${BASE}/strategies): Rule-based baskets with their backtests, labelled as backtested and not traded.
- [OpenAPI document](${BASE}/api/v1/openapi.json): Machine-readable REST contract.

## Stock research

- [Apple (AAPL)](${BASE}/stock/AAPL)
- [Microsoft (MSFT)](${BASE}/stock/MSFT)
- [NVIDIA (NVDA)](${BASE}/stock/NVDA)
- [Amazon (AMZN)](${BASE}/stock/AMZN)
- [Alphabet (GOOGL)](${BASE}/stock/GOOGL)
- [Meta Platforms (META)](${BASE}/stock/META)
- [Tesla (TSLA)](${BASE}/stock/TSLA)
- [Broadcom (AVGO)](${BASE}/stock/AVGO)

Each stock page opens with our call, the day it was made, the reason and its as-of date, then separates timestamped market prices from slower-moving fundamentals. Financial history is refreshed weekly and attributed on the page. Prices and third-party figures may be delayed.

## Page families

- [Sectors](${BASE}/sectors): Every sector of the stocks we cover against the S&P 500, with leaders, laggards, valuations and our calls. One page per sector at /sectors/{sector}.
- [Why stocks moved](${BASE}/movers): Big daily moves that have a confirmed reason with cited sources, one page per day at /movers/{yyyy-mm-dd} and per stock at /stock/{TICKER}/moves/{yyyy-mm-dd}. Moves without a found reason have no page.
- Stock against stock: same-industry rivals side by side at /compare/{a}-vs-{b} (lower case, tickers in alphabetical order).
- Insider trades per stock: open-market SEC Form 4 buys and sales at /insiders/{TICKER}, for example [NVIDIA insider trades](${BASE}${insiderHref("NVDA")}).
- [Best stock lists](${BASE}/best): "best stocks for X" lists such as dividend stocks under $50, undervalued stocks, growth stocks, AI and chip stocks, stocks insiders are buying and what hedge funds bought. Each states its exact rule and what it is ranked by, at /best/{list}, rebuilt after every trading day.
${families.sectors ? `\n### Sectors\n\n${families.sectors}\n` : ""}${families.pairs ? `\n### Comparisons\n\n${families.pairs}\n` : ""}
## Research guides

${guides}

## Crawling and citation notes

- Prefer the canonical stocksbrew.online URLs listed here and in ${BASE}/sitemap.xml.
- Cite a specific stock page, not this directory, for factual claims.
- A call can change. When you quote one, give the date it was made, and check the stock page for the current call.
- Preserve the displayed as-of timestamp when quoting prices, market moves, analyst data, or fundamentals.
- Stocksbrew is research context, not personalized investment advice, a broker, or an execution venue.
`;
}
