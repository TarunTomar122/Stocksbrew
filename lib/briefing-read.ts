import { marketDay, type Briefing, type BriefingItem } from "@/lib/briefing";
import { MARKET_GROUP_KEY, plainCallWord, type BriefingGroup, type GroupedSections } from "@/lib/briefing-groups";
import { firstFullSentence, splitMoveReason, plainFinance, sentenceCase, shortCompanyName } from "@/lib/plain-copy";
import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";
import { newestStamp, oldestStamp } from "@/lib/quote-time";
import { staleMoveClock } from "@/lib/move-clock";

/**
 * The briefing's read: one headline and up to three things that matter today,
 * each with a link to act. Plain rules over what the briefing already holds;
 * anything the data cannot back is left out.
 */

function pct(value: number, digits = 1): string {
  return `${Math.abs(value).toFixed(digits)}%`;
}

function signed(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : "−"}${pct(value, digits)}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The first sentence of a reason, without its period, short enough for one line. */
export function firstSentence(text: string): string {
  // The whole first sentence, never cut with an ellipsis; Title Case headlines read as sentences.
  // A reason the feed clipped ("...") ends where the words end; no ellipsis on screen.
  return plainFinance(sentenceCase(firstFullSentence(text)))
    .replace(/\s*(?:…|\.{2,})$/, "")
    .replace(/[.!?]$/, "");
}

const stockHref = (ticker: string) => `/stock/${encodeURIComponent(ticker)}`;

/**
 * " on Monday" when a number is from an earlier session than the briefing's
 * day, else "". Keeps a live index and yesterday's movers out of one "today".
 */
export function earlierSession(asOf: string | null | undefined, date: string | null | undefined): string {
  if (!asOf || !date) return "";
  const day = marketDay(asOf);
  if (!day || day >= date) return "";
  const name = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return ` on ${name}`;
}

/**
 * How the index line should say when its price is from: "closed" once the
 * snapshot is from 4 PM ET or later that day, "As of 9:56 AM ET" while it is
 * from inside the session. Other days are covered by `earlierSession`. Keeps a
 * morning number from reading as the day's result after the close.
 */
export function indexClock(asOf: string | null | undefined, date: string | null | undefined): { kind: "closed" } | { kind: "intraday"; clock: string } | null {
  if (!asOf || !date) return null;
  const at = new Date(asOf);
  if (Number.isNaN(at.getTime()) || marketDay(asOf) !== date) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (!Number.isFinite(minutes)) return null;
  if (minutes >= 16 * 60) return { kind: "closed" };
  if (minutes < 9 * 60 + 30) return null;
  return { kind: "intraday", clock: `${at.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` };
}

/** A company's everyday name, or "" when the feed only has its ticker. */
function nameOf(name: string | null | undefined, ticker: string | null | undefined): string {
  const short = name && name !== ticker ? shortCompanyName(name) : "";
  return short && short !== ticker ? short : "";
}

/**
 * A move with a confirmed reason: the number and the reason in one sentence,
 * company first. "Earnings that missed expectations trigger Hims & Hers drop"
 * reads as "Hims & Hers fell 16.5% after earnings that missed expectations";
 * a reason in any other shape follows the move after a colon. The sentence
 * starts with the ticker so the row leads with its logo; `leadName` shows the
 * company's name there.
 */
