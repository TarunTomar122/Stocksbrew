/**
 * The reads on /signals (and the movers panel on /explore): what the day's
 * unusual moves, Reddit chatter and policy posts add up to. Plain rules over
 * the rows the page already loads; a sentence is left out when the data
 * cannot carry it.
 */
import { pickInsights, sharePct, type Insight, type TheRead } from "@/lib/insights";
import { shortCompanyName } from "@/lib/plain-copy";
import { absPct, cap, countWord, isNum, listNames, plural, shortDay, signedPct } from "@/lib/read-format";
import { isStockName, rankReddit, type Mover, type PolicyPost, type RedditName } from "@/lib/signals-shared";

import { staleMoveClock } from "@/lib/move-clock";
import { etDayOfStamp, newestStamp, oldestStamp } from "@/lib/quote-time";

/* ── movers ─────────────────────────────────────────────────────────────── */

export type MoverForRead = Pick<Mover, "ticker" | "pct" | "explained" | "cause" | "headline"> & {
  name?: string | null;
  industry?: string | null;
  /** When the move was priced; the read says the time when it is hours old (lib/move-clock.ts). */
  priceAsOf?: string | null;
};

export type CauseKind = "earnings" | "analyst" | "clinical" | "deal" | "other";

const CAUSE_RULES: Array<[CauseKind, RegExp]> = [
  ["earnings", /earning|results|quarter|guidance|outlook|revenue|\beps\b|profit|loss\b/i],
  ["analyst", /analyst|upgrade|downgrade|rating|price target|reiterat/i],
  ["clinical", /clinical|fda|trial|regulator|approval|rejection|drug/i],
  ["deal", /contract|award|deal|partnership|agreement|program|acquisition|merger|venture|selects|wins?\b/i],
];

/** The kind of news behind a confirmed move, from its cause label first and its headline second. */
export function causeKind(mover: Pick<MoverForRead, "explained" | "cause" | "headline">): CauseKind | null {
  if (!mover.explained) return null;
  for (const text of [mover.cause ?? "", mover.headline ?? ""]) {
    for (const [kind, rule] of CAUSE_RULES) if (rule.test(text)) return kind;
  }
  return "other";
}

const CAUSE_WORDS: Record<CauseKind, string> = {
  earnings: "on earnings",
  analyst: "on analyst calls",
  clinical: "on drug and FDA news",
  deal: "on contracts and deals",
  other: "on other news",
};

/** Groups of stocks that tend to move together, recognised from the industry, the name or the stated reason. */
const THEMES: Array<{ id: string; label: string; rule: RegExp }> = [
  { id: "space", label: "space", rule: /\bnasa\b|lunar|\bspace|satellite|orbit|rocket|aerospace/i },
  { id: "chips", label: "chip", rule: /semiconductor|\bchips?\b|\bgpu|optics/i },
  { id: "nuclear", label: "nuclear", rule: /nuclear|uranium|reactor/i },
  { id: "biotech", label: "biotech", rule: /biotech|clinical|\bfda\b|therapeut|pharma|health care/i },
  { id: "crypto", label: "crypto", rule: /bitcoin|crypto|blockchain|stablecoin/i },
  { id: "miners", label: "gold and metals", rule: /\bgold\b|silver|mining|miners?\b|antimony|rare earth/i },
];

export function moverTheme(mover: MoverForRead): string | null {
  const text = [mover.industry, mover.name, mover.headline].filter(Boolean).join(" ");
  return THEMES.find((theme) => theme.rule.test(text))?.id ?? null;
}

type Side = { label: "gainers" | "decliners"; rows: MoverForRead[] };

function sides(movers: MoverForRead[]): Side[] {
  const up = movers.filter((mover) => mover.pct > 0).sort((a, b) => b.pct - a.pct || a.ticker.localeCompare(b.ticker));
  const down = movers.filter((mover) => mover.pct < 0).sort((a, b) => a.pct - b.pct || a.ticker.localeCompare(b.ticker));
  return [
    { label: "gainers", rows: up },
    { label: "decliners", rows: down },
  ];
}

