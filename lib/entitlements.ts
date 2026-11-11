/**
 * Free vs Pro, in one place.
 *
 * Every gate in the product reads this table: the server decides what data to
 * load from it, the lock cards take their words from it, and the pricing page
 * renders it. Change a limit here and all three move together.
 *
 * The line (from the paywall research, 2026-11-09, scratchpad
 * paywall-research.md): reading is free, the agent working for you is the
 * product. Three rules produce every row.
 *
 *   1. Anything the pipeline writes once for everyone (the call and its
 *      headline, filings, fund pages, strategy rules and backtests) is free to
 *      read. It costs nothing per reader and it is how people find us. The
 *      reasoning behind a call and what a strategy holds now are not: those
 *      are what Pro sells (changed 2026-11-10).
 *   2. One number matters: covered stocks. Tracking is unlimited on every
 *      signed-in plan: what you own and what you watch, with prices, the call
 *      and the earnings date. A covered stock also gets the full agent
 *      treatment: price zones, the reasons behind the call, explained moves
 *      in the briefing, zone and call alerts, the pre-earnings read. Free
 *      covers 5 (one swap a week, lib/entitlements-coverage.ts), Pro covers
 *      everything.
 *   3. Everything else works on Free at a small count, so a limit always
 *      reads "you have used your 2, want more?" and never "what is this?".
 *
 * Never gated, on any plan: the call itself and when it was made (the same
 * call for every reader, at the same time), sources, as-of times, risk notes,
 * backtest caveats and methodology, public filings, the user's own data and
 * its export, and cancelling.
 *
 * This file is pure (no server imports) so client components can read it.
 */

export type Plan = "anon" | "free" | "pro";

export type Rule =
  /** No limit. */
  | { kind: "open" }
  /** Not available on this plan. */
  | { kind: "locked" }
  /** Available on the stocks the agent covers for this account. */
  | { kind: "covered" }
  /** At most `max` things kept at once (covered stocks, agents, alerts). */
  | { kind: "count"; max: number; unit: string }
  /** At most `max` uses per period (questions, backtests). */
  | { kind: "meter"; max: number; per: "day" | "month"; unit: string }
  /** The most recent `max` days, months, quarters or years. */
  | { kind: "depth"; max: number; unit: string };

const open: Rule = { kind: "open" };
const locked: Rule = { kind: "locked" };
const covered: Rule = { kind: "covered" };
const count = (max: number, unit: string): Rule => ({ kind: "count", max, unit });
const meter = (max: number, per: "day" | "month", unit: string): Rule => ({ kind: "meter", max, per, unit });
const depth = (max: number, unit: string): Rule => ({ kind: "depth", max, unit });

/** How many stocks the agent covers in full on Free. */
export const FREE_COVERED_STOCKS = 5;
/** How often a Free account may swap which stocks are covered. */
export const FREE_COVER_SWAPS_PER_WEEK = 1;

export type FeatureGroup =
  | "Your stocks"
  | "Research"
  | "Ask"
  | "Follow"
  | "Test ideas"
  | "Agents and alerts"
  | "Delivery"
  | "Build";

export type Feature = {
  /** Row name on the pricing page. */
  name: string;
  group: FeatureGroup;
  anon: Rule;
  free: Rule;
  pro: Rule;
  /** The lock card: what is behind it and the way out that costs nothing. */
  lock: { title: string; body: string };
};

const NO_LOCK = { title: "", body: "" };