function explainedMoveInsight(item: BriefingItem, date?: string, name?: string | null, now?: number): Insight | null {
  if (item.kind !== "price_move" || item.reason_status !== "confirmed" || item.day_change_pct == null || !item.ticker) return null;
  const reason = firstSentence(item.why);
  if (!reason) return null;
  const earlier = earlierSession(item.as_of, date);
  // A move priced hours ago says so: "was up 23.9% by 9:58 AM", never "is up" beside a live index.
  const stale = earlier || now == null ? null : staleMoveClock(item.as_of, now);
  const up = item.day_change_pct >= 0;
  // Company first ("Hims & Hers fell 16.5% after ..."): the row shows the logo and the name, then the rest.
  const split = earlier ? null : splitMoveReason(reason, item.day_change_pct, { withPct: true, company: { name: name ?? item.ticker, ticker: item.ticker } });
  const leadName = nameOf(name, item.ticker) || (split ? split.subject : "") || undefined;
  const text = split
    ? `${item.ticker} ${split.predicate}.`
    : earlier
      ? `${item.ticker} ${up ? "rose" : "fell"} ${pct(item.day_change_pct)}${earlier}: ${reason}.`
      : stale
        ? `${item.ticker} was ${up ? "up" : "down"} ${pct(item.day_change_pct)} by ${stale}: ${reason}.`
        : `${item.ticker} is ${up ? "up" : "down"} ${pct(item.day_change_pct)}: ${reason}.`;
  return {
    id: `move-${item.id}`,
    tone: toneOfChange(item.day_change_pct),
    text,
    figure: { value: signed(item.day_change_pct), ...(stale ? { label: `at ${stale}` } : {}) },
    leadName,
    tickers: [item.ticker],
    action: { label: `Our view on ${item.ticker}`, href: stockHref(item.ticker) },
  };
}

/**
 * How a held stock has moved on its past reports (lib/briefing-report-history-server.ts, the same sums as the inbox's
 * report rows): the usual size of the move, unsigned, and a normal day's move to read it against.
 */
export type BriefingReportHistory = {
  usualPct: number;
  /** "single": one measured report; "mean" for a few; "median" once there are enough. */
  usualKind: "single" | "mean" | "median";
  /** A normal day's move, percent (the average absolute daily move over 120 sessions), or null. */
  normalPct: number | null;
  /** "about three times a normal day", or null (one report, or no normal day). */
  vsDay: string | null;
};