/** The biggest cluster of one theme on one side, at least 3 names. Ties go to the side with the larger moves. */
export function themeCluster(movers: MoverForRead[]): { side: Side; theme: (typeof THEMES)[number]; rows: MoverForRead[] } | null {
  let best: { side: Side; theme: (typeof THEMES)[number]; rows: MoverForRead[]; weight: number } | null = null;
  for (const side of sides(movers)) {
    for (const theme of THEMES) {
      const rows = side.rows.filter((mover) => moverTheme(mover) === theme.id);
      if (rows.length < 3) continue;
      const weight = rows.reduce((sum, mover) => sum + Math.abs(mover.pct), 0);
      if (!best || rows.length > best.rows.length || (rows.length === best.rows.length && weight > best.weight)) best = { side, theme, rows, weight };
    }
  }
  return best ? { side: best.side, theme: best.theme, rows: best.rows } : null;
}

/** The most common kind of news on one side, at least 2 names and at least a third of the side's confirmed reasons. */
export function causeCluster(rows: MoverForRead[]): { kind: CauseKind; rows: MoverForRead[] } | null {
  const counts = new Map<CauseKind, MoverForRead[]>();
  for (const mover of rows) {
    const kind = causeKind(mover);
    if (!kind || kind === "other") continue;
    counts.set(kind, [...(counts.get(kind) ?? []), mover]);
  }
  const explained = rows.filter((mover) => mover.explained).length;
  const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const top = ranked[0];
  if (!top || top[1].length < 2 || top[1].length * 3 < explained) return null;
  return { kind: top[0], rows: top[1] };
}

function themeInsight(movers: MoverForRead[]): Insight | null {
  const cluster = themeCluster(movers);
  if (!cluster) return null;
  const { side, theme, rows } = cluster;
  const cause = causeCluster(rows);
  const causeText = cause && cause.rows.length >= 2 ? ` ${countWord(cause.rows.length)} of them moved ${CAUSE_WORDS[cause.kind]}.` : "";
  const average = rows.reduce((sum, mover) => sum + mover.pct, 0) / rows.length;
  return {
    id: "theme",
    tone: side.label === "gainers" ? "up" : "down",
    text: `${theme.label.charAt(0).toUpperCase()}${theme.label.slice(1)} stocks ${side.label === "gainers" ? "led" : "led the drop"}: ${rows.length} of the ${side.rows.length} biggest ${side.label}, ${signedPct(average)} on average.${causeText}`,
    tickers: rows.map((mover) => mover.ticker),
    action: { label: "See the moves", href: "/explore#moves" },
  };
}

function causeInsight(movers: MoverForRead[], skip: string | null): Insight | null {
  for (const side of sides(movers)) {
    if (side.label === skip) continue;
    const top = side.rows.slice(0, 10);
    const cause = causeCluster(top);
    if (!cause) continue;
    const average = cause.rows.reduce((sum, mover) => sum + mover.pct, 0) / cause.rows.length;
    const misses = cause.rows.filter((mover) => /miss/i.test(`${mover.cause ?? ""} ${mover.headline ?? ""}`)).length;
    const miss = cause.kind === "earnings" && side.label === "decliners" && misses * 2 > cause.rows.length;
    return {
      id: `cause-${side.label}`,
      tone: side.label === "gainers" ? "up" : "down",
      text: `${countWord(cause.rows.length)} of the ${top.length} biggest ${side.label} moved ${CAUSE_WORDS[cause.kind]}${miss ? ", mostly misses" : ""}, ${signedPct(average)} on average.`,
      tickers: cause.rows.map((mover) => mover.ticker),
      action: { label: "Read why", href: "/explore#moves" },
    };
  }
  return null;
}

function unexplainedInsight(movers: MoverForRead[]): Insight | null {
  const open = movers.filter((mover) => !mover.explained).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.ticker.localeCompare(b.ticker));
  if (open.length < 2) return null;
  const share = sharePct(open.length, movers.length);
  const biggest = open.slice(0, 2);
  return {
    id: "unexplained",
    tone: "flat",
    text: `${open.length} of ${movers.length} big moves (${share}%) came with no news yet, the biggest ${listNames(biggest.map((mover) => `${mover.ticker} ${signedPct(mover.pct)}`))}.`,
    soWhat: "A big move with no news is worth a look before you act on it.",
    tickers: biggest.map((mover) => mover.ticker),
    action: { label: "See them", href: "/explore#moves" },
  };
}

