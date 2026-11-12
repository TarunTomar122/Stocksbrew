/**
 * One dated list of everything that changed for a stock.
 *
 * The stock page used to scatter these across cards (news, earnings, Congress,
 * Reddit, analysts). This builder merges them into a single timeline, newest
 * first, where every row keeps the source it came from and the time it
 * happened. It is pure: no I/O, no clock other than `now`, so it can be tested.
 *
 * Nothing here is generated at request time. Rows are either facts from a data
 * source or text a pipeline wrote earlier and stored.
 */

import { firmIsSubject } from "@/lib/analyst-firms";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { NewsArticle } from "@/lib/news";
import type { PowerTrade } from "@/lib/power-trades";
import type { StockFacts, TimelineEvent } from "@/lib/stock";
import { plainAction, sentenceCase } from "@/lib/plain-copy";

export type StockTimelineKind =
  | "move"
  | "earnings"
  | "analyst"
  | "news"
  | "congress"
  | "discussion"
  | "dividend"
  | "call";

export type StockTimelineItem = {
  id: string;
  kind: StockTimelineKind;
  /** ISO datetime (`precision: "time"`) or ISO date (`"day"` / `"month"`). */
  at: string;
  precision: "time" | "day" | "month";
  title: string;
  detail?: string;
  /** Where the row came from, shown beside it. */
  source: string;
  sourceUrl?: string;
  tone?: "up" | "down" | "flat";
  /** True when the row has more detail that is part of Pro. */
  locked?: boolean;
  /** Internal link for the full story (earnings report, Congress page). */
  href?: string;
};

export type StockTimelineUpcoming = {
  id: string;
  kind: "earnings" | "dividend";
  /** ISO date. */
  date: string;
  title: string;
  detail?: string;
  source: string;
};

export type StockTimelineInput = {
  ticker: string;
  /** The company's name, so its own words keep their capitals when a Title Case headline goes to sentence case. */
  companyName?: string | null;
  now: Date;
  /** Today's move, already reduced to what we can stand behind. */
  move?: {
    asOf?: string | null;
    dayChangePct: number;
    headline: string;
    detail?: string | null;
    evidenceUrl?: string | null;
    evidenceTitle?: string | null;
  } | null;
  news?: NewsArticle[];
  /** Curated events from the brief pipeline (Pro). */
  briefEvents?: TimelineEvent[] | null;
  /** Latest post-earnings report. `earningsLocked` hides the analysis for free readers. */
  earnings?: Pick<EarningsIntelDoc, "event_date" | "report" | "ticker"> | null;
  earningsLocked?: boolean;
  /** Last reported earnings date when we have no report to show. */
  lastEarningsDate?: string | null;
  powerTrades?: PowerTrade[] | null;
  reddit?: {
    generatedAt?: string | null;
    postCount?: number | null;
    sentiment?: string | null;
    windowHours?: number | null;
  } | null;
  facts?: Pick<StockFacts, "dividends" | "analyst_trend" | "events"> | null;
  /** The call changed since the previous brief. */
  /** `from` / `to` are the call words a reader sees ("Buy more", "Keep"), when the ledger confirms the switch. */
  callChange?: { at?: string | null; reason?: string | null; headline?: string | null; from?: string | null; to?: string | null } | null;
  /** Days our call switched between add, hold and trim, from the call ledger. */
  callHistory?: Array<{ date: string; from: string | null; to: string; text?: string | null; priceAtCall?: number | null }> | null;
  /** Where a congressional trade row links to. Defaults to the Congress page. */
  congressHref?: (trade: PowerTrade) => string;
  /** Next scheduled report from the earnings calendar. */
  nextEarnings?: { date: string; time?: string | null; epsEstimate?: number | null; source: string } | null;
};

const DAY_MS = 86_400_000;

/**
 * A source headline as a person would write it (owner rule 8): Scraped Title Case goes to sentence case, keeping the
 * company's own words, and a trailing " - Benzinga" goes when the row already names that publisher.
 */