/** "5.9%", "16%": whole numbers once a move is big, as the inbox and the calendar say it. */
function usualWord(value: number): string {
  return Math.abs(value) >= 10 ? `${Math.round(Math.abs(value))}%` : `${Math.abs(value).toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * A held stock's report coming up. With its report history it is a finding, not a date: its usual move on a report
 * as the figure, read against a normal day for it, and the step to take before the report (owner rule 7).
 */
function earningsInsight(item: BriefingItem, history?: BriefingReportHistory | null): Insight | null {
  if (item.kind !== "earnings_upcoming" || !item.ticker) return null;
  const rest = item.headline.startsWith(`${item.ticker} `) ? item.headline.slice(item.ticker.length + 1) : item.headline;
  const step = "Check our call on it before the report.";
  const normal = history?.normalPct != null ? `${history.normalPct.toFixed(1)}%` : null;
  const baseline = !history || !normal
    ? null
    : history.vsDay
      ? `That is ${history.vsDay.replace(/ a normal day$/, ` ${item.ticker}'s normal day`)} of about ${normal}.`
      : `A normal day for ${item.ticker} is a move of about ${normal}.`;
  return {
    id: `earnings-${item.id}`,
    tone: "flat",
    text: `${item.ticker} ${rest.replace(/\.$/, "")}.`,
    ...(history
      ? {
          figure: {
            value: usualWord(history.usualPct),
            label: history.usualKind === "single" ? "its move after its last report" : history.usualKind === "mean" ? "its average move on a report" : "its usual move on a report",
          },
          soWhat: [baseline, step].filter(Boolean).join(" "),
        }
      : {}),
    tickers: [item.ticker],
    action: { label: "Read before the report", href: stockHref(item.ticker) },
  };
}

type IndexMove = { name: string; change_pct: number } | undefined;

/** "against −0.6% for the S&P 500": the baseline a single stock's move is read against. */
function versusIndex(index: IndexMove): string {
  return index && Number.isFinite(index.change_pct) ? `, against ${signed(index.change_pct)} for the ${index.name}` : "";
}

/** A held stock's move, with the reason when its top update gives one. */
function moverInsight(group: BriefingGroup, index: IndexMove, date?: string, now?: number): Insight | null {
  const move = group.day_change_pct;
  if (move == null || !group.ticker) return null;
  const top = group.lines[0]?.item;
  let why = "";
  if (top?.kind === "price_move" && top.reason_status === "confirmed") why = firstSentence(top.why);
  else if (top?.kind === "earnings_reported") why = "after its earnings report";
  const earlier = earlierSession(group.as_of, date);
  const stale = earlier || now == null ? null : staleMoveClock(group.as_of, now);
  const base = earlier
    ? `${group.ticker} ${move >= 0 ? "rose" : "fell"} ${pct(move)}${earlier}`
    : stale
      ? `${group.ticker} was ${move >= 0 ? "up" : "down"} ${pct(move)} by ${stale}`
      : `${group.ticker} is ${move >= 0 ? "up" : "down"} ${pct(move)} today`;
  return {
    id: `mover-${group.key}`,
    tone: toneOfChange(move),
    figure: { value: signed(move), ...(stale ? { label: `at ${stale}` } : {}) },
    text: why ? `${base}${why.startsWith("after") ? ` ${why}` : `: ${why}`}.` : `${base}${earlier || stale ? "" : versusIndex(index)}.`,
    tickers: [group.ticker],
    action: { label: `${group.ticker} report`, href: stockHref(group.ticker) },
  };
}

/** Our call moved on something you watch. */
function callInsight(item: BriefingItem): Insight | null {
  // Buy more / Keep / Sell some, also on briefings saved with the pipeline's words.
  const to = plainCallWord(item.metric);
  if (!to || !item.ticker) return null;
  return {
    id: `call-${item.id}`,
    tone: item.tone,
    text: `Our call moved to ${to}.`,
    figure: { value: to, label: "our call now" },
    tickers: [item.ticker],
    action: { label: `Read why`, href: stockHref(item.ticker) },
  };
}

/**
 * Stocks you watch that sit below their buy-more price, as one line instead of one
 * decision each. On a day the index falls, most of them got there together.
 */
function addZoneInsight(items: BriefingItem[], index: IndexMove): Insight | null {
  const names = [
    ...new Set(
      items
        .filter((item) => item.kind === "zone_entered" && item.relation === "watching" && /\b(?:add zone|buy-more price)\b/.test(item.headline) && item.ticker)
        .sort((a, b) => (a.day_change_pct ?? 0) - (b.day_change_pct ?? 0))
        .map((item) => item.ticker),
    ),
  ];
  if (names.length < 2) return null;
  const named = names.slice(0, 3);
  const more = names.length - named.length;
  const fell = index && Number.isFinite(index.change_pct) && index.change_pct <= -0.3;
  return {
    id: "add-zones",
    tone: "flat",
    text: `${names.length} stocks you watch are below their buy-more price: ${joinAnd(more > 0 ? [...named, `${more} more`] : named)}.`,
    figure: { value: String(names.length), label: "below their buy-more price" },
    soWhat: fell
      ? `The ${index.name} is down ${pct(index.change_pct, 2)}, so most got there with the market. Reread a call before adding.`
      : "Reread a call before adding.",
    tickers: named,
    action: { label: "Open your list", href: "/portfolio?tab=holdings" },
  };
}

const RELATION_ORDER: Record<BriefingGroup["relation"], number> = { holding: 0, watching: 1, market: 2 };

/**
 * Your own briefing reads holdings first, then the stocks you watch, then the market: each section keeps its
 * own order (urgency, then size) inside those three bands. A stable sort, so nothing else moves.
 */
export function holdingsFirst(grouped: GroupedSections): GroupedSections {
  const band = (groups: BriefingGroup[]) =>
    groups
      .map((group, index) => ({ group, index }))
      .sort((a, b) => RELATION_ORDER[a.group.relation] - RELATION_ORDER[b.group.relation] || a.index - b.index)
      .map(({ group }) => group);
  return { needs_you: band(grouped.needs_you), worth_knowing: band(grouped.worth_knowing), coming_up: band(grouped.coming_up), settled: grouped.settled };
}

function stockGroups(groups: BriefingGroup[]): BriefingGroup[] {
  return groups.filter((group) => group.key !== MARKET_GROUP_KEY && group.ticker);
}

/**
 * How the whole session went, for the market view's headline: each sector's
 * move today and, when known, the biggest companies' move together (the
 * change in their combined value). Live data, so only for today's briefing.
 */
export type BriefingSession = {
  sectors: Array<{ name: string; day: number; slug?: string }>;
  giants?: { count: number; pct: number; leader?: { name: string; pct: number } | null } | null;
};

/**
 * "The S&P 500 closed down 0.37% even though 7 of 11 sectors rose. The 10 biggest
 * companies lost 0.7% together and pulled it down." What the day meant, before any
 * single stock. Empty when there is no index or too few sectors to count.
 */
/** ", led by NVIDIA (−5.5%)," when the company that moved them most went their way. */
function leaderText(leader: { name: string; pct: number } | null | undefined, pct: number): string {
  if (!leader || !leader.name || !Number.isFinite(leader.pct) || Math.sign(leader.pct) !== Math.sign(pct)) return "";
  return `, led by ${leader.name} (${signed(leader.pct)}),`;
}

/** The whole session line as one string (the read now uses `sessionParts`; kept for tests and other callers). */
export function sessionLine(indexLine: string, index: IndexMove, session: BriefingSession | null | undefined): string {
  const parts = sessionParts(indexLine, index, session);
  return parts ? [parts.line, parts.pulled].filter(Boolean).join(" ") : "";
}

/**
 * The session line in its two parts: the index against the sectors (the
 * headline), and, when the biggest companies did it, how they pulled the
 * index (the first line under it). Null when there is too little to say.
 */
export function sessionParts(indexLine: string, index: IndexMove, session: BriefingSession | null | undefined): { line: string; pulled: string | null; pulledPct: number | null } | null {
  const sectors = (session?.sectors ?? []).filter((sector) => Number.isFinite(sector.day));
  if (!index || !Number.isFinite(index.change_pct) || !indexLine || sectors.length < 4) return null;
  const total = sectors.length;
  const up = sectors.filter((sector) => sector.day > 0).length;
  const down = sectors.filter((sector) => sector.day < 0).length;
  const move = index.change_pct;
  const base = indexLine.replace(/\.$/, "");
  const against = (move < 0 && up > total / 2) || (move > 0 && down > total / 2);
  if (against) {
    const giants = session?.giants;
    // Only say the giants did it when they moved the same way as the index and by more.
    const pulled =
      giants && giants.count >= 5 && Number.isFinite(giants.pct) && Math.abs(giants.pct) >= 0.05 && Math.sign(giants.pct) === Math.sign(move) && Math.abs(giants.pct) >= Math.abs(move)
        ? `The ${giants.count} biggest companies ${giants.pct < 0 ? "lost" : "gained"} ${Math.abs(giants.pct).toFixed(1)}% together${leaderText(giants.leader, giants.pct)} and ${giants.pct < 0 ? "pulled it down" : "lifted it"}.`
        : null;
    return {
      line: `${base} even though ${move < 0 ? `${up} of ${total} sectors rose` : `${down} of ${total} sectors fell`}.`,
      pulled,
      pulledPct: pulled ? giants!.pct : null,
    };
  }
  const same = move >= 0 ? up : down;
  const word = move >= 0 ? "higher" : "lower";
  const line = same === total ? `${base}, with every sector ${word}.` : same === 0 ? `${base}, with no sector ${word}.` : `${base}, with ${same} of ${total} sectors ${word}.`;
  return { line, pulled: null, pulledPct: null };
}

/**
 * The market read's one time: the oldest quote among the numbers it tells as current, the index and the moves said
 * without a clock of their own. A move priced hours earlier carries its own time ("By 12:33 PM, CoreWeave was up
 * 23.9%"), so it never drags the read's time back under a headline that says the index closed. Null when nothing
 * shown is current (every number then says its own time); the feed's time only when nothing shown has a time at all.
 */
function shownAsOf(
  indexAsOf: string | null | undefined,
  groups: BriefingGroup[],
  shown: ReadonlySet<string>,
  briefing: { date?: string; market: { as_of: string | null } },
  now: number,
): string | null {
  const stamps = groups
    .filter((group) => group.ticker && shown.has(group.ticker))
    .flatMap((group) => group.items.filter((item) => item.kind === "price_move").map((item) => item.as_of))
    .filter((stamp): stamp is string => Boolean(stamp));
  if (!indexAsOf && stamps.length === 0) return briefing.market.as_of ?? null;
  const current = stamps.filter((stamp) => !earlierSession(stamp, briefing.date) && !staleMoveClock(stamp, now));
  return oldestStamp([indexAsOf, ...current]);
}

/** Words in a sentence, for keeping a headline to one short line of thought. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** A headline longer than this moves its extra clauses one line down. */
const HEADLINE_WORDS = 20;

export function briefingRead(
  briefing: Pick<Briefing, "mode" | "portfolio" | "market" | "quiet"> & { date?: string },
  grouped: GroupedSections,
  session?: BriefingSession | null,
  now: number = Date.now(),
  /**
   * `example`: the signed-out page's made-up portfolio (lib/briefing-example.ts), read as a member would see it. Its
   * headline says the day its prices are from and sets the move against the S&P 500 (`marketPct`, the same figure as
   * the page's market line), and the read carries no time of its own: the page's header says the one clock.
   */
  options: {
    example?: boolean;
    marketPct?: number | null;
    /** Held stocks' report histories by ticker (lib/briefing-report-history-server.ts), for the earnings card. */
    reports?: Readonly<Record<string, BriefingReportHistory>>;
  } = {},
): TheRead | null {
  const open = [...grouped.needs_you, ...grouped.worth_knowing, ...grouped.coming_up];
  const items = open.flatMap((group) => group.items);
  // Your own briefing reads your stocks' quotes and goes by the newest. The market read's time is worked out from what
  // it shows (shownAsOf): never the movers feed's run time, which would label a 3 PM quote "as of 9:58 AM".
  const asOf = newestStamp(
    items.filter((item) => (item.kind === "price_move" || item.kind === "zone_entered") && item.as_of).map((item) => item.as_of as string),
  );

  if (briefing.mode === "market") {
    const index = briefing.market.indices[0];
    const leads = stockGroups(grouped.needs_you);
    // One company leads, by name, with its move ("Hims & Hers fell 16.5%, the biggest move we can explain");
    // the other explained moves are the rows under the read, so the headline does not count them.
    // "The biggest move" is a claim about size, so the lead is the largest move, not the first by urgency.
    const lead = [...leads].sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))[0];
    const leadName = lead ? nameOf(lead.name, lead.ticker) || (lead.ticker as string) : "";
    const earlier = earlierSession(briefing.market.as_of, briefing.date);
    const leadMove = lead?.day_change_pct;
    // The reason goes in the headline when it splits cleanly ("Hims & Hers Health fell 16.5% after earnings that
    // missed expectations"); its row then leaves the list below, so the read never says the same thing twice.
    const leadInsight = lead && leadName ? lead.items.map((item) => explainedMoveInsight(item, briefing.date, lead.name)).find(Boolean) ?? null : null;
    // The lead's move priced hours ago (the movers feed runs once after the open) leads with its own time:
    // "By 9:58 AM, CoreWeave was up 23.9%", so a morning number never reads as now beside a live index.
    const leadStale = lead && !earlier ? staleMoveClock(lead.as_of, now) : null;
    const by = leadStale ? `By ${leadStale}, ` : "";
    // A reason too long for a short headline stays in its row below instead.
    const leadRest = leadInsight && lead?.ticker && leadInsight.text.startsWith(`${lead.ticker} `) && / after /.test(leadInsight.text)
      ? leadInsight.text.slice(lead.ticker.length + 1).replace(/\.$/, "")
      : "";
    // Behind "By 9:58 AM, " the move is past tense: "was up", never "is up".
    const whyText = leadRest ? `${by}${leadName} ${by ? leadRest.replace(/^is (up|down) /, "was $1 ") : leadRest}.` : "";
    const leadWhy = whyText && wordCount(whyText) <= HEADLINE_WORDS ? whyText : "";
    const biggest = `the biggest move${earlier ? "" : " today"} with news behind it`;
    const withBiggest = leadWhy ? `${leadWhy.replace(/\.$/, "")}, ${biggest}.` : "";
    // The "biggest move" clause rides along only while the headline stays short; otherwise it goes under the index line.
    const biggestBelow = Boolean(leadWhy) && wordCount(withBiggest) > HEADLINE_WORDS;
    const leaders = !leadName
      ? ""
      : leadWhy
        ? biggestBelow
          ? leadWhy
          : withBiggest
        : leadMove != null && Number.isFinite(leadMove) && leadMove !== 0
          ? leadStale
            ? `${by}${leadName} was ${leadMove > 0 ? "up" : "down"} ${pct(leadMove)}, ${biggest}.`
            : `${leadName} ${leadMove > 0 ? "rose" : "fell"} ${pct(leadMove)}${earlier}, ${biggest}.`
          : `${leadName} made the biggest move with news behind it${earlier}.`;
    // The index line's clock is the index's own quote time. An index without one (the home snapshot, a saved
    // briefing) gets no clock mid-session, since the movers' time is not its time; "closed" still reads from them.
    const anyClock = indexClock(index?.as_of ?? briefing.market.as_of, briefing.date);
    const clock = !index?.as_of && anyClock?.kind === "intraday" ? null : anyClock;
    const direction = index ? `${index.change_pct >= 0 ? "up" : "down"} ${pct(index.change_pct, 2)}` : "";
    const indexLine = !index
      ? ""
      : clock?.kind === "closed"
        ? `The ${index.name} closed ${direction}.`
        : clock?.kind === "intraday"
          ? `As of ${clock.clock}, the ${index.name} is ${direction}.`
          : `The ${index.name} is ${direction}.`;
    // What the whole session meant comes first when we can say it; the biggest explained move is then the first story under it.
    const day = earlier ? null : sessionParts(indexLine, index, session);
    if (day) {
      const ordered = lead ? [lead, ...leads.filter((group) => group !== lead)] : leads;
      // How the biggest companies pulled the index is the first line under the session, not part of the headline.
      const giants: Insight | null = day.pulled
        ? { id: "giants", tone: toneOfChange(day.pulledPct), text: day.pulled, ...(day.pulledPct != null ? { figure: { value: signed(day.pulledPct), label: "the biggest companies together" } } : {}) }
        : null;
      const stories = pickInsights([
        giants,
        ...ordered.slice(0, 1).map((group) => {
          const insight = group.items.map((item) => explainedMoveInsight(item, briefing.date, group.name, now)).find(Boolean) ?? null;
          return insight && group === lead ? { ...insight, soWhat: "The biggest move today with news behind it." } : insight;
        }),
      ]);
      const shown = new Set(stories.flatMap((insight) => insight.tickers ?? []));
      return { headline: day.line, insights: stories, asOf: shownAsOf(index?.as_of, leads, shown, briefing, now) };
    }
    // Otherwise the story is the headline and the index, its backdrop, is the first line under it.
    const headline = leaders || indexLine;
    const indexPoint: Insight | null =
      leaders && indexLine && index
        ? {
            id: "index",
            tone: toneOfChange(index.change_pct, 0.05),
            text: indexLine,
            figure: { value: signed(index.change_pct, 2) },
            ...(biggestBelow ? { soWhat: `${leadName}'s ${leadMove != null && Number.isFinite(leadMove) ? `${pct(leadMove)} ${leadMove < 0 ? "fall" : "rise"}` : "move"} was ${biggest}.` } : {}),
          }
        : null;
    // The index line the headline handed down rides on top of the usual three stories.
    const insights = pickInsights([
      indexPoint,
      ...leads
        .filter((group) => !(leadWhy && group === lead))
        .map((group) => group.items.map((item) => explainedMoveInsight(item, briefing.date, group.name, now)).find(Boolean) ?? null),
    ], indexPoint ? 4 : 3);
    if (!headline && insights.length === 0) return null;
    const headlineTickers = leadWhy && lead?.ticker ? [lead.ticker] : undefined;
    // The headline's lead counts as shown even when its reason stayed in its row.
    const shown = new Set([...(lead?.ticker && leaders ? [lead.ticker] : []), ...insights.flatMap((insight) => insight.tickers ?? [])]);
    return { headline, insights, asOf: shownAsOf(index?.as_of, leads, shown, briefing, now), headlineTickers };
  }

  const decisions = stockGroups(grouped.needs_you);
  const deciding = new Set(decisions.map((group) => group.key));

  // Held stocks by the size of today's move, quiet ones included, for the headline.
  const held = new Map<string, number>();
  for (const group of stockGroups(open)) {
    if (group.relation === "holding" && group.day_change_pct != null) held.set(group.key, group.day_change_pct);
  }
  for (const name of briefing.quiet.names) {
    if (name.relation === "holding" && name.day_change_pct != null && !held.has(name.ticker)) held.set(name.ticker, name.day_change_pct);
  }

  let headline = "";
  /** The line under the headline: the holdings that moved most. */
  let sub: string | undefined;
  const portfolio = briefing.portfolio ?? null;
  // The holdings headline names its leaders once the insights are known (below): a leader with a card of its own
  // drops its figure, and a Coming up card the read replaces is not a card.
  let holdingsLine: ((carded: ReadonlySet<string>) => string) | null = null;
  if (portfolio && Number.isFinite(portfolio.day_change_pct)) {
    const direction = portfolio.day_change_pct >= 0 ? 1 : -1;
    // Prices from an earlier session (before the open, a weekend, a holiday) say that day, never "today": for members
    // and the example alike.
    const when = earlierSession(portfolio.as_of, briefing.date) || " today";
    const marketPct = options.example && options.marketPct != null && Number.isFinite(options.marketPct) ? options.marketPct : null;
    // One idea and one number (owner rule 8): the move against the S&P 500 in words, the movers in the line under it.
    const move = portfolio.day_change_pct;
    const verb = Math.abs(move) < 0.05 ? "were flat" : `${move > 0 ? "rose" : "fell"} ${pct(move)}`;
    const gap = marketPct != null ? Number((Number(move.toFixed(1)) - Number(marketPct.toFixed(1))).toFixed(1)) : null;
    const baseline =
      gap === null
        ? ""
        : Math.abs(gap) < 0.15
          ? ", in line with the S&P 500"
          : `, ${Math.abs(gap).toFixed(1)} ${Math.abs(gap) === 1 ? "point" : "points"} ${gap > 0 ? "better" : "worse"} than the S&P 500`;
    headline = `Your holdings ${verb}${when}${baseline}.`;
    holdingsLine = (carded) => {
      // A flat day has no side to name movers on.
      if (Math.abs(move) < 0.05) return "";
      const leaders = [...held.entries()]
        .filter(([, move]) => Math.sign(move) === direction && Math.abs(move) >= 1)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 2)
        // A stock with its own card below shows its move there; the headline names it once without the figure (owner
        // rule 1). One in Quiet has no card, so its move stays here.
        .map(([ticker, move]) => (carded.has(ticker) ? ticker : `${ticker} (${signed(move)})`));
      return leaders.length ? `${joinAnd(leaders)} moved most.` : "";
    };
  } else if (decisions.length > 0) {
    const names = decisions.slice(0, 3).map((group) => group.ticker as string);
    const more = decisions.length - names.length;
    headline = `${decisions.length === 1 ? "One stock needs" : `${decisions.length} stocks need`} a decision today: ${joinAnd(more > 0 ? [...names, `${more} more`] : names)}.`;
  } else {
    const biggest = [...held.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    headline =
      biggest && Math.abs(biggest[1]) >= 1
        ? `Nothing needs a decision today. ${biggest[0]} moved most of what you hold, ${signed(biggest[1])}.`
        : "Nothing needs a decision today.";
  }

  // The decisions themselves are the first section below, so the read does not list them again:
  // it names them (in the headline, or here when the headline is the holdings move) and adds what else matters.
  const candidates: Array<Insight | null> = [];
  if (portfolio && decisions.length > 0) {
    const names = decisions.slice(0, 4).map((group) => group.ticker as string);
    candidates.push({
      id: "decisions",
      tone: "flat",
      text: `${decisions.length === 1 ? "One stock needs" : `${decisions.length} stocks need`} a decision: ${joinAnd(names)}.`,
      figure: { value: String(decisions.length), label: decisions.length === 1 ? "needs a decision" : "need a decision" },
      soWhat: "They are first below.",
      tickers: names,
    });
  }
  const heldGroups = stockGroups([...grouped.worth_knowing, ...grouped.coming_up]).filter(
    (group) => group.relation === "holding" && !deciding.has(group.key),
  );
  const biggestMover = heldGroups
    .filter((group) => group.day_change_pct != null && Math.abs(group.day_change_pct) >= 3)
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))[0];
  const index = briefing.market.indices[0];
  candidates.push(biggestMover ? moverInsight(biggestMover, index, briefing.date, now) : null);
  const biggestExplained = items
    .filter(
      (item) =>
        item.kind === "price_move" &&
        item.relation === "holding" &&
        item.reason_status === "confirmed" &&
        !deciding.has(item.ticker) &&
        item.ticker !== biggestMover?.key,
    )
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))[0];
  candidates.push(biggestExplained ? explainedMoveInsight(biggestExplained, briefing.date, undefined, now) : null);
  const nextEarnings = items
    .filter((item) => item.kind === "earnings_upcoming" && item.relation === "holding" && !deciding.has(item.ticker))
    .sort((a, b) => (a.deadline_days ?? 99) - (b.deadline_days ?? 99))[0];
  // Holdings first (their move, its reason, their next report), then what you watch.
  candidates.push(nextEarnings ? earningsInsight(nextEarnings, options.reports?.[nextEarnings.ticker]) : null);
  candidates.push(addZoneInsight(items, index));
  // One insight per stock: a second line on the same ticker is noise.
  // Without a decision, the decisions' place goes to what the research changed on what you watch.
  for (const group of decisions.length === 0 ? stockGroups(grouped.worth_knowing) : []) {
    const change = group.items.find((item) => item.kind === "call_changed");
    if (change) candidates.push(callInsight(change));
  }

  const used = new Set<string>();
  const insights = pickInsights(
    candidates.filter((insight) => {
      const key = insight?.tickers?.length === 1 ? insight.tickers[0] : null;
      if (!key) return true;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }),
  );
  if (holdingsLine) {
    // The cards the page shows: every open section, less the Coming up cards this read's earnings line replaces.
    const shown = [...grouped.needs_you, ...grouped.worth_knowing.slice(0, WORTH_KNOWING_FIRST), ...comingUpAfterRead(grouped.coming_up, readEarningsTickers({ insights }))];
    sub = holdingsLine(new Set(stockGroups(shown).map((group) => group.key))) || undefined;
  }
  if (!headline && insights.length === 0) return null;
  return { headline, sub, insights, asOf: options.example ? null : asOf };
}

/** Worth knowing shows this many stocks before "Show all" (re-exported by lib/briefing-anchors.ts). */
export const WORTH_KNOWING_FIRST = 8;

/**
 * Stocks whose upcoming report the read already names ("NVDA reports earnings on Tuesday after the close"), so the
 * Coming up list does not say it a second time (owner, round 6).
 */
export function readEarningsTickers(read: Pick<TheRead, "insights"> | null | undefined): Set<string> {
  return new Set((read?.insights ?? []).filter((insight) => insight.id.startsWith("earnings-")).flatMap((insight) => insight.tickers ?? []));
}

/**
 * Coming up without the stocks the read already named for their report. A stock with something else in the list
 * stays; one whose only entry is that report leaves it.
 */
export function comingUpAfterRead(groups: BriefingGroup[], named: ReadonlySet<string>): BriefingGroup[] {
  if (named.size === 0) return groups;
  return groups.filter((group) => !(group.ticker && named.has(group.ticker) && group.items.every((item) => item.kind === "earnings_upcoming")));
}