const CAUSE_SHORT: Record<CauseKind, string> = {
  earnings: "earnings",
  analyst: "analyst calls",
  clinical: "drug and FDA news",
  deal: "contracts and deals",
  other: "other news",
};

/** What a person calls the company: its short name when we have one, else the ticker. */
function moverName(mover: MoverForRead): string {
  return (mover.name ? shortCompanyName(mover.name) : "") || mover.ticker;
}

/** A list of companies by name, or by ticker when any of them has no name (a mixed list reads like a glitch). */
function listMovers(rows: MoverForRead[], max: number): string {
  const all = rows.slice(0, max).every((mover) => mover.name && shortCompanyName(mover.name));
  return listNames(rows.map((mover) => (all ? moverName(mover) : mover.ticker)), max);
}

/** The headline for the day's movers, also used as the explore movers panel's one-liner. */
export function moversHeadline(movers: MoverForRead[]): string | null {
  return moversLead(movers)?.text ?? null;
}

/**
 * The movers headline and the side it is about. One sentence: the theme (or
 * the cause) behind one side; the other side's cause is a line under it.
 */
function moversLead(movers: MoverForRead[]): { text: string; side: Side["label"] | null; named?: boolean; about: MoverForRead[] } | null {
  if (movers.length === 0) return null;
  // `about`: the moves the sentence makes a claim about, so its time is theirs and not some other mover's.
  const parts: Array<{ text: string; side: Side["label"]; about: MoverForRead[] }> = [];
  const cluster = themeCluster(movers);
  let used: Side["label"] | null = null;
  if (cluster) {
    const cause = causeCluster(cluster.rows);
    const label = `${cluster.theme.label.charAt(0).toUpperCase()}${cluster.theme.label.slice(1)}`;
    parts.push({ text: `${label} stocks led the ${cluster.side.label}${cause ? ` on ${CAUSE_SHORT[cause.kind]}` : ""} (${listMovers(cluster.rows, 3)})`, side: cluster.side.label, about: cluster.rows });
    used = cluster.side.label;
  }
  const earnings: Partial<Record<Side["label"], { count: number; lead: string; rows: MoverForRead[] }>> = {};
  for (const side of sides(movers)) {
    if (side.label === used || parts.length >= 2) continue;
    const cause = causeCluster(side.rows.slice(0, 10));
    if (!cause) continue;
    const names = listMovers(cause.rows, 3);
    // Tickers here: two long company names made this a four-line headline on a phone.
    if (cause.kind === "earnings") earnings[side.label] = { count: cause.rows.length, lead: cause.rows[0]!.ticker, rows: cause.rows };
    const phrase =
      cause.kind === "earnings"
        ? side.label === "decliners"
          ? `earnings reports sent ${names} down`
          : `earnings reports lifted ${names}`
        : `${CAUSE_SHORT[cause.kind]} moved the ${side.label} (${names})`;
    parts.push({ text: phrase.charAt(0).toUpperCase() + phrase.slice(1), side: side.label, about: cause.rows });
  }
  // Both sides on earnings: say the one thing that explains the day, then the names.
  if (!used && earnings.gainers && earnings.decliners) {
    // Counts and the biggest name on each side; the full lists are the rows under the read.
    return {
      text: `Earnings reports drove the day's biggest moves: ${earnings.gainers.count} up, led by ${earnings.gainers.lead}, and ${earnings.decliners.count} down, led by ${earnings.decliners.lead}.`,
      side: null,
      about: [...earnings.gainers.rows, ...earnings.decliners.rows],
    };
  }
  if (parts.length) return { text: `${parts[0]!.text}.`, side: parts[0]!.side, about: parts[0]!.about };
  const top = [...movers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.ticker.localeCompare(b.ticker))[0]!;
  return { text: `${moverName(top)} moved most, ${signedPct(top.pct)}${top.explained && top.headline ? `: ${top.headline.replace(/\.$/, "")}` : ""}.`, side: null, named: true, about: [top] };
}

