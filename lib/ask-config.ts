/**
 * Everything the Ask copilot is configured by, in one place. No server
 * imports here: the route, the page and the client all read this file.
 */

import type { NavIcon } from "@/components/oa/nav-items";
import { limitFor } from "@/lib/entitlements";

export type AskPlan = "anonymous" | "free" | "pro";

/**
 * Questions per UTC day, by plan, read from the one Free vs Pro table
 * (`lib/entitlements.ts`, feature `ask`) so the gate, this page and the
 * pricing page cannot disagree.
 */
export const ASK_LIMITS: Record<AskPlan, { questionsPerDay: number; label: string }> = {
  anonymous: { questionsPerDay: limitFor("ask", "anon"), label: "Signed out" },
  free: { questionsPerDay: limitFor("ask", "free"), label: "Free" },
  pro: { questionsPerDay: limitFor("ask", "pro"), label: "Pro" },
};

/** Most tool calls one answer may make before it has to write. */
export const ASK_MAX_STEPS = 8;
/** How much of a conversation goes back to the model. */
export const ASK_MAX_TURNS_SENT = 16;
export const ASK_MAX_QUESTION_CHARS = 2000;

export const ASK_USAGE_COLLECTION = "tm_agent_ask_usage";
export const ASK_CONVERSATIONS_COLLECTION = "tm_agent_conversations";
export const ASK_MAX_CONVERSATIONS_LISTED = 40;
export const ASK_MAX_MESSAGES_STORED = 60;

/** `icon`: the kind's icon beside its label, the one its own page uses in the nav (components/oa/nav-icon.tsx). */
export type AskSuggestion = { label: string; question: string; icon: NavIcon; needsAccount?: boolean };

/** Real questions, each one answerable from the tools. */
export const ASK_SUGGESTIONS: AskSuggestion[] = [
  { label: "A stock", icon: "research", question: "What changed for Nvidia this week, and when does it report next?" },
  { label: "A comparison", icon: "compare", question: "Compare Microsoft, Alphabet and Amazon on valuation and one-year return." },
  { label: "An idea", icon: "themes", question: "Build me a basket of companies that benefit from power grid spending." },
  { label: "A backtest", icon: "backtest", question: "Backtest AAPL, MSFT and NVDA vs the S&P" },
  { label: "Smart money", icon: "follow", question: "What did Berkshire Hathaway buy and sell in its latest 13F?" },
  { label: "My week", icon: "portfolio", question: "How is my portfolio doing this week?", needsAccount: true },
  { label: "My reasons", icon: "agents", question: "Which of my reasons for owning a stock are weaker now?", needsAccount: true },
];

export const EXPLORE_SUGGESTIONS: string[] = [
  "Find cheap uranium names",
  "Which insiders bought their own stock this month?",
  "Why did the biggest mover fall today?",
  "Backtest NVDA, AVGO and TSM since 2020",
];

/** What the page says while a tool is running. */
export const ASK_TOOL_LABELS: Record<string, string> = {
  find_stock: "Looking up the ticker",
  get_stock: "Reading the stock",
  get_price_history: "Pulling price history",
  compare_stocks: "Comparing",
  get_my_portfolio: "Reading your portfolio",
  get_portfolio_changes: "Checking what changed",
  get_market_brief: "Reading the market",
  get_screens: "Running the screens",
  get_themes: "Reading the themes",
  get_news: "Reading the wire",
  web_search: "Searching the web",
  get_earnings: "Checking the calendar",
  run_backtest: "Running the backtest",
  list_investors: "Listing investors",
  get_investor: "Reading the filings",
  get_congress_trades: "Reading congressional disclosures",
  get_insider_trades: "Reading Form 4 filings",
  get_markets: "Pulling quotes",
  build_basket: "Building the basket",
  propose_watchlist_add: "Preparing the watchlist change",
  propose_price_alert: "Preparing the alert",
  get_my_reasons: "Checking your reasons",
  get_my_week: "Reading this week's memo",
  get_my_agents: "Reading your agents",
  get_my_research: "Opening your research",
  open_briefing_item: "Opening your briefing",
  suggest_watch: "Filling in an agent",
  get_filing_changes: "Comparing its filings",
  get_my_baskets: "Reading your idea baskets",
  get_my_basket: "Reading your idea basket",
  watch_idea: "Drafting the basket",
};

/** The same steps once they are done, for the line above a finished answer. */
export const ASK_TOOL_DONE: Record<string, string> = {
  find_stock: "found the ticker",
  get_stock: "read the stock",
  get_price_history: "pulled price history",
  compare_stocks: "compared",
  get_my_portfolio: "read your portfolio",
  get_portfolio_changes: "checked what changed",
  get_market_brief: "read the market",
  get_screens: "ran the screens",
  get_themes: "read the themes",
  get_news: "read the wire",
  web_search: "searched the web",
  get_earnings: "checked the calendar",
  run_backtest: "ran the backtest",
  list_investors: "listed investors",
  get_investor: "read the filings",
  get_congress_trades: "read congressional disclosures",
  get_insider_trades: "read Form 4 filings",
  get_markets: "pulled quotes",
  build_basket: "built the basket",
  propose_watchlist_add: "prepared the watchlist change",
  propose_price_alert: "prepared the alert",
  get_my_reasons: "checked your reasons",
  get_my_week: "read this week's memo",
  get_my_agents: "read your agents",
  get_my_research: "opened your research",
  open_briefing_item: "opened your briefing",
  suggest_watch: "set up a watch you can save",
  get_filing_changes: "compared its filings",
  get_my_baskets: "read your idea baskets",
  get_my_basket: "read your idea basket",
  watch_idea: "drafted the basket",
};
