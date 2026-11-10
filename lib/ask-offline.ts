import { cleanTickerList, isAskCard, type AskCard } from "@/lib/ask-cards";

/**
 * The offline planner: Ask without a language model.
 *
 * A checkout with no model key (local development) still needs the copilot to
 * run so the tools, the cards, the streaming and the saved history can be
 * exercised. This picks tools from the question by fixed rules and writes the
 * answer from the cards by fixed templates. It never runs in production, and
 * the page labels every answer it writes.
 *
 * Pure: a question goes in, a plan comes out; a card goes in, a sentence
 * comes out.
 */

export type PlannedCall = { tool: string; input: Record<string, unknown> };

const COMPANY_TICKERS: Record<string, string> = {
  nvidia: "NVDA",
  apple: "AAPL",
  microsoft: "MSFT",
  alphabet: "GOOGL",
  google: "GOOGL",
  amazon: "AMZN",
  meta: "META",
  tesla: "TSLA",
  broadcom: "AVGO",
  tsmc: "TSM",
  amd: "AMD",
  netflix: "NFLX",
  palantir: "PLTR",
  micron: "MU",
  costco: "COST",
  walmart: "WMT",
  jpmorgan: "JPM",
  exxon: "XOM",
  disney: "DIS",
  intel: "INTC",
};

const NOT_TICKERS = new Set([
  "A", "I", "AN", "AND", "ARE", "AS", "AT", "BE", "BUY", "BY", "CEO", "DID", "DO", "ETF", "ETFS", "FOR", "FROM", "HAS", "HOW", "IF",
  "IN", "IS", "IT", "ITS", "ME", "MY", "NOT", "OF", "ON", "OR", "PE", "SO", "THE", "TO", "UP", "US", "USA", "VS", "WE", "WHAT", "WHEN",
  "WHO", "WHY", "YTD", "AI", "IPO", "SEC", "FED", "GDP", "CPI", "EPS", "S", "P", "F", "K", "Q",
]);

/** Tickers named in a question: "$NVDA", "NVDA", or a well-known company name. */
export function tickersIn(question: string): string[] {
  const found: string[] = [];
  const lower = question.toLowerCase();
  // Names and symbols in the order the person wrote them.
  const hits: Array<{ at: number; ticker: string }> = [];
  for (const [name, ticker] of Object.entries(COMPANY_TICKERS)) {
    const at = lower.search(new RegExp(`\\b${name}\\b`));
    if (at >= 0) hits.push({ at, ticker });
  }
  for (const match of question.matchAll(/\$?\b[A-Z]{1,5}\b/g)) {
    const raw = match[0].replace("$", "");
    // A lone capital letter is far more often part of "P/E" or "S&P" than a ticker, unless it carries a "$".
    if (!match[0].startsWith("$") && (raw.length < 2 || NOT_TICKERS.has(raw))) continue;
    hits.push({ at: match.index ?? 0, ticker: raw });
  }
  for (const hit of hits.sort((a, b) => a.at - b.at)) if (!found.includes(hit.ticker)) found.push(hit.ticker);
  return cleanTickerList(found, 8);
}

function sinceYear(question: string): string | null {
  const match = /\b(?:since|from|starting in|after)\s+((?:19|20)\d{2})\b/i.exec(question);
  return match ? `${match[1]}-01-01` : null;
}

function periodIn(question: string): string | null {
  const lower = question.toLowerCase();
  if (/\bytd\b|year to date|this year/.test(lower)) return "ytd";
  const counted = /\b(?:last|past|over)\s+(?:the\s+)?(\d{1,2}|a|one|two|three|five|ten)?\s*(day|week|month|year)s?\b/.exec(lower);
  if (counted) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, five: 5, ten: 10 };
    const count = counted[1] ? (words[counted[1]] ?? Number(counted[1])) : 1;
    return `${count}${counted[2] === "month" ? "m" : counted[2]![0]}`;
  }
  if (/\bthis week\b/.test(lower)) return "5d";
  if (/\bthis month\b/.test(lower)) return "1m";
  return null;
}

/** The idea inside a request: "Build me a basket of X" is about X. */
export function thesisOf(question: string): string {
  const stripped = question
    .trim()
    .replace(/^(please\s+)?(can you\s+)?(build|make|give|create|find|show|get)(\s+me)?(\s+(a|an|some|the))?(\s+(basket|list|set|portfolio))?(\s+(of|for|with))?\s+/i, "")
    .replace(/[.?!]+$/, "");
  const thesis = stripped.length >= 3 ? stripped : question.trim();
  return thesis.slice(0, 400);
}