/**
 * When the moves were priced: the oldest of their quote times on the latest day among them (every figure is at least
 * that fresh; a leftover quote from an earlier day does not date the whole list), else the feed's time.
 */
export function moversPricedAt(movers: Array<Pick<MoverForRead, "priceAsOf">>, fallback: string | null = null): string | null {
  const stamps = movers.map((mover) => mover.priceAsOf);
  const day = etDayOfStamp(newestStamp(stamps));
  return (day ? oldestStamp(stamps.filter((stamp) => etDayOfStamp(stamp) === day)) : null) ?? fallback;
}

/** Headlines stay one short line of thought (owner rule: about 12 to 18 words). */
const HEADLINE_MAX_WORDS = 18;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * "By 9:58 AM, " in front of a movers headline. Lower-cases the first word unless it is a name or an acronym
 * ("CoreWeave", "AI"), and when the time makes it too long, drops the list of names in brackets and then
 * everything after the colon; the rows under the read carry those.
 */
function withTime(text: string, clock: string, named: boolean): string {
  const lowered = named || !/^[A-Z][a-z]/.test(text) ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  let line = `By ${clock}, ${lowered}`;
  if (words(line) > HEADLINE_MAX_WORDS) line = line.replace(/\s*\([^)]*\)/, "");
  if (words(line) > HEADLINE_MAX_WORDS && line.includes(":")) line = `${line.slice(0, line.indexOf(":")).replace(/[.,]$/, "")}.`;
  return line;
}

export function buildMoversRead(movers: MoverForRead[], asOf: string | null = null, now: number = Date.now()): TheRead | null {
  const lead = moversLead(movers);
  if (!lead) return null;
  const pricedAt = moversPricedAt(movers, asOf);
  // Moves priced hours ago (the feed runs once after the open) lead with their time: "By 9:58 AM, chip stocks led…".
  // The time is that of the moves the headline names; a stale quote on some other row does not date it.
  const stale = staleMoveClock(moversPricedAt(lead.about, pricedAt), now);
  const headline = stale ? withTime(lead.text, stale, Boolean(lead.named)) : lead.text;
  const theme = themeInsight(movers);
  const themeSide = theme ? (theme.tone === "up" ? "gainers" : "decliners") : null;
  return {
    headline,
    // The cause line is about the side the headline did not cover.
    insights: pickInsights([theme, causeInsight(movers, themeSide ?? lead.side), unexplainedInsight(movers)]),
    asOf: pricedAt,
  };
}

/* ── reddit ─────────────────────────────────────────────────────────────── */

function stanceAgainstPrice(name: RedditName): boolean {
  if (!name.stanceRead || !isNum(name.dayPct)) return false;
  return (name.stance === "bearish" && name.dayPct >= 2) || (name.stance === "bullish" && name.dayPct <= -2);
}

function loudestInsight(names: RedditName[]): Insight | null {
  const total = names.reduce((sum, name) => sum + name.mentions, 0);
  const stocks = rankReddit(names.filter((name) => isStockName(name.ticker)));
  const top = stocks[0];
  if (!top || total <= 0 || top.mentions < 3) return null;
  const share = sharePct(top.mentions, total)!;
  const ratio = top.velocity.ratio;
  const pace = ratio !== null && ratio >= 1.5 && top.velocity.last24h >= 2 ? `, ${ratio.toFixed(1)}x its usual daily pace` : "";
  const price = isNum(top.dayPct) ? ` The stock ${top.dayPct >= 0 ? "rose" : "fell"} ${absPct(top.dayPct)}.` : "";
  const stance =
    top.stanceRead && (top.stance === "bullish" || top.stance === "bearish")
      ? ` More of those posts expect it to ${top.stance === "bullish" ? "rise than fall" : "fall than rise"}.`
      : "";
  return {
    id: "loudest",
    tone: top.stance === "bullish" ? "up" : top.stance === "bearish" ? "down" : "flat",
    text: `${top.ticker} is the stock Reddit talks about most: ${top.mentions} of ${total} mentions (${share}%)${pace}.${price}${stance}`,
    tickers: [top.ticker],
    action: { label: "Read the threads", href: "/signals?tab=reddit" },
  };
}