export function timelineHeadline(title: string, source: string | null | undefined, companyName = ""): string {
  const publisher = String(source ?? "").trim();
  let text = title.trim();
  const bareSource = publisher.replace(/^the\s+/i, "");
  if (bareSource) {
    // "- The Motley Fool" for the source "Motley Fool" goes too.
    const tail = new RegExp(`\\s+[-–—|]\\s+(?:the\\s+)?${bareSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    const stripped = text.replace(tail, "");
    if (stripped) text = stripped;
  }
  return sentenceCase(text, companyName);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Sep 10, 2026" or "2026-09-10" to "2026-09-10". Returns null when unparseable. */
export function parseLooseDate(raw: string | null | undefined): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[1]!.toLowerCase());
    if (month < 0) return null;
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`;
  }
  return null;
}

/** "Jun '26" to "2026-06-01". */
export function parseMonthPeriod(raw: string | null | undefined): string | null {
  const match = /^([A-Za-z]{3})[a-z]*\.?\s+'?(\d{2}|\d{4})$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!.toLowerCase());
  if (month < 0) return null;
  const year = match[2]!.length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Sort key in ms. Day rows sort to the end of their day, month rows to the end of their month (never past now). */
export function timelineSortMs(item: Pick<StockTimelineItem, "at" | "precision">, now: Date): number {
  if (item.precision === "time") {
    const ms = new Date(item.at).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const [y, m, d] = item.at.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return 0;
  if (item.precision === "day") return Math.min(Date.UTC(y, m - 1, d, 23, 59, 0), now.getTime());
  return Math.min(Date.UTC(y, m, 0, 12, 0, 0), now.getTime() - 1);
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" to "Oct 1", with the year when it is not the current one. */
export function prettyDay(iso: string, now: Date): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const label = `${MONTH_LABELS[m - 1]} ${d}`;
  return y === now.getUTCFullYear() ? label : `${label}, ${y}`;
}

/** Dividends are often quoted to a tenth of a cent; keep that, drop padding past two places. */
function dividendAmount(amount: number): string {
  const three = amount.toFixed(3);
  return three.endsWith("0") ? amount.toFixed(2) : three;
}

function normTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function amountShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function amountRange(low: number | null, high: number | null): string | null {
  if (low != null && high != null) return `${amountShort(low)} to ${amountShort(high)}`;
  if (low != null) return `${amountShort(low)} or more`;
  return null;
}

type RatingRow = NonNullable<NonNullable<StockFacts["analyst_trend"]>["recommendation_trend"]>[number];

function ratingCounts(row: RatingRow) {
  const strongBuy = fin(row.strong_buy) ? row.strong_buy : 0;
  const buy = fin(row.buy) ? row.buy : 0;
  const hold = fin(row.hold) ? row.hold : 0;
  const sell = (fin(row.sell) ? row.sell : 0) + (fin(row.strong_sell) ? row.strong_sell : 0);
  return { buy: strongBuy + buy, hold, sell, total: strongBuy + buy + hold + sell };
}

/** Month-over-month shifts in analyst ratings. Only months where something moved. */
export function analystTrendChanges(
  trend: RatingRow[] | null | undefined,
): Array<{ at: string; title: string; detail: string; tone: "up" | "down" | "flat" }> {
  const rows = (trend ?? [])
    .map((row) => ({ at: parseMonthPeriod(row.period), period: row.period, counts: ratingCounts(row) }))
    .filter((row): row is { at: string; period: string; counts: ReturnType<typeof ratingCounts> } =>
      Boolean(row.at) && row.counts.total > 0,
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const out: Array<{ at: string; title: string; detail: string; tone: "up" | "down" | "flat" }> = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const dBuy = cur.counts.buy - prev.counts.buy;
    const dHold = cur.counts.hold - prev.counts.hold;
    const dSell = cur.counts.sell - prev.counts.sell;
    if (dBuy === 0 && dHold === 0 && dSell === 0) continue;
    const moves: string[] = [];
    const say = (delta: number, label: string) => {
      if (delta === 0) return;
      moves.push(`${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} ${label}`);
    };
    say(dBuy, "buy");
    say(dHold, "hold");
    say(dSell, "sell");
    const tone = dBuy - dSell > 0 ? "up" : dBuy - dSell < 0 ? "down" : "flat";
    out.push({
      at: cur.at,
      title: `Analyst ratings shifted: ${moves.join(", ")}`,
      detail: `${cur.counts.buy} buy, ${cur.counts.hold} hold, ${cur.counts.sell} sell in ${cur.period}, against ${prev.counts.buy} buy, ${prev.counts.hold} hold, ${prev.counts.sell} sell in ${prev.period}.`,
      tone,
    });
  }
  return out;
}

export function buildStockTimeline(input: StockTimelineInput): {
  items: StockTimelineItem[];
  upcoming: StockTimelineUpcoming[];
} {
  const { ticker, now } = input;
  const today = isoDay(now);
  const items: StockTimelineItem[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  const remember = (title: string, url?: string | null) => {
    if (url) seenUrls.add(url.split("?")[0]!);
    seenTitles.add(normTitle(title));
  };
  const isDuplicate = (title: string, url?: string | null) =>
    (url ? seenUrls.has(url.split("?")[0]!) : false) || seenTitles.has(normTitle(title));

  // Today's move, when we researched it.
  if (input.move?.headline) {
    const at = input.move.asOf && Number.isFinite(new Date(input.move.asOf).getTime()) ? input.move.asOf : null;
    items.push({
      id: "move",
      kind: "move",
      at: at ?? today,
      precision: at ? "time" : "day",
      title: input.move.headline,
      detail: input.move.detail ?? undefined,
      source: input.move.evidenceTitle ? `stocksbrew move research, citing ${input.move.evidenceTitle}` : "stocksbrew move research",
      sourceUrl: input.move.evidenceUrl ?? undefined,
      tone: input.move.dayChangePct >= 0 ? "up" : "down",
    });
    remember(input.move.headline);
  }

  // The call changed.
  if (input.callChange?.at && (input.callChange.reason || input.callChange.headline)) {
    items.push({
      id: "call-change",
      kind: "call",
      at: input.callChange.at,
      precision: "time",
      title:
        input.callChange.from && input.callChange.to
          ? `We changed our call from ${input.callChange.from} to ${input.callChange.to}`
          : input.callChange.headline
            ? `We changed our call to "${plainAction(input.callChange.headline, null) ?? input.callChange.headline}"`
            : "We changed our call",
      detail: input.callChange.reason ?? undefined,
      source: "stocksbrew brief",
      href: "#read",
    });
  }

  // Earlier switches from the call ledger. A switch on the same day as the
  // brief's own change note is skipped: the brief already explains it.
  const briefChangeDay = items.find((item) => item.id === "call-change")?.at.slice(0, 10) ?? null;
  for (const change of input.callHistory ?? []) {
    const day = parseLooseDate(change.date);
    if (!day || day > today || day === briefChangeDay) continue;
    const label = change.text?.trim().replace(/\.+$/, "");
    const price = fin(change.priceAtCall) ? `${ticker} was at $${change.priceAtCall.toFixed(2)}.` : "";
    items.push({
      id: `call-${day}`,
      kind: "call",
      at: day,
      precision: "day",
      title: change.from
        ? `Our call moved from ${change.from.toLowerCase()} to ${change.to.toLowerCase()}`
        : `We started covering ${ticker} with a ${change.to.toLowerCase()} call`,
      detail: [label ? `${label}.` : "", price].filter(Boolean).join(" ") || undefined,
      source: "stocksbrew call ledger",
      tone: change.to === "Add" ? "up" : change.to === "Trim" ? "down" : "flat",
    });
  }

  // News, newest first. The feed is already filtered to this ticker.
  for (const article of input.news ?? []) {
    if (!article.title || !article.published_at) continue;
    // Compared as shown (publisher tail off), so "X - Benzinga" here and "X" from the brief are one story.
    const shown = timelineHeadline(article.title, article.source_name, input.companyName ?? "");
    if (isDuplicate(shown, article.url)) continue;
    remember(shown, article.url);
    const tone = article.sentiment_label === "bullish" ? "up" : article.sentiment_label === "bearish" ? "down" : "flat";
    items.push({
      id: `news-${article.id || article.url}`,
      kind: "news",
      at: article.published_at,
      precision: "time",
      title: shown,
      detail: article.summary && normTitle(article.summary) !== normTitle(article.title) ? article.summary : undefined,
      source: article.source_name || "News",
      sourceUrl: article.url,
      tone,
    });
  }

  // Events the brief pipeline picked out. Skip anything the news feed already carries.
  for (const event of input.briefEvents ?? []) {
    const title = event.title?.trim();
    if (!title || !event.timestamp) continue;
    // A bank quoted as the analyst ("JPMorgan says Strategy could face...") is not news about the bank.
    if (!firmIsSubject(ticker, title)) continue;
    const shown = timelineHeadline(title, event.source_name, input.companyName ?? "");
    if (isDuplicate(shown, event.article_url)) continue;
    remember(shown, event.article_url);
    const label = (event.sentiment_label ?? "").toLowerCase();
    items.push({
      id: `evt-${event.event_id ?? title}`,
      kind: "news",
      at: event.timestamp,
      precision: "time",
      title: shown,
      detail: event.summary && normTitle(event.summary) !== normTitle(title) ? event.summary : undefined,
      source: event.source_name || "News",
      sourceUrl: event.article_url,
      tone: label === "bullish" ? "up" : label === "bearish" ? "down" : "flat",
    });
  }

  // The last earnings report.
  const earningsDay = parseLooseDate(input.earnings?.event_date) ?? parseLooseDate(input.lastEarningsDate);
  if (earningsDay && earningsDay <= today) {
    const report = input.earnings?.report;
    const showReport = Boolean(report?.headline) && !input.earningsLocked;
    const facts = report?.facts;
    const detail = showReport
      ? [facts?.reported_vs_expected, facts?.guidance_signal, facts?.price_reaction].filter(Boolean).join(" ")
      : undefined;
    items.push({
      id: `earnings-${earningsDay}`,
      kind: "earnings",
      at: earningsDay,
      precision: "day",
      title: showReport ? report!.headline : `${ticker} reported earnings`,
      detail: detail || undefined,
      source: showReport ? "stocksbrew earnings report" : "Earnings calendar",
      locked: Boolean(report?.headline) && Boolean(input.earningsLocked),
      href: report?.headline ? `/earnings-intel/${ticker}` : undefined,
    });
  }

  // Congressional trades, dated by when the trade happened; the disclosure date rides in the detail.
  for (const trade of input.powerTrades ?? []) {
    const day = parseLooseDate(trade.transaction_date);
    if (!day) continue;
    const verb = trade.tx_type === "buy" ? "bought" : trade.tx_type === "sell" ? "sold" : "traded";
    const range = amountRange(trade.amount_low, trade.amount_high);
    const chamber = trade.chamber ? trade.chamber.charAt(0).toUpperCase() + trade.chamber.slice(1) : "";
    const who = [chamber, [trade.party, trade.state].filter(Boolean).join("-")].filter(Boolean).join(", ");
    const disclosed = parseLooseDate(trade.disclosure_date);
    const parts = [
      who ? `${who}.` : "",
      range ? `Amount ${range}.` : "Amount not disclosed.",
      disclosed
        ? `Disclosed ${prettyDay(disclosed, now)}${fin(trade.lag_days) && trade.lag_days > 0 ? `, ${trade.lag_days} ${trade.lag_days === 1 ? "day" : "days"} after the trade` : ""}.`
        : "",
    ].filter(Boolean);
    items.push({
      id: `congress-${trade.trade_id}`,
      kind: "congress",
      at: day,
      precision: "day",
      title: `${trade.person_name} ${verb} ${ticker}`,
      detail: parts.join(" "),
      source: trade.source || "Congressional disclosure",
      sourceUrl: trade.source_url || undefined,
      tone: trade.tx_type === "buy" ? "up" : trade.tx_type === "sell" ? "down" : "flat",
      href: input.congressHref ? input.congressHref(trade) : "/power-trades",
    });
  }

  // Reddit discussion in the latest scan.
  if (input.reddit?.generatedAt && fin(input.reddit.postCount) && input.reddit.postCount > 0) {
    const hours = fin(input.reddit.windowHours) && input.reddit.windowHours > 0 ? input.reddit.windowHours : null;
    const mood = (input.reddit.sentiment ?? "").toLowerCase();
    items.push({
      id: "reddit",
      kind: "discussion",
      at: input.reddit.generatedAt,
      precision: "time",
      title: `${input.reddit.postCount} Reddit ${input.reddit.postCount === 1 ? "post" : "posts"} about ${ticker}${hours ? ` in ${hours} hours` : " in the latest scan"}`,
      detail: mood === "bullish" || mood === "bearish" ? `The tone of those posts leans ${mood}.` : undefined,
      source: "Reddit scan",
      tone: mood === "bullish" ? "up" : mood === "bearish" ? "down" : "flat",
      href: "/reddit-buzz",
    });
  }

  // Dividends that went ex in the last six months.
  for (const row of input.facts?.dividends?.history ?? []) {
    const day = parseLooseDate(row.ex_date);
    if (!day || day > today || !fin(row.amount)) continue;
    if (now.getTime() - new Date(`${day}T00:00:00Z`).getTime() > 183 * DAY_MS) continue;
    const pay = parseLooseDate(row.pay_date);
    items.push({
      id: `dividend-${day}`,
      kind: "dividend",
      at: day,
      precision: "day",
      title: `Went ex-dividend: $${dividendAmount(row.amount)} a share`,
      detail: pay ? `${pay <= today ? "Paid" : "Pays"} ${prettyDay(pay, now)}.` : undefined,
      source: "StockAnalysis",
    });
  }

  // Analyst rating shifts over the last four months.
  for (const change of analystTrendChanges(input.facts?.analyst_trend?.recommendation_trend)) {
    if (now.getTime() - new Date(`${change.at}T00:00:00Z`).getTime() > 124 * DAY_MS) continue;
    items.push({
      id: `analyst-${change.at}`,
      kind: "analyst",
      at: change.at,
      precision: "month",
      title: change.title,
      detail: change.detail,
      source: "Nasdaq analyst research",
      tone: change.tone,
    });
  }

  items.sort((a, b) => timelineSortMs(b, now) - timelineSortMs(a, now));

  // What is scheduled.
  const upcoming: StockTimelineUpcoming[] = [];
  const nextDay = parseLooseDate(input.nextEarnings?.date);
  if (nextDay && nextDay >= today) {
    const when =
      input.nextEarnings?.time === "bmo"
        ? "before the market opens"
        : input.nextEarnings?.time === "amc"
          ? "after the market closes"
          : null;
    const estimate = fin(input.nextEarnings?.epsEstimate)
      ? `Analysts expect $${input.nextEarnings!.epsEstimate!.toFixed(2)} a share.`
      : null;
    upcoming.push({
      id: `next-earnings-${nextDay}`,
      kind: "earnings",
      date: nextDay,
      title: `${ticker} reports earnings${when ? ` ${when}` : ""}`,
      detail: estimate ?? undefined,
      source: input.nextEarnings!.source,
    });
  }
  const nextEx = parseLooseDate(input.facts?.dividends?.next_ex_dividend_date);
  if (nextEx && nextEx >= today) {
    upcoming.push({
      id: `next-ex-${nextEx}`,
      kind: "dividend",
      date: nextEx,
      title: "Next ex-dividend date",
      detail: fin(input.facts?.dividends?.annual_dividend)
        ? `$${input.facts!.dividends!.annual_dividend!.toFixed(2)} a share a year at the current rate.`
        : undefined,
      source: "StockAnalysis",
    });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return { items, upcoming };
}