/** Which tools to call for a question. An empty plan means the planner cannot help with it. */
export function planOffline(question: string): PlannedCall[] {
  const lower = question.toLowerCase();
  const tickers = tickersIn(question);
  const since = sinceYear(question);

  if (/\b(add|save|put)\b.*\b(watchlist|watch list|portfolio)\b/.test(lower) && tickers.length > 0) {
    return [{ tool: "propose_watchlist_add", input: { tickers } }];
  }
  const alert = /\balert\b.*?\b(above|below|over|under)\b\s*\$?(\d+(?:\.\d+)?)/.exec(lower);
  if (alert && tickers.length > 0) {
    return [
      {
        tool: "propose_price_alert",
        input: { ticker: tickers[0], condition: alert[1] === "above" || alert[1] === "over" ? "above" : "below", target_price: Number(alert[2]) },
      },
    ];
  }
  if (/\bbacktest\b|would .* have done|had (?:i )?(?:bought|held)|how would/.test(lower) && tickers.length > 0) {
    const benchmark = /s&p|spy\b/.test(lower) ? "SPY" : undefined;
    const holdings = tickers.filter((ticker) => ticker !== "SPY").map((ticker) => ({ ticker }));
    if (holdings.length > 0) return [{ tool: "run_backtest", input: { holdings, ...(since ? { start: since } : {}), ...(benchmark ? { benchmark } : {}) } }];
  }
  if (/\bmy (portfolio|holdings|watchlist|names|stocks|positions)\b/.test(lower)) {
    return [{ tool: /chang|new|since|happen/.test(lower) ? "get_portfolio_changes" : "get_my_portfolio", input: {} }];
  }
  if (/\b13f\b|hedge fund|\bfund\b.*\b(bought|buy|sold|sell|hold|own)|berkshire|buffett|ackman|pershing|bridgewater|burry|scion|tepper|druckenmiller/.test(lower)) {
    const name = /berkshire|buffett/.test(lower)
      ? "Berkshire Hathaway"
      : (/(ackman|pershing|bridgewater|burry|scion|tepper|druckenmiller)/.exec(lower)?.[1] ?? "");
    return name ? [{ tool: "get_investor", input: { name } }] : [{ tool: "list_investors", input: { kind: "fund" } }];
  }
  if (/\binsiders?\b|form 4/.test(lower)) {
    return [{ tool: "get_insider_trades", input: { ...(tickers[0] ? { ticker: tickers[0] } : {}), buys_only: /\b(bought|buy|buys|buying|purchas)/.test(lower) } }];
  }
  if (/congress|senator|representative|pelosi|politician/.test(lower)) {
    const person = /pelosi/.test(lower) ? "Pelosi" : undefined;
    return [{ tool: "get_congress_trades", input: { ...(tickers[0] ? { ticker: tickers[0] } : {}), ...(person ? { person } : {}) } }];
  }
  if (/\b(compare|versus|vs\.?)\b/.test(lower) && tickers.length >= 2) {
    return [{ tool: "compare_stocks", input: { tickers: tickers.slice(0, 5) } }];
  }
  if (/\b(basket|theme|thesis|idea)\b|companies that|names that|stocks that|\bfind\b.*\b(names|stocks|companies)\b|\bcheap\b.*\b(names|stocks)\b|benefit from/.test(lower)) {
    return [{ tool: "build_basket", input: { thesis: thesisOf(question) } }];
  }
  const asset = /\b(gold|silver|oil|crude|copper|bitcoin|ethereum|crypto|treasury|yield|yields|dollar|euro|yen|natural gas|vix)\b/.exec(lower);
  if (asset && tickers.length === 0) {
    const kind = /crypto/.test(asset[1]!) ? { kind: "crypto" } : /treasury|yield/.test(asset[1]!) ? { kind: "rate" } : { query: asset[1] };
    return [{ tool: "get_markets", input: kind }];
  }
  if (tickers.length >= 2) return [{ tool: "compare_stocks", input: { tickers: tickers.slice(0, 5) } }];
  if (tickers.length === 1) {
    const ticker = tickers[0]!;
    const plan: PlannedCall[] = [{ tool: "get_stock", input: { ticker } }];
    const period = periodIn(question);
    if (since) plan.push({ tool: "get_price_history", input: { ticker, start: since } });
    else if (period || /\b(done|perform|return|rally|fallen|fell|risen|rose|gain|chart|history)\b/.test(lower)) {
      plan.push({ tool: "get_price_history", input: { ticker, period: period ?? "1y" } });
    }
    if (/\b(news|headline|chang|happen|why)\b/.test(lower)) plan.push({ tool: "get_news", input: { ticker } });
    return plan;
  }
  if (/\b(earnings|report|reports|reporting)\b/.test(lower)) return [{ tool: "get_earnings", input: { days: 7 } }];
  if (/\b(news|headline|headlines|wire)\b/.test(lower)) return [{ tool: "get_news", input: {} }];
  if (/\bscreens?\b|screener/.test(lower)) return [{ tool: "get_screens", input: {} }];
  if (/\b(market|markets|movers?|mover|today|indexes|s&p|nasdaq)\b/.test(lower)) return [{ tool: "get_market_brief", input: {} }];
  return [];
}