function concentrationInsight(names: RedditName[]): Insight | null {
  const ranked = rankReddit(names);
  const total = ranked.reduce((sum, name) => sum + name.mentions, 0);
  if (ranked.length < 6 || total < 20) return null;
  const top = ranked.slice(0, 3);
  const share = sharePct(top.reduce((sum, name) => sum + name.mentions, 0), total)!;
  if (share < 40) return null;
  return {
    id: "concentration",
    tone: "flat",
    text: `Chatter is concentrated: ${listNames(top.map((name) => name.ticker))} hold ${share}% of ${total} mentions across ${ranked.length} names.`,
    tickers: top.filter((name) => isStockName(name.ticker)).map((name) => name.ticker),
    action: { label: "All names", href: "/signals?tab=reddit" },
  };
}

function againstInsight(names: RedditName[], skip: ReadonlySet<string> = new Set()): Insight | null {
  const odd = rankReddit(names.filter((name) => isStockName(name.ticker) && !skip.has(name.ticker) && stanceAgainstPrice(name)));
  if (odd.length === 0) return null;
  const stance = odd[0]!.stance;
  const same = odd.filter((name) => name.stance === stance).slice(0, 3);
  const moves = same.map((name) => `${name.ticker} ${signedPct(name.dayPct!)}`);
  return {
    id: "against",
    tone: stance === "bearish" ? "up" : "down",
    text: `Reddit and the price disagree: people expected ${listNames(same.map((name) => name.ticker))} to ${stance === "bearish" ? "fall" : "rise"}, but ${same.length === 1 ? "it" : "they"} ${stance === "bearish" ? "rose" : "fell"} (${moves.join(", ")}).`,
    tickers: same.map((name) => name.ticker),
    action: { label: "Read the threads", href: "/signals?tab=reddit" },
  };
}

function risingInsight(names: RedditName[], skip: Set<string>): Insight | null {
  const rising = names
    .filter((name) => isStockName(name.ticker) && !skip.has(name.ticker) && name.velocity.ratio !== null && name.velocity.ratio >= 3 && name.velocity.last24h >= 2)
    .sort((a, b) => (b.velocity.ratio ?? 0) - (a.velocity.ratio ?? 0) || a.ticker.localeCompare(b.ticker));
  const top = rising[0];
  if (!top) return null;
  const price = isNum(top.dayPct) ? ` with the stock ${signedPct(top.dayPct)}` : "";
  return {
    id: "rising",
    tone: isNum(top.dayPct) && top.dayPct < 0 ? "down" : "up",
    text: `${top.ticker} mentions are running ${top.velocity.ratio!.toFixed(0)}x their usual pace (${top.velocity.last24h} posts in 24 hours against ${top.velocity.baselinePerDay.toFixed(1)} a day)${price}.`,
    tickers: [top.ticker],
    action: { label: `Open ${top.ticker}`, href: `/stock/${encodeURIComponent(top.ticker)}` },
  };
}

/** Mentions weighed by the crowd's read of each name. */
export function redditMood(names: RedditName[]): { bullish: number; bearish: number; total: number } {
  let bullish = 0;
  let bearish = 0;
  let total = 0;
  for (const name of names) {
    total += name.mentions;
    if (!name.stanceRead) continue;
    if (name.stance === "bullish") bullish += name.mentions;
    if (name.stance === "bearish") bearish += name.mentions;
  }
  return { bullish, bearish, total };
}

/**
 * Drops an insight whose stocks an earlier one already covers, so one stock never takes two of the three cards
 * (owner rule 1). Insights without stocks always stay.
 */
export function oneCardPerStock(items: Array<Insight | null | undefined | false>): Insight[] {
  const seen = new Set<string>();
  const out: Insight[] = [];
  for (const item of items) {
    if (!item) continue;
    const tickers = item.tickers ?? [];
    if (tickers.some((ticker) => seen.has(ticker))) continue;
    for (const ticker of tickers) seen.add(ticker);
    out.push(item);
  }
  return out;
}

/**
 * The crowd's lean in one short sentence with one number (owner rule 8): the larger side as a share of every stock
 * mention. The base and the other side are left to the source line and the cards.
 */
