import { marketDay, type Briefing, type BriefingItem } from "@/lib/briefing";
import { MARKET_GROUP_KEY, type BriefingGroup, type GroupedSections } from "@/lib/briefing-groups";
import { firstFullSentence, splitMoveReason, plainFinance, sentenceCase, shortCompanyName } from "@/lib/plain-copy";
import { pickInsights, toneOfChange, type Insight, type TheRead } from "@/lib/insights";

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
function explainedMoveInsight(item: BriefingItem, date?: string, name?: string | null): Insight | null {
  if (item.kind !== "price_move" || item.reason_status !== "confirmed" || item.day_change_pct == null || !item.ticker) return null;
  const reason = firstSentence(item.why);
  if (!reason) return null;
  const earlier = earlierSession(item.as_of, date);
  const up = item.day_change_pct >= 0;
  // Company first ("Hims & Hers fell 16.5% after ..."): the row shows the logo and the name, then the rest.
  const split = earlier ? null : splitMoveReason(reason, item.day_change_pct, { withPct: true, company: { name: name ?? item.ticker, ticker: item.ticker } });
  const leadName = nameOf(name, item.ticker) || (split ? split.subject : "") || undefined;
  const text = split
    ? `${item.ticker} ${split.predicate}.`
    : earlier
      ? `${item.ticker} ${up ? "rose" : "fell"} ${pct(item.day_change_pct)}${earlier}: ${reason}.`
      : `${item.ticker} is ${up ? "up" : "down"} ${pct(item.day_change_pct)}: ${reason}.`;
  return {
    id: `move-${item.id}`,
    tone: toneOfChange(item.day_change_pct),
    text,
    leadName,
    tickers: [item.ticker],
    action: { label: `Our view on ${item.ticker}`, href: stockHref(item.ticker) },
  };
}

