import type { BriefingNews } from "@/lib/briefing";
import { headlineNamesStock } from "@/lib/wire-headline-tone";

/**
 * Which story a briefing card may lead with, for members and the signed-out example alike (owner, round 6). A card's
 * headline should be a reason line on that stock: an earnings fact, an analyst rating change, a company event. Not a
 * "stock market today" roundup that names it in passing, a listicle, a valuation opinion ("looks like a bargain"), a
 * rumour ("reportedly", "said to"), an explainer ("Every December the Nasdaq-100 reshuffles"), a law firm's
 * class-action notice, or filler. When nothing good is left, the card shows its move and its one fact instead. Pure.
 */

/** SEO filler, questions, opinion columns and personal-finance letters: nothing about the company itself. */
const FILLER =
  /\?\s*$|\b(?:facts? worth knowing|surpasses (?:the )?market returns|outpaces (?:the )?stock market|outpaced the stock market|declines while market improves|some information for investors|what you should know|what to know|here['’]?s (?:why|what|how)|should you buy|is it time to buy|time to buy|key facts|beats? (?:the )?market:|key takeaways|jim cramer|cramer(?:['’]s)? (?:says|stance|take|thinks|picks?|on)|made a (?:big|huge|bold) (?:move|bet)|(?:sends?|sent) a (?:strong |\$[\d.]+ \w+ )?signal|shot in the arm|\d+-year-old|i['’]m \d+|how much tax)\b/i;
/** A wire's market roundup or futures column: the stock is one name in a story about the day. */
const ROUNDUP =
  /^(?:stock market today|dow jones futures|stock market news|stocks? (?:making|to watch)|(?:midday|premarket|pre-market|after-hours) (?:movers|stocks)|market wrap|here are the|what['’]?s moving|top (?:gainers|losers)|biggest (?:movers|stock movers))\b|\b(?:stocks making the biggest moves|biggest movers)\b|^(?:nasdaq|s&p|dow)[\w\s&-]{0,20}futures\b|\b(?:wall st(?:reet)?|stock|us|u\.s\.|index) futures\b|\bin focus\s*[.!]?\s*$/i;
/** A headline that names three or more tickers in a row ("NVDA, TSLA, SNDK, CAPR, CRWV") is about the day, not one stock. */
const TICKER_LIST = /\b[A-Z]{2,5}(?:\s*,\s*[A-Z]{2,5}){2,}\b/;
/** A list of stocks or tips: "3 Stocks Tied To…", "5 reasons", "Which … is a better buy". */
const LISTICLE = /^\d+\s+(?:\w+\s+)?(?:stocks?|reasons?|things|ways|charts?|companies|picks|takeaways)\b|\b(?:better buy|top \d+|best stocks)\b|\bvs\.?\s.+\bwhich\b/i;
/** Valuation opinion: whether it is cheap or dear is a columnist's view, not news on the company. */
const OPINION =
  /\b(?:bargain|undervalued|overvalued|fair value|trading at a discount|at a discount|looks? (?:cheap|pricey|expensive)|could (?:look|be) (?:pricey|overvalued|undervalued)|too big to fail|no-brainer|millionaire|screaming buy|buy the dip|prediction:|forget\s)\b/i;
/** Unconfirmed: a rumour column, "said to", "reportedly", "allegedly". */
const RUMOUR = /\b(?:market chatter|rumou?rs?|reportedly|allegedly|said to (?:have|be)|speculation|sources say|people familiar|unconfirmed)\b|[-–:]\s*(?:report|wsj|nyt)\s*$/i;
/** How a thing works, not what happened: "Every December the Nasdaq-100 reshuffles", "What it means for…". */
const EXPLAINER = /^(?:every|each)\s+(?:year|quarter|month|week|day|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:explained|explainer|what (?:it|this|that) means|everything you need|how (?:to|does|do) |guide to)\b/i;
/** A law firm fishing for plaintiffs. */
const LAW_FIRM = /\b(?:class action|investigation notice|investors? (?:who|with) (?:lost|significant losses)|llp\b|law firm|shareholder alert|deadline alert|lose money investing)/i;
/** A feed's footer standing in for a summary ("For questions about this article … email help@…"). */
const BOILERPLATE_SUMMARY = /^\s*(?:for questions about|\(updates? )|\S+@\S+\.\w+/i;

/** A headline that says the stock fell, or rose: checked against the stock's own move on the day. */
const SAYS_DOWN = /\b(?:sinks?|sank|falls?|fell|drops?|dropped|dives?|dived|plunges?|plunged|slides?|slid|tumbles?|tumbled|slumps?|slumped|slips?|slipped|crash(?:es|ed)?)\b/i;
const SAYS_UP = /\b(?:soars?|soared|jumps?|jumped|surges?|surged|rall(?:y|ies|ied)|climbs?|climbed|rises?|rose|spikes?|spiked|pops?|popped)\b/i;

/**
 * A reason worth a card: results, a rating or target change, guidance, a deal, a leadership change, a regulator's
 * decision. Previews ("Q3 Earnings Preview", "ahead of earnings") and an executive talking ("CEO describes…") are not.
 */
const REASON =
  /\b(?:earnings|results|revenue|sales|profit|eps|quarter(?:ly)?|q[1-4]|guidance|outlook|forecast|beats?|miss(?:es|ed)?|tops estimates|upgrade[sd]?|downgrade[sd]?|price target|initiat\w* coverage|overweight|underweight|outperform|underperform|acquir\w+|acquisition|merger|buyback|repurchase|dividend|stock split|layoffs?|job cuts|fda|approv\w+|contract|deal|lawsuit|settle\w*|recall|offering|ipo|spin-?off)\b|\b(?:ceo|cfo|chief executive)\b.*\b(?:steps? down|resign\w*|depart\w*|exit\w*|replac\w*|oust\w*|retir\w*|fired|out)\b|\b(?:names?|appoints?|hires?) (?:a )?new (?:ceo|cfo|chief executive)\b/i;
/** Before the event, or about it rather than the event itself. */
const NOT_YET = /\b(?:preview|what to expect|ahead of (?:its )?(?:earnings|results|report)|before (?:its )?(?:earnings|results)|to (?:release|report)|release date|earnings date|call summary|transcript|describes|discusses|talks|says)\b/i;
/** A headline about trading outside the regular session: it can disagree with the day's move and still be right. */
const EXTENDED_HOURS = /\b(?:after[- ]hours|after the (?:bell|close)|post-?market|premarket|pre-market|extended(?:[- ]hours)? trading|late trad(?:e|ing)|overnight trading)\b/i;

export type NewsJunk = "no summary" | "filler" | "roundup" | "listicle" | "opinion" | "rumour" | "explainer" | "law firm";

/** Why a story can never lead a card, whatever stock it is on; null when it can. */
export function newsJunk(article: Pick<BriefingNews, "title" | "summary">): NewsJunk | null {
  const title = article.title.replace(/\s+/g, " ").trim();
  const summary = article.summary ?? "";
  // A card that could only say "read it": no summary to open.
  if (summary.trim().length < 40 || BOILERPLATE_SUMMARY.test(summary)) return "no summary";
  // Checked on the raw title too, so a wire's "Analysis-" or "Update:" tag still counts.
  if (LAW_FIRM.test(title)) return "law firm";
  if (ROUNDUP.test(title) || TICKER_LIST.test(title)) return "roundup";
  if (RUMOUR.test(title)) return "rumour";
  if (EXPLAINER.test(title) || /^(?:analysis|opinion|commentary)\s*[-:–]/i.test(title)) return "explainer";
  if (LISTICLE.test(title)) return "listicle";
  if (OPINION.test(title)) return "opinion";
  if (FILLER.test(title)) return "filler";
  return null;
}

/**
 * How good a story is as the card's headline for one stock: 2 for a reason line (results, a rating change, a company
 * event), 1 for other news that names the stock, null when it may not lead the card at all: junk (`newsJunk`), a
 * headline that never names the stock, or one that says it fell on a day it rose by more than 1% (or the reverse).
 */
export function newsRank(
  article: Pick<BriefingNews, "title" | "summary"> & { published_at?: string },
  stock: { ticker: string; name: string; day_change_pct: number | null; price_as_of?: string | null },
): 1 | 2 | null {
  if (newsJunk(article)) return null;
  const title = article.title.replace(/\s+/g, " ").trim();
  if (!headlineNamesStock(title, stock.ticker, stock.name)) return null;
  const move = stock.day_change_pct;
  // A story about after-hours trading, or one published after the quote was taken, can go the other way and be right.
  // A bare day ("2026-11-11") says nothing about the hour, so it can't make a story "later".
  const quoted = stock.price_as_of && stock.price_as_of.length > 10 ? Date.parse(stock.price_as_of) : NaN;
  const published = article.published_at ? Date.parse(article.published_at) : NaN;
  const later = Number.isFinite(quoted) && Number.isFinite(published) && published > quoted;
  if (move != null && Number.isFinite(move) && Math.abs(move) >= 1 && !later && !EXTENDED_HOURS.test(title)) {
    const against = move > 0 ? SAYS_DOWN.test(title) && !SAYS_UP.test(title) : SAYS_UP.test(title) && !SAYS_DOWN.test(title);
    if (against) return null;
  }
  return REASON.test(title) && !NOT_YET.test(title) ? 2 : 1;
}

/**
 * The one story a stock's card may lead with: the best ranked (`newsRank`), newest first within a rank. Null when no
 * story is good enough; the card then has no headline.
 */
export function pickStockNews<T extends Pick<BriefingNews, "title" | "summary" | "published_at">>(
  articles: readonly T[],
  stock: { ticker: string; name: string; day_change_pct: number | null; price_as_of?: string | null },
): T | null {
  let best: { article: T; rank: number } | null = null;
  for (const article of articles) {
    const rank = newsRank(article, stock);
    if (rank == null) continue;
    if (!best || rank > best.rank || (rank === best.rank && stampMs(article.published_at) > stampMs(best.article.published_at))) best = { article, rank };
  }
  return best?.article ?? null;
}

/** A timestamp as milliseconds, so "Z" and "+00:00" stamps compare by time, not as text. Unparseable sorts first. */
function stampMs(stamp: string | null | undefined): number {
  const ms = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(ms) ? ms : -Infinity;
}