export function redditHeadline(mood: { bullish: number; bearish: number; total: number }): string {
  const bearShare = sharePct(mood.bearish, mood.total) ?? 0;
  const bullShare = sharePct(mood.bullish, mood.total) ?? 0;
  // Mentions do not expect anything; the posts behind them lean one way (Codex, round 11). The comparison is the
  // other side, said in words so the headline keeps one number.
  const against = (lead: number, other: number, otherWord: string): string => {
    if (other === 0) return `, and almost none were ${otherWord}`;
    // In words that stay true: 44% against 15% is "nearly three times", 45% against 10% "more than four times".
    const ratio = lead / other;
    const whole = Math.floor(ratio);
    const left = ratio - whole;
    const [hedge, times] = left >= 0.75 ? ["nearly ", whole + 1] : left > 0.1 ? ["more than ", whole] : ["", whole];
    if (times >= 2) return `, ${hedge}${times === 2 ? "twice" : `${countWord(times).toLowerCase()} times`} the ${otherWord} share`;
    return `, well ahead of the ${otherWord} share`;
  };
  if (bearShare >= bullShare + 15) return `${bearShare}% of stock mentions on Reddit were bearish${against(bearShare, bullShare, "bullish")}.`;
  if (bullShare >= bearShare + 15) return `${bullShare}% of stock mentions on Reddit were bullish${against(bullShare, bearShare, "bearish")}.`;
  if (bearShare === 0 && bullShare === 0) return "Reddit is talking about stocks without leaning either way.";
  if (bearShare === bullShare) return `Reddit is split evenly: ${bullShare}% of stock mentions were bullish, and as many bearish.`;
  const fall = bearShare > bullShare;
  return `Reddit leans slightly ${fall ? "bearish" : "bullish"}, with ${fall ? bearShare : bullShare}% of stock mentions on that side.`;
}

export function buildRedditRead(names: RedditName[], asOf: string | null = null): TheRead | null {
  if (names.length === 0) return null;
  const mood = redditMood(names);
  const loud = rankReddit(names.filter((name) => isStockName(name.ticker)))[0];
  const loudest = loudestInsight(names) ?? (loud ? { id: "loudest", tone: "flat" as const, text: `${loud.ticker} gets the most mentions.`, tickers: [loud.ticker] } : null);
  // A stock the loudest card already tells is never the disagreement card too (owner rule 1).
  const against = againstInsight(names, new Set(loudest?.tickers ?? []));
  const skip = new Set([...(loudest?.tickers ?? []), ...(against?.tickers ?? [])]);
  return {
    headline: redditHeadline(mood),
    insights: pickInsights(oneCardPerStock([loudest, against, risingInsight(names, skip), concentrationInsight(names)])),
    source: mood.total > 0 ? `From ${mood.total.toLocaleString("en-US")} stock mentions on Reddit` : undefined,
    asOf,
  };
}

/* ── policy posts ───────────────────────────────────────────────────────── */

const DAY = 86_400_000;

/**
 * Stocks the President's posts spoke well of, and how each has done since
 * against the S&P 500 over the same days. The latest post per stock counts.
 */
export function praisedRecord(posts: PolicyPost[], now: number, days = 90): Array<{ ticker: string; pct: number; vsMarket: number; at: string }> {
  const seen = new Map<string, { ticker: string; pct: number; vsMarket: number; at: string }>();
  for (const post of [...posts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))) {
    if (post.stance !== "bullish" || now - Date.parse(post.publishedAt) > days * DAY || !post.market) continue;
    for (const name of post.names) {
      if (!name.since || seen.has(name.ticker)) continue;
      seen.set(name.ticker, { ticker: name.ticker, pct: name.since.pct, vsMarket: name.since.pct - post.market.pct, at: post.publishedAt });
    }
  }
  return [...seen.values()];
}