/* ── writing from cards ─────────────────────────────────────────────────── */

function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(value: number, digits = 2): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One or two plain sentences from a card. Every figure is copied from the card. */
export function describeCard(card: AskCard): string {
  switch (card.card) {
    case "quote": {
      const parts: string[] = [];
      if (card.price !== null) {
        parts.push(`${card.ticker} last traded at ${usd(card.price)}${card.day_change_pct !== null ? `, ${signed(card.day_change_pct)} on the day` : ""}.`);
      } else parts.push(`We have no current price for ${card.ticker}.`);
      if (card.pe_ttm !== null) parts.push(`It trades at ${card.pe_ttm.toFixed(1)}x trailing earnings.`);
      if (card.analyst_target !== null) parts.push(`The analyst target is ${usd(card.analyst_target)}.`);
      if (card.headline) parts.push(card.headline.endsWith(".") ? card.headline : `${card.headline}.`);
      if (card.next_earnings) parts.push(`It reports next on ${day(card.next_earnings.date)}.`);
      else parts.push("We have no confirmed date for its next report.");
      return parts.join(" ");
    }
    case "returns": {
      const versus = card.benchmark ? ` ${card.benchmark.ticker} returned ${signed(card.benchmark.return_pct)} over the same dates.` : "";
      return `From ${day(card.from.date)} to ${day(card.to.date)}, ${card.ticker} returned ${signed(card.return_pct)} (${usd(card.from.close)} to ${usd(card.to.close)}).${versus} Its worst fall from a high in that stretch was ${signed(card.max_drawdown_pct)}.`;
    }
    case "compare": {
      const withReturn = card.rows.filter((row) => row.r_1y !== null).sort((a, b) => (b.r_1y ?? 0) - (a.r_1y ?? 0));
      const lead = withReturn[0];
      const missing = card.missing.length > 0 ? ` We could not find ${list(card.missing)}.` : "";
      if (!lead) return `Here are ${list(card.rows.map((row) => row.ticker))} side by side.${missing}`;
      return `Side by side: ${list(card.rows.map((row) => row.ticker))}. Over one year ${lead.ticker} leads at ${signed(lead.r_1y ?? 0, 1)}.${missing}`;
    }
    case "portfolio":
      return card.rows.length === 0
        ? "Your watchlist is empty. Add a stock and it will show up here."
        : `You track ${card.tracked} names. ${card.needs_attention[0] ? card.needs_attention[0].text : "Nothing is flagged as needing attention right now."}`;
    case "changes":
      return [card.headline, card.body].filter(Boolean).join(". ").replace(/\.\./g, ".");
    case "market_brief": {
      const up = card.gainers[0];
      const down = card.losers[0];
      const parts = [card.title ? `${card.title}.` : "Here is the market today."];
      if (up?.day_change_pct != null) parts.push(`The biggest gainer we track is ${up.ticker} at ${signed(up.day_change_pct)}${up.reason ? `: ${up.reason}` : ""}.`);
      if (down?.day_change_pct != null) parts.push(`The biggest faller is ${down.ticker} at ${signed(down.day_change_pct)}${down.reason ? `: ${down.reason}` : ""}.`);
      return parts.join(" ").replace(/\.\./g, ".");
    }
    case "screens":
      return `There are ${card.screens.length} live screens. The card lists each with its top matches.`;
    case "themes":
      return `These are our research themes: ${list(card.themes.slice(0, 6).map((theme) => theme.name))}.`;
    case "news":
      return card.articles.length === 0
        ? `We found no recent headlines${card.ticker ? ` naming ${card.ticker}` : ""}.`
        : `The latest${card.ticker ? ` on ${card.ticker}` : ""}: "${card.articles[0]!.title}" (${card.articles[0]!.source}). The card has the rest.`;
    case "web":
      return card.results.length === 0 ? "The web search returned nothing." : "The web results are in the card above.";
    case "earnings":
      return card.events.length === 0
        ? `No reports are scheduled for that. ${card.scope}.`
        : card.events.length === 1
          ? `${card.events[0]!.ticker} reports on ${day(card.events[0]!.date)}.`
          : `${card.events.length} companies report in that window. The first is ${card.events[0]!.ticker} on ${day(card.events[0]!.date)}.`;
    case "backtest": {
      const limited = card.limited_by ? ` It starts on ${day(card.start)} because ${card.limited_by.ticker} has no earlier prices.` : "";
      return `Simulated, ${day(card.start)} to ${day(card.end)}: the mix returned ${signed(card.strategy.total_return_pct, 1)} against ${signed(card.benchmark_stats.total_return_pct, 1)} for ${card.benchmark}, with a worst fall of ${signed(card.strategy.max_drawdown_pct, 1)}.${limited} This is a backtest of names picked with hindsight, not a record anyone earned.`;
    }
    case "fund": {
      const top = card.positions.slice(0, 3).map((row) => row.ticker ?? row.name);
      const bought = card.bought.slice(0, 3).map((row) => row.ticker ?? row.name);
      const sold = card.sold.slice(0, 3).map((row) => row.ticker ?? row.name);
      const parts = [`${card.manager}'s ${card.quarter} 13F was filed on ${day(card.filed_at)}. Its largest positions are ${list(top)}.`];
      if (bought.length > 0) parts.push(`It added to or opened ${list(bought)}.`);
      if (sold.length > 0) parts.push(`It cut or sold ${list(sold)}.`);
      parts.push("A 13F shows quarter-end positions, so trades since then are not in it.");
      return parts.join(" ");
    }
    case "investors":
      return `We follow these investors. The newest filing is from ${card.investors[0]?.name ?? "none of them yet"}.`;
    case "congress":
      return card.trades.length === 0
        ? `No disclosed trades match. ${card.scope}.`
        : `${card.scope}: the newest is ${card.trades[0]!.person}, a ${card.trades[0]!.side} of ${card.trades[0]!.ticker} disclosed on ${day(card.trades[0]!.disclosed)}. Amounts are reported as ranges.`;
    case "insiders":
      return card.trades.length === 0
        ? `No Form 4 trades match. ${card.scope}.`
        : `${card.scope}. At the top: ${card.trades[0]!.insider} (${card.trades[0]!.role || "insider"}), a ${card.trades[0]!.side} in ${card.trades[0]!.ticker} filed on ${day(card.trades[0]!.filed)}.`;
    case "markets":
      return `${list(card.assets.slice(0, 3).map((asset) => `${asset.name} is at ${asset.level}${asset.change ? ` (${asset.change} ${asset.change_label})` : ""}`))}.`;
    case "basket": {
      const names = card.lines.slice(0, 5).map((line) => line.ticker);
      const from = card.built_from.length > 0 ? ` It draws on ${list(card.built_from.map((item) => `the ${item.name} ${item.kind}`))}.` : "";
      const more = card.lines.length > names.length ? `, plus ${card.lines.length - names.length} more` : "";
      const risk = card.idea_risk ? " The card says what would break each line, and the idea as a whole." : " The card says what would break each line.";
      return `A basket of ${card.lines.length} names for "${card.thesis}": ${list(names)}${more}.${from}${risk}`;
    }
    case "action":
      return card.action === "add_to_watchlist"
        ? `Ready to add ${list(card.tickers)} to your watchlist. Nothing is saved until you confirm on the card.`
        : `Ready to set the alert on ${card.tickers[0]}. Nothing is created until you confirm on the card.`;
    case "matches":
      return card.matches.length === 0 ? `Nothing in our catalog matches "${card.query}".` : `Closest matches: ${list(card.matches.slice(0, 4).map((match) => `${match.ticker} (${match.name})`))}.`;
    case "sign_in":
      return card.message;
    case "error":
      return card.message;
  }
}

export const OFFLINE_NO_PLAN =
  "This server has no language model key, so the copilot is running on fixed rules and can only handle direct questions: a ticker, a comparison, a backtest, an idea to turn into a basket, a fund's 13F, insider or congressional trades, or the market today.";

/** The answer for a set of tool outputs, in the order the tools ran. */
export function writeOffline(outputs: unknown[]): string {
  const lines = outputs.filter(isAskCard).map(describeCard).filter(Boolean);
  return lines.length > 0 ? lines.join("\n\n") : OFFLINE_NO_PLAN;
}