function earningsInsight(item: BriefingItem): Insight | null {
  if (item.kind !== "earnings_upcoming" || !item.ticker) return null;
  const rest = item.headline.startsWith(`${item.ticker} `) ? item.headline.slice(item.ticker.length + 1) : item.headline;
  return {
    id: `earnings-${item.id}`,
    tone: "flat",
    text: `${item.ticker} ${rest.replace(/\.$/, "")}.`,
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
function moverInsight(group: BriefingGroup, index: IndexMove, date?: string): Insight | null {
  const move = group.day_change_pct;
  if (move == null || !group.ticker) return null;
  const top = group.lines[0]?.item;
  let why = "";
  if (top?.kind === "price_move" && top.reason_status === "confirmed") why = firstSentence(top.why);
  else if (top?.kind === "earnings_reported") why = "after its earnings report";
  const earlier = earlierSession(group.as_of, date);
  const base = earlier
    ? `${group.ticker} ${move >= 0 ? "rose" : "fell"} ${pct(move)}${earlier}`
    : `${group.ticker} is ${move >= 0 ? "up" : "down"} ${pct(move)} today`;
  return {
    id: `mover-${group.key}`,
    tone: toneOfChange(move),
    text: why ? `${base}${why.startsWith("after") ? ` ${why}` : `: ${why}`}.` : `${base}${earlier ? "" : versusIndex(index)}.`,
    soWhat: why ? undefined : "No confirmed reason yet.",
    tickers: [group.ticker],
    action: { label: `${group.ticker} report`, href: stockHref(group.ticker) },
  };
}

/** Our call moved on something you watch. */
function callInsight(item: BriefingItem): Insight | null {
  const to = item.metric?.trim();
  if (!to || !item.ticker) return null;
  return {
    id: `call-${item.id}`,
    tone: item.tone,
    text: `Our call moved to ${to}.`,
    tickers: [item.ticker],
    action: { label: `Read why`, href: stockHref(item.ticker) },
  };
}

/**
 * Stocks you watch that sit in their add zone, as one line instead of one
 * decision each. On a day the index falls, most of them got there together.
 */
function addZoneInsight(items: BriefingItem[], index: IndexMove): Insight | null {
  const names = [
    ...new Set(
      items
        .filter((item) => item.kind === "zone_entered" && item.relation === "watching" && /\badd zone\b/.test(item.headline) && item.ticker)
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
    text: `${names.length} stocks you watch are in their add zone: ${joinAnd(more > 0 ? [...named, `${more} more`] : named)}.`,
    soWhat: fell
      ? `The ${index.name} is down ${pct(index.change_pct, 2)}, so most got there with the market. Reread a call before adding.`
      : "Reread a call before adding.",
    tickers: named,
    action: { label: "Open your list", href: "/watchlist" },
  };
}

function stockGroups(groups: BriefingGroup[]): BriefingGroup[] {
  return groups.filter((group) => group.key !== MARKET_GROUP_KEY && group.ticker);
}

export function briefingRead(
  briefing: Pick<Briefing, "mode" | "portfolio" | "market" | "quiet"> & { date?: string },
  grouped: GroupedSections,
): TheRead | null {
  const open = [...grouped.needs_you, ...grouped.worth_knowing, ...grouped.coming_up];
  const items = open.flatMap((group) => group.items);
  // The market view reads the movers feed; your own reads your stocks' quotes, which are often fresher.
  const quoteTimes = items
    .filter((item) => (item.kind === "price_move" || item.kind === "zone_entered") && item.as_of)
    .map((item) => item.as_of as string)
    .sort();
  const asOf = briefing.mode === "market" ? briefing.market.as_of ?? null : quoteTimes[quoteTimes.length - 1] ?? null;

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
    const leadWhy = leadInsight && lead?.ticker && leadInsight.text.startsWith(`${lead.ticker} `) && / after /.test(leadInsight.text)
      ? `${leadName} ${leadInsight.text.slice(lead.ticker.length + 1).replace(/\.$/, "")}.`
      : "";
    const leaders = !leadName
      ? ""
      : leadWhy
        ? `${leadWhy} It was the biggest move${earlier ? "" : " today"} with a confirmed reason.`
        : leadMove != null && Number.isFinite(leadMove) && leadMove !== 0
          ? `${leadName} ${leadMove > 0 ? "rose" : "fell"} ${pct(leadMove)}${earlier}, the biggest move${earlier ? "" : " today"} with a confirmed reason.`
          : `${leadName} made the biggest move with a confirmed reason${earlier}.`;
    const clock = indexClock(briefing.market.as_of, briefing.date);
    const direction = index ? `${index.change_pct >= 0 ? "up" : "down"} ${pct(index.change_pct, 2)}` : "";
    const indexLine = !index
      ? ""
      : clock?.kind === "closed"
        ? `The ${index.name} closed ${direction}.`
        : clock?.kind === "intraday"
          ? `As of ${clock.clock}, the ${index.name} is ${direction}.`
          : `The ${index.name} is ${direction}.`;
    // The story first, the index as its backdrop.
    const headline = [leaders, indexLine].filter(Boolean).join(" ");
    const insights = pickInsights(
      leads
        .filter((group) => !(leadWhy && group === lead))
        .map((group) => group.items.map((item) => explainedMoveInsight(item, briefing.date, group.name)).find(Boolean) ?? null),
    );
    if (!headline && insights.length === 0) return null;
    return { headline, insights, asOf };
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
  const portfolio = briefing.portfolio ?? null;
  if (portfolio && Number.isFinite(portfolio.day_change_pct)) {
    const direction = portfolio.day_change_pct >= 0 ? 1 : -1;
    const leaders = [...held.entries()]
      .filter(([, move]) => Math.sign(move) === direction && Math.abs(move) >= 1)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 2)
      .map(([ticker, move]) => `${ticker} (${signed(move)})`);
    headline = `Your holdings are ${direction > 0 ? "up" : "down"} ${pct(portfolio.day_change_pct)} today${leaders.length ? `; ${joinAnd(leaders)} moved most` : ""}.`;
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
  candidates.push(biggestMover ? moverInsight(biggestMover, index, briefing.date) : null);
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
  candidates.push(biggestExplained ? explainedMoveInsight(biggestExplained, briefing.date) : null);
  const nextEarnings = items
    .filter((item) => item.kind === "earnings_upcoming" && item.relation === "holding" && !deciding.has(item.ticker))
    .sort((a, b) => (a.deadline_days ?? 99) - (b.deadline_days ?? 99))[0];
  candidates.push(addZoneInsight(items, index));
  candidates.push(nextEarnings ? earningsInsight(nextEarnings) : null);
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
  if (!headline && insights.length === 0) return null;
  return { headline, insights, asOf };
}