function praisedInsight(posts: PolicyPost[], now: number): Insight | null {
  const record = praisedRecord(posts, now);
  if (record.length < 4) return null;
  const behind = record.filter((row) => row.vsMarket < 0).sort((a, b) => a.vsMarket - b.vsMarket);
  const ahead = record.filter((row) => row.vsMarket > 0).sort((a, b) => b.vsMarket - a.vsMarket);
  const lagging = behind.length > ahead.length;
  const group = lagging ? behind : ahead;
  const leaders = group.slice(0, 2).map((row) => `${row.ticker} ${signedPct(row.vsMarket)}`);
  return {
    id: "praised",
    tone: lagging ? "down" : "up",
    text: `${group.length} of the ${record.length} stocks his posts praised in the last 90 days have ${lagging ? "trailed" : "beaten"} the S&P 500 since the post. ${lagging ? "Furthest behind" : "Furthest ahead"}: ${listNames(leaders)} against the market.`,
    soWhat: lagging ? "Praise in a post has not been a buy signal." : undefined,
    tickers: group.slice(0, 3).map((row) => row.ticker),
    action: { label: "See the posts", href: "/signals?tab=policy&show=named" },
  };
}

export function recentInsight(posts: PolicyPost[], now: number): Insight | null {
  const week = posts.filter((post) => now - Date.parse(post.publishedAt) <= 7 * DAY);
  if (week.length === 0) return null;
  const before = posts.filter((post) => {
    const age = now - Date.parse(post.publishedAt);
    return age > 7 * DAY && age <= 14 * DAY;
  }).length;
  const named = week.filter((post) => post.names.length > 0);
  const bull = week.filter((post) => post.stance === "bullish").length;
  const bear = week.filter((post) => post.stance === "bearish").length;
  const tickers = [...new Set(named.flatMap((post) => post.names.map((name) => name.ticker)))];
  // One tone figure (owner rule 5): the larger side as a share of the week's posts, never two counts side by side.
  // A side only when it clearly leads (15 points of the week's posts, as on Reddit); 4 against 3 is a split.
  const margin = (Math.abs(bull - bear) / week.length) * 100;
  const side = margin < 15 ? null : bull > bear ? { count: bull, word: "positive", tone: "up" as const } : { count: bear, word: "negative", tone: "down" as const };
  const share = side ? sharePct(side.count, week.length)! : null;
  // Said as his, not a bare count: on the Today tab this card sits under Reddit's headline.
  const times = week.length === 1 ? "once" : week.length === 2 ? "twice" : `${week.length} times`;
  // At most three names in the sentence, so it stays one short line.
  const names = tickers.length > 3 ? `${tickers.slice(0, 3).join(", ")} and ${plural(tickers.length - 3, "other")}` : listNames(tickers);
  const companies = named.length === 0 ? "None named a listed company." : `${cap(plural(named.length, "post"))} named ${names}.`;
  // "Split" only when both sides have posts; one or two positive posts among ten is not a split.
  const toneWords = bull > 0 && bear > 0 ? ", split between positive and negative" : ", mostly neither positive nor negative";
  // The figure says what the sentence does not (owner rule 1): the tone when one side leads, else the change from
  // the week before, else the week's count (and then the sentence leaves the count out).
  const change = before > 0 ? week.length - before : null;
  const figure: Insight["figure"] = side
    ? { value: `${share}%`, label: side.word, tone: side.tone }
    : change !== null
      ? { value: change === 0 ? "Same" : `${change > 0 ? "+" : "−"}${Math.abs(change)}`, label: change === 0 ? "as the week before" : "on the week before" }
      : { value: String(week.length), label: week.length === 1 ? "post this week" : "posts this week" };
  const opening = `The President posted about the market ${times} in the last 7 days`;
  const text = side
    ? `${opening}${before > 0 ? ` (${before} the week before)` : ""}. ${companies}`
    : change !== null
      ? `${opening}${toneWords}. ${companies}`
      : `The President's market posts this week were${toneWords.replace(/^, /, " ")}. ${companies}`;
  return {
    id: "recent",
    tone: side?.tone ?? "flat",
    figure,
    text,
    tickers,
    action: { label: "Read the posts", href: "/signals?tab=policy" },
  };
}