export const FEATURES = {
  /* ── Your stocks ─────────────────────────────────────────────────────── */
  tracked_stocks: {
    name: "Stocks you track: holdings and watched names, with prices, the call and the earnings date",
    group: "Your stocks",
    anon: locked,
    free: open,
    pro: open,
    lock: {
      title: "Sign in to track stocks",
      body: "Track as many stocks as you like on a free account, holdings and watched names together.",
    },
  },
  covered_stocks: {
    name: "Stocks your agent covers in full",
    group: "Your stocks",
    anon: locked,
    free: count(FREE_COVERED_STOCKS, "stocks"),
    pro: open,
    lock: {
      title: "Free covers five stocks",
      body: "A covered stock gets price zones, the reasons behind the call, explained moves in your briefing and the pre-earnings read. Swap one out (Free swaps one a week), or go Pro and cover everything you track.",
    },
  },
  stock_call: {
    name: "Our call on every stock: add, hold or trim, in one line, with the date",
    group: "Your stocks",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  stock_zones: {
    name: "The full read: price zones, the reasons behind the call, what would change it and its history",
    group: "Your stocks",
    anon: locked,
    free: covered,
    pro: open,
    lock: {
      title: "Cover this stock to see the full read",
      body: "The call is free for everyone. The reasons behind it, the price zones, what would change it and how it has moved come with covering a stock. Use one of your five covered slots, or go Pro for every stock.",
    },
  },
  briefing_personal: {
    name: "Daily briefing: what moved, why, and what needs you",
    group: "Your stocks",
    anon: locked,
    free: covered,
    pro: open,
    lock: {
      title: "The rest of your portfolio moved too",
      body: "Your briefing explains the stocks your agent covers, and you can swap which five those are once a week. Pro explains every holding.",
    },
  },
  // The reason watcher (lib/thesis-watch): saving a reason is free on every stock; checking it is the agent's work.
  reason_watch: {
    name: "Reason watcher: the agent checks why you own each stock and says when the reason weakens or breaks",
    group: "Your stocks",
    anon: locked,
    free: covered,
    pro: open,
    lock: {
      title: "Free checks the reasons on your covered stocks",
      body: "Your reason is saved on every stock. The agent checks it on the five stocks it covers for you, and you can swap which five once a week. Pro checks every reason you save.",
    },
  },
  portfolio_analytics: {
    name: "Portfolio analytics: allocation, concentration, risk, performance vs S&P 500",
    group: "Your stocks",
    anon: locked,
    free: open,
    pro: open,
    lock: {
      title: "Sign in to see your analytics",
      body: "Allocation, concentration and performance against the S&P 500 for whatever you add. Free.",
    },
  },
  practice_account: {
    name: "Practice account with $100,000 of paper money",
    group: "Your stocks",
    anon: locked,
    free: open,
    pro: open,
    lock: {
      title: "Sign in to open a practice account",
      body: "A paper account with $100,000 to try ideas without real money. Free.",
    },
  },

  /* ── Research ────────────────────────────────────────────────────────── */
  stock_report: {
    name: "Stock reports: the read, financials, valuation, earnings, ownership, news",
    group: "Research",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  wire: {
    name: "The wire, calendar, filings and every market",
    group: "Research",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  pre_earnings_read: {
    name: "Pre-earnings read: what the report has to show",
    group: "Research",
    anon: locked,
    free: covered,
    pro: open,
    lock: {
      title: "The pre-earnings read is ready for this stock",
      body: "The date and the estimates are free for every stock. What the report has to show, how the stock reacted the last four times and what would change the call come with covering it. Use one of your five, or go Pro.",
    },
  },
  signals: {
    name: "Signals: unusual movers with the reason, Reddit, policy posts",
    group: "Research",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  signals_archive: {
    name: "How far back the signals archive goes",
    group: "Research",
    anon: depth(7, "days"),
    free: depth(7, "days"),
    pro: open,
    lock: {
      title: "Older posts are part of Pro",
      body: "The last seven days of signals are free for everyone, with the source and the time on every row. Pro keeps the whole archive.",
    },
  },
  screener: {
    name: "Screener: every filter on the data, every match",
    group: "Research",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  screener_call_filters: {
    name: "Screen the whole market by our call and price zones",
    group: "Research",
    anon: locked,
    free: locked,
    pro: open,
    lock: {
      title: "Screening by our call is part of Pro",
      body: "The call is free on every stock page. Listing every stock rated add, or every stock inside its add zone today, is Pro.",
    },
  },
  saved_screens: {
    name: "Saved screens",
    group: "Research",
    anon: locked,
    free: count(2, "screens"),
    pro: open,
    lock: { title: "Free keeps two saved screens", body: "Replace one, or go Pro and keep as many as you want." },
  },
  themes: {
    name: "Idea baskets: the thesis and every line with its reasoning",
    group: "Research",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  compare: {
    name: "Compare stocks side by side",
    group: "Research",
    anon: count(2, "stocks"),
    free: count(2, "stocks"),
    pro: count(4, "stocks"),
    lock: { title: "Free compares two stocks at a time", body: "Swap one out to compare another, or go Pro and compare up to four side by side." },
  },
  export_data: {
    name: "Export research tables to CSV (your own holdings always export free)",
    group: "Research",
    anon: locked,
    free: locked,
    pro: open,
    lock: {
      title: "Exporting research tables is part of Pro",
      body: "Screens, fund portfolios and backtest trades download as CSV on Pro. Your own holdings export free on any plan, and every table stays free to read.",
    },
  },
  deep_research: {
    name: "Full research on any stock: a long, sourced report from filings, earnings, peers, ownership and news",
    group: "Research",
    // Each report is a dozen reads, two SEC documents and one long model call, so it needs an account.
    anon: locked,
    // Three a month lets someone research what they are deciding on now. Measured 2026-11-11: about $0.005 to $0.009 a report on Haiku 5.5.
    free: meter(3, "month", "reports"),
    pro: meter(30, "month", "reports"),
    lock: {
      title: "That is this month's full research used",
      body: "Free includes three full research reports each month, and every report you ran stays saved. Pro includes 30 each month.",
    },
  },

  /* ── Ask ─────────────────────────────────────────────────────────────── */
  ask: {
    name: "Ask: sourced answers about any stock or your portfolio",
    group: "Ask",
    // Every question is a paid model call, so signed-out visitors get none and Free gets a taste.
    anon: locked,
    free: meter(3, "day", "questions"),
    // 50 keeps a daily heavy user well under the price. Measured 2026-11-10: about $0.002 a question on Haiku.
    pro: meter(50, "day", "questions"),
    lock: {
      title: "That is today's questions used",
      body: "Free includes three questions a day and resets at midnight UTC. Pro includes 50.",
    },
  },

  /* ── Follow ──────────────────────────────────────────────────────────── */
  follow_directory: {
    name: "Funds, Congress and insiders: full portfolios, every filing, the record vs S&P 500",
    group: "Follow",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  followed_sources: {
    name: "Investors you follow",
    group: "Follow",
    anon: locked,
    free: count(3, "investors"),
    pro: open,
    lock: {
      title: "Free follows three investors",
      body: "Unfollow one to make room, or go Pro and follow as many funds, members of Congress and insiders as you like.",
    },
  },

  /* ── Test ideas ──────────────────────────────────────────────────────── */
  strategies: {
    name: "Strategies: the rules, the full backtest, the caveats and past holdings",
    group: "Test ideas",
    anon: open,
    free: open,
    pro: open,
    lock: NO_LOCK,
  },
  strategy_holdings: {
    name: "What each strategy holds now, and its latest rebalances",
    group: "Test ideas",
    anon: locked,
    free: locked,
    pro: open,
    lock: {
      title: "What it holds now is part of Pro",
      body: "The rules, the backtest and older rebalances are free. Today's basket and the latest changes to it come with Pro.",
    },
  },
  followed_strategies: {
    name: "Strategies you follow, with a note at each rebalance",
    group: "Test ideas",
    anon: locked,
    // A note at each rebalance names what was bought and sold, which is the basket held now.
    free: locked,
    pro: open,
    lock: {
      title: "Following a strategy is part of Pro",
      body: "Pro sends a note at each rebalance with what changed. The rules and the backtest stay free.",
    },
  },
  backtest: {
    name: "Backtests you run yourself",
    group: "Test ideas",
    anon: meter(2, "day", "runs"),
    free: meter(3, "day", "runs"),
    pro: meter(100, "day", "runs"),
    lock: {
      title: "That is today's backtests used",
      body: "Free runs three a day and resets at midnight UTC. Pro runs 100.",
    },
  },
  backtest_history: {
    name: "How far back a backtest can look",
    group: "Test ideas",
    anon: depth(5, "years"),
    free: depth(5, "years"),
    pro: open,
    lock: {
      title: "Pro tests the full history",
      body: "Free tests the last five years. Pro tests every year we have, which covers more than one kind of market. The caveats are the same on both.",
    },
  },

  /* ── Agents and alerts ───────────────────────────────────────────────── */
  agents: {
    name: "Agents that watch for you, on a schedule, a price, or an event",
    group: "Agents and alerts",
    anon: locked,
    free: count(2, "agents"),
    pro: count(20, "agents"),
    lock: {
      title: "Saved and paused: Free runs two agents at a time",
      body: "Your agent is saved. Pause another to run this one, or go Pro and run up to 20.",
    },
  },
  price_alerts: {
    name: "Price alerts by email",
    group: "Agents and alerts",
    anon: locked,
    free: count(5, "alerts"),
    pro: open,
    lock: {
      title: "Free keeps five price alerts",
      body: "Delete one you no longer need, or wait for one to fire (a fired alert frees its slot). Pro keeps as many as you like.",
    },
  },
  zone_alerts: {
    name: "Email when a stock enters its zone, reports earnings, or the call changes",
    group: "Agents and alerts",
    anon: locked,
    free: locked,
    pro: open,
    lock: {
      title: "Zone and call alerts are part of Pro",
      body: "An email the day a stock you follow drops into its add zone, reaches its trim zone, reports, or gets a new call. On Free the same things show up in your briefing.",
    },
  },

  /* ── Delivery ────────────────────────────────────────────────────────── */
  email_market: {
    name: "Daily market email",
    group: "Delivery",
    anon: locked,
    free: open,
    pro: open,
    lock: { title: "Sign in to get the market email", body: "A daily market note. Free." },
  },
  email_briefing: {
    name: "Your daily brief before the open (only on days something changed) and the Saturday recap",
    group: "Delivery",
    anon: locked,
    free: covered,
    pro: open,
    lock: {
      title: "The email covers your five covered stocks",
      body: "Free gets the daily brief and the weekly recap for the five stocks it covers, plus a note when something outside them moves. Pro covers every stock you track.",
    },
  },

  /* ── Build ───────────────────────────────────────────────────────────── */
  agent_api: {
    name: "API, MCP server and CLI for your own AI agent",
    group: "Build",
    anon: locked,
    free: locked,
    pro: meter(200, "day", "calls"),
    lock: {
      title: "Agent access is part of Pro",
      body: "Connect Claude, Codex, Cursor or your own agent to your stocks and our research, 200 calls a day. Everything it would read stays free in the app.",
    },
  },
} as const satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export const FEATURE_GROUPS: FeatureGroup[] = [
  "Your stocks",
  "Research",
  "Ask",
  "Follow",
  "Test ideas",
  "Agents and alerts",
  "Delivery",
  "Build",
];

export function planOf(viewer: { signedIn: boolean; isSubscribed: boolean }): Plan {
  if (!viewer.signedIn) return "anon";
  return viewer.isSubscribed ? "pro" : "free";
}

export function ruleFor(feature: FeatureId, plan: Plan): Rule {
  return (FEATURES[feature] as Feature)[plan];
}

/** True when the plan can use the feature at all (possibly with a limit). */
export function can(feature: FeatureId, plan: Plan): boolean {
  return ruleFor(feature, plan).kind !== "locked";
}

/** The numeric limit for the plan: Infinity when open, 0 when locked. */
export function limitFor(feature: FeatureId, plan: Plan): number {
  const rule = ruleFor(feature, plan);
  if (rule.kind === "open") return Number.POSITIVE_INFINITY;
  if (rule.kind === "locked") return 0;
  if (rule.kind === "covered") return limitFor("covered_stocks", plan);
  return rule.max;
}

/**
 * Cut a list to what the plan may see. Run this on the server and send only
 * `items` to the browser: `hidden` is a count, never the hidden rows.
 */
export function clip<T>(feature: FeatureId, plan: Plan, items: readonly T[]): { items: T[]; hidden: number } {
  const limit = limitFor(feature, plan);
  if (items.length <= limit) return { items: [...items], hidden: 0 };
  return { items: items.slice(0, limit), hidden: items.length - limit };
}

/**
 * Keep only rows inside the plan's archive depth (a `depth` rule in days).
 * Like `clip`, run it on the server and send only `items`: `hidden` is a count.
 * Rows with no readable date are kept, since their age is unknown.
 */
export function clipByAge<T>(
  feature: FeatureId,
  plan: Plan,
  items: readonly T[],
  dateOf: (item: T) => string | null | undefined,
  now: number = Date.now(),
): { items: T[]; hidden: number; days: number | null } {
  const rule = ruleFor(feature, plan);
  if (rule.kind !== "depth" || rule.unit !== "days") return { items: [...items], hidden: 0, days: null };
  const cutoff = now - rule.max * 24 * 60 * 60 * 1000;
  const kept = items.filter((item) => {
    const at = Date.parse(String(dateOf(item) ?? ""));
    return !Number.isFinite(at) || at >= cutoff;
  });
  return { items: kept, hidden: items.length - kept.length, days: rule.max };
}

/** What the next step is for someone who hit a limit. */
export function nextStep(feature: FeatureId, plan: Plan): "sign_in" | "upgrade" | null {
  if (plan === "pro") return null;
  if (plan === "anon" && limitFor(feature, "free") > limitFor(feature, "anon")) return "sign_in";
  return "upgrade";
}

/** "5 stocks", "5 questions a day", "Last 8 quarters", "Covered stocks", "Included", "Not included". */
export function describeRule(rule: Rule): string {
  switch (rule.kind) {
    case "open":
      return "Included";
    case "locked":
      return "Not included";
    case "covered":
      return "Covered stocks";
    case "count":
      return `${rule.max} ${rule.unit}`;
    case "meter":
      return `${rule.max} ${rule.unit} a ${rule.per}`;
    case "depth":
      return `Last ${rule.max} ${rule.unit}`;
  }
}

export function lockCopy(feature: FeatureId): { title: string; body: string } {
  return (FEATURES[feature] as Feature).lock;
}

/* ── price levels inside prose ─────────────────────────────────────────── */

const MONEY = /(?:[$₹]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*\.\d{2}\b)/;
const LEVEL_WORDS =
  /\b(?:add|adding|accumulat\w*|trim\w*|reduce|reducing|zones?|levels?|targets?|entry|buy below|sell above|breakout|break out|stop|support|resistance|pullback to|into)\b/i;

/**
 * Drop every sentence that pairs a price with level words ("The add level is
 * $182.40"), keeping the rest. The call engine writes its levels into the
 * call's one-line summary, so prose about an uncovered stock goes through this
 * before it reaches a browser or a model. Returns null when nothing is left.
 */
export function redactLevels(text: string | null | undefined): string | null {
  const clean = typeof text === "string" ? text.trim() : "";
  if (!clean) return null;
  const kept = clean
    .split(/(?<=[.!?;])\s+/)
    .filter((sentence) => !(MONEY.test(sentence) && LEVEL_WORDS.test(sentence)));
  const out = kept.join(" ").trim();
  return out || null;
}

/** `redactLevels` over every string inside a JSON-like value. */
export function redactLevelsDeep<T>(value: T): T {
  if (typeof value === "string") return (redactLevels(value) ?? "") as T;
  if (Array.isArray(value)) return value.map((item) => redactLevelsDeep(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = redactLevelsDeep(item);
    return out as T;
  }
  return value;
}