function latestNamedInsight(posts: PolicyPost[], now: number): Insight | null {
  const post = [...posts]
    .filter((row) => row.names.some((name) => name.since) && now - Date.parse(row.publishedAt) <= 30 * DAY)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))[0];
  if (!post) return null;
  const name = post.names.find((row) => row.since)!;
  const vs = post.market ? name.since!.pct - post.market.pct : null;
  return {
    id: "latest-named",
    tone: name.since!.pct >= 0 ? "up" : "down",
    text: `His last post naming a company was on ${shortDay(post.publishedAt.slice(0, 10))}, about ${name.ticker}; it is ${signedPct(name.since!.pct)} since${vs !== null ? `, ${signedPct(vs)} against the S&P 500` : ""}.`,
    tickers: post.names.map((row) => row.ticker),
    action: { label: "Read the post", href: "/signals?tab=policy&show=named" },
  };
}

export function buildPolicyRead(posts: PolicyPost[], now: number, asOf: string | null = null): TheRead | null {
  if (posts.length === 0) return null;
  const praised = praisedInsight(posts, now);
  const recent = recentInsight(posts, now);
  const headline = praised
    ? praised.tone === "down"
      ? "Stocks the President praised have mostly trailed the market since."
      : "Stocks the President praised have mostly beaten the market since."
    : recent
      ? recent.text
      : "No market posts in the last week.";
  return {
    headline,
    insights: pickInsights([praised, recent && recent.text !== headline ? recent : null, latestNamedInsight(posts, now)]),
    asOf,
  };
}

/** One sentence on the policy posts, for a panel's first row. */
export function policyTakeaway(posts: PolicyPost[], now: number): string | null {
  return (praisedInsight(posts, now) ?? latestNamedInsight(posts, now) ?? recentInsight(posts, now))?.text ?? null;
}

/* ── the Today tab: one line from each stream ───────────────────────────── */

export function buildSignalsTodayRead(
  movers: MoverForRead[],
  names: RedditName[],
  posts: PolicyPost[],
  now: number,
  asOf: string | null,
  /** When the Reddit counts were taken. A read that leads with Reddit carries this time, not the movers'. */
  redditAsOf?: string | null,
): TheRead | null {
  // Signals is about what people are saying; the day's moves are on Market today.
  // So the crowd leads, the President's posts follow, and the moves come last.
  const moverRead = buildMoversRead(movers, asOf, now);
  const redditRead = buildRedditRead(names);
  const policyLine = praisedInsight(posts, now) ?? latestNamedInsight(posts, now) ?? recentInsight(posts, now);
  const headline = redditRead?.headline ?? policyLine?.text ?? moverRead?.headline;
  if (!headline) return null;
  // One card per stock (owner rule 1): a stock on the first card is never the subject of a later one.
  const insights = pickInsights(
    oneCardPerStock([
      redditRead?.insights[0],
      policyLine && policyLine.text !== headline ? policyLine : null,
      // The moves only when there is nothing people said: Market today carries them.
      !redditRead && !policyLine && moverRead && moverRead.headline !== headline ? { id: "movers-line", tone: "flat" as const, text: moverRead.headline, action: { label: "Market today", href: "/explore#moves" } } : null,
      ...(redditRead?.insights.slice(1) ?? []),
    ]),
  );
  // The source names every stream a card comes from: a card about the President's posts is not Reddit's.
  const fromPolicy = Boolean(policyLine && insights.some((insight) => insight.id === policyLine.id));
  const source = redditRead && headline === redditRead.headline && redditRead.source ? `${redditRead.source}${fromPolicy ? " and the President's posts" : ""}` : undefined;
  const fromReddit = Boolean(redditRead && headline === redditRead.headline);
  return {
    headline,
    insights,
    source,
    // Each read carries its own stream's time: the President's posts are not dated by the movers feed (ship 28 QA).
    asOf:
      fromReddit && redditAsOf
        ? redditAsOf
        : moverRead && headline === moverRead.headline
          ? moverRead.asOf ?? asOf
          : policyLine && headline === policyLine.text
            ? newestPost(posts) ?? undefined
            : asOf,
  };
}

/** The newest post's time, for a read that leads with the President's posts. */
function newestPost(posts: ReadonlyArray<{ publishedAt?: string | null }>): string | null {
  let newest: string | null = null;
  for (const post of posts) if (post.publishedAt && (!newest || post.publishedAt > newest)) newest = post.publishedAt;
  return newest;
}
