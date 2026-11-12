/**
 * The premarket, read in plain words: how the open is set up, the cues that
 * set it up, and the stocks gapping before the bell, each with the story
 * behind it when we have one. Pure (no I/O, no React), so it is tested on its
 * own and shared by /premarket and the briefing's "Before the open" card.
 *
 * Every sentence here is built by plain rules from the numbers in
 * tm_premarket_movers and tm_premarket_opening. The opening report's own
 * summary and drivers are model-written, so their wording is not shown.
 */
import type { Insight, TheRead } from "@/lib/insights";
import { getMarketSessionState } from "@/lib/market-session";
import { asSentence, firstFullSentence, shortCompanyName } from "@/lib/plain-copy";
import { marketDateIso } from "@/lib/premarket-shared";

/* Only the fields we read, so both loaders' documents fit without importing their server modules. */
export type CueInput = { id: string; label: string; ticker: string; region: string; group: string; price: number; previous_close: number; change_pct: number; captured_at?: string };
export type GapNewsInput = { ticker: string; tape_line?: string; detail?: string; gap_pct?: number | null };
export type GapperInput = { ticker: string; name?: string; sector?: string | null; gap_pct: number; price?: number | null; previous_close?: number | null };
export type SectorGapInput = { sector: string; count: number; avg_gap_pct: number };

export type PremarketInput = {
  /** When the opening report was built (ISO). */
  generatedAt: string | null;
  cues: CueInput[];
  news: GapNewsInput[];
  up: GapperInput[];
  down: GapperInput[];
  sectors?: SectorGapInput[];
};

/** The two premarket documents, as they come from lib/premarket-opening.ts and lib/premarket.ts (only what we read). */
type ReportLike = { generated_at?: string; global_cues?: CueInput[]; news?: GapNewsInput[]; premarket?: { top_gainers?: GapperInput[]; top_losers?: GapperInput[] } };
type MoverRowLike = { ticker: string; name?: string; sector?: string | null; pre_market_change_pct: number; pre_market_price?: number; previous_close?: number };
type MoversLike = { generated_at?: string; date?: string; gappers_up?: MoverRowLike[]; gappers_down?: MoverRowLike[]; sector_summary?: SectorGapInput[] };

/**
 * One input from both documents. The movers document has all fifteen gappers each way with prices, the opening
 * report only the top five, so the movers win when they are there; the report's time is the page's time.
 */
export function premarketInputFrom(report: ReportLike | null | undefined, movers: MoversLike | null | undefined): PremarketInput {
  // The movers come from their own job: when they are from another day than the report, the report's own top
  // gappers (same run as its time and news) are used instead, so nothing old sits under today's time.
  const reportDay = etDayOf(report?.generated_at);
  const moversDay = typeof movers?.date === "string" ? movers.date.slice(0, 10) : etDayOf(movers?.generated_at);
  const useMovers = Boolean(movers) && (!reportDay || !moversDay || reportDay === moversDay);
  const rows = (list: MoverRowLike[] | undefined): GapperInput[] =>
    (list ?? []).map((row) => ({ ticker: row.ticker, name: row.name, sector: row.sector, gap_pct: row.pre_market_change_pct, price: row.pre_market_price, previous_close: row.previous_close }));
  return {
    generatedAt: report?.generated_at || movers?.generated_at || null,
    cues: report?.global_cues ?? [],
    news: report?.news ?? [],
    up: useMovers && movers?.gappers_up?.length ? rows(movers.gappers_up) : report?.premarket?.top_gainers ?? [],
    down: useMovers && movers?.gappers_down?.length ? rows(movers.gappers_down) : report?.premarket?.top_losers ?? [],
    sectors: useMovers && Array.isArray(movers?.sector_summary) ? movers!.sector_summary : [],
  };
}

export type PremarketPhase = "live" | "open" | "closed";

export type PremarketWhen = {
  phase: PremarketPhase;
  /** The data is from today's premarket (New York time). */
  today: boolean;
  /** The weekday the data is from ("Wednesday"), for a read of an earlier day. Absent when unknown. */
  weekday?: string | null;
  /** A plain line for the head when the numbers are not live, else null. */
  note: string | null;
};

export type Gapper = {
  ticker: string;
  name: string;
  pct: number;
  price: number | null;
  /** The story behind the gap in one sentence, only when we have one. */
  reason: string | null;
};

/** A gap smaller than this is not pinned on a news story: at that size the story is rarely why. */
export const GAP_REASON_MIN_PCT = 1.5;
/** Futures within this of flat call for a flat open. */
const FLAT_BAND_PCT = 0.25;

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" });

function etDayOf(iso: string | null | undefined): string | null {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? ET_DAY.format(new Date(ms)) : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** "+1.90%" / "−0.98%", with a real minus sign. */
export function gapPct(value: number, digits = 2): string {
  const shown = Number(value.toFixed(digits));
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(digits)}%`;
}

/** "up 1.9%" / "down 0.98%": a move in words, two decimals at most and no trailing zeros. "flat" when it rounds to 0. */
function moveWords(value: number): string {
  const size = Number(Math.abs(value).toFixed(2));
  if (size === 0) return "flat";
  return `${value >= 0 ? "up" : "down"} ${size}%`;
}

/**
 * Whether these numbers are this morning's premarket and what the market is doing now. Outside 4:00-9:30 ET the
 * page says plainly that this was this morning's premarket (or an earlier day's) and that the market is open or closed.
 */
export function premarketWhen(generatedAt: string | null, now: Date = new Date()): PremarketWhen {
  const session = getMarketSessionState(now);
  const todayKey = marketDateIso("US", now);
  const day = etDayOf(generatedAt);
  const today = day === todayKey;
  const weekday = generatedAt && day ? WEEKDAY.format(new Date(generatedAt)) : null;
  const marketNow = session.kind === "open" ? "The market is open now." : "The market is closed now.";
  if (today && session.kind === "premarket") return { phase: "live", today, weekday, note: null };
  const phase: PremarketPhase = session.kind === "open" ? "open" : "closed";
  if (today) return { phase, today, weekday, note: `This is this morning's premarket. ${marketNow}` };
  const from = generatedAt && day ? `the premarket from ${DAY_LABEL.format(new Date(generatedAt))}` : "the last premarket we have";
  if (session.kind === "premarket") return { phase: "live", today, weekday, note: `Today's premarket numbers are not in yet, so this is ${from}.` };
  return { phase, today, weekday, note: `This is ${from}. ${marketNow}` };
}

/**
 * Whether /premarket has anything to show: this morning's numbers, before the open, with at least one market cue or
 * gapper (owner, Nov 12: "we shouldnt show premarket unless we have it for today"). The page and the nav's readiness
 * check (app/api/premarket/quotes) both ask this, so the nav never offers a page that would send you away.
 */
export function hasTodaysPremarket(input: PremarketInput, now: Date = new Date()): boolean {
  const when = premarketWhen(input.generatedAt, now);
  if (when.phase !== "live" || !when.today) return false;
  const cues = futuresCues(input.cues).length + overseasCues(input.cues).length;
  return cues + gappers(input.up, "up", []).length + gappers(input.down, "down", []).length > 0;
}

const FUTURES_ORDER = ["ES", "NQ", "RTY"];

/** US index futures, S&P 500 first. */
export function futuresCues(cues: readonly CueInput[]): CueInput[] {
  const rank = (cue: CueInput) => {
    const index = FUTURES_ORDER.findIndex((code) => cue.id.toUpperCase().endsWith(`_${code}`) || cue.ticker.toUpperCase().startsWith(`${code}=`));
    return index < 0 ? FUTURES_ORDER.length : index;
  };
  return cues.filter((cue) => cue.group === "futures" && finite(cue.change_pct) && cue.price > 0).sort((a, b) => rank(a) - rank(b));
}

/** Asia, Europe, then oil, the VIX and anything else that sets up the open. */
export function overseasCues(cues: readonly CueInput[]): CueInput[] {
  const order = ["asia", "europe", "macro"];
  const rank = (cue: CueInput) => (order.includes(cue.group) ? order.indexOf(cue.group) : order.length);
  return cues
    .filter((cue) => cue.group !== "futures" && finite(cue.change_pct) && cue.price > 0)
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => rank(a.cue) - rank(b.cue) || a.index - b.index)
    .map(({ cue }) => cue);
}

/**
 * "Futures point to a higher open, led by Nasdaq 100 futures up 1.9%." Present tense only for today's numbers
 * before the bell; "This morning, futures pointed..." later today; "On Wednesday, futures pointed..." for an
 * earlier day. Null without futures.
 */
export function openingHeadline(cues: readonly CueInput[], when: Pick<PremarketWhen, "phase" | "today" | "weekday">): string | null {
  const futures = futuresCues(cues);
  if (futures.length === 0) return null;
  const broad = futures.filter((cue) => /_(ES|NQ)$/i.test(cue.id) || /^(ES|NQ)=/i.test(cue.ticker));
  const basis = broad.length > 0 ? broad : futures;
  const average = basis.reduce((sum, cue) => sum + cue.change_pct, 0) / basis.length;
  const live = when.phase === "live" && when.today;
  const past = when.today ? "This morning, futures" : when.weekday ? `On ${when.weekday}, futures` : "At the last premarket, futures";
  const lead = [...futures].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))[0]!;
  if (Math.abs(average) < FLAT_BAND_PCT) {
    const sp = futures[0]!;
    return live
      ? `Futures point to a flat open: ${sp.label} are ${moveWords(sp.change_pct)}.`
      : `${past} pointed to a flat open: ${sp.label} were ${moveWords(sp.change_pct)}.`;
  }
  const way = average > 0 ? "higher" : "lower";
  return live
    ? `Futures point to a ${way} open, led by ${lead.label} ${moveWords(lead.change_pct)}.`
    : `${past} pointed to a ${way} open, led by ${lead.label} ${moveWords(lead.change_pct)}.`;
}

const ROSE_WORDS = /\b(?:rose|rises|rising|jump(?:s|ed)?|surg(?:e|es|ed|ing)|soar(?:s|ed|ing)?|gain(?:s|ed)?|climb(?:s|ed)?|rall(?:y|ies|ied)|spik(?:e|es|ed)|rebound(?:s|ed)?|higher)\b|\bup \d[\d.]*%/i;
const FELL_WORDS = /\b(?:fell|falls|falling|drop(?:s|ped)?|slid(?:e|es)?|slip(?:s|ped)?|slump(?:s|ed)?|plung(?:e|es|ed)|sank|sinks?|tumbl(?:e|es|ed)|declin(?:e|es|ed)|lost|los(?:e|es)|lower)\b|\bdown \d[\d.]*%/i;

/** The direction a story's sentence tells, by the first move word in it: "Dell fell 12% in a week" is down. */
function storyDirection(text: string): "up" | "down" | null {
  const rose = ROSE_WORDS.exec(text);
  const fell = FELL_WORDS.exec(text);
  if (rose && fell) return rose.index <= fell.index ? "up" : "down";
  return rose ? "up" : fell ? "down" : null;
}

/**
 * The story behind each gap, in one of our own sentences. Only for gaps big enough to pin on a story, and never a
 * story that went the other way: a stock gapping up 7% is not explained by "Dell fell 12% in a week" (Nov 11).
 */
function reasonFor(ticker: string, pct: number, news: readonly GapNewsInput[]): string | null {
  if (Math.abs(pct) < GAP_REASON_MIN_PCT) return null;
  const direction = pct > 0 ? "up" : "down";
  for (const story of news) {
    if (story.ticker.toUpperCase() !== ticker.toUpperCase() || !(story.tape_line || "").trim()) continue;
    if (finite(story.gap_pct) && story.gap_pct !== 0 && story.gap_pct > 0 !== pct > 0) continue;
    const sentence = asSentence(firstFullSentence(story.tape_line!));
    if (!sentence || sentence.length > 220) continue;
    const told = storyDirection(sentence);
    if (told && told !== direction) continue;
    return sentence;
  }
  return null;
}

/** Gappers in one direction, biggest first, with a story when we have one. Rows that went the other way are left out. */
export function gappers(rows: readonly GapperInput[], direction: "up" | "down", news: readonly GapNewsInput[]): Gapper[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.ticker && finite(row.gap_pct) && (direction === "up" ? row.gap_pct > 0 : row.gap_pct < 0))
    .filter((row) => {
      const key = row.ticker.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (direction === "up" ? b.gap_pct - a.gap_pct : a.gap_pct - b.gap_pct))
    .map((row) => ({
      ticker: row.ticker.toUpperCase(),
      name: shortCompanyName(row.name) || row.ticker.toUpperCase(),
      pct: row.gap_pct,
      price: finite(row.price) ? row.price : null,
      reason: reasonFor(row.ticker, row.gap_pct, news),
    }));
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The read: the headline from the futures, then up to three findings drawn from the cues and the gappers, each
 * with its number and the stocks it touches. Findings that the data cannot back are left out.
 */
export function premarketRead(input: PremarketInput, when: PremarketWhen): TheRead | null {
  const headline = openingHeadline(input.cues, when);
  // Present tense only for today's numbers before the bell.
  const live = when.phase === "live" && when.today;
  const insights: Insight[] = [];

  // Overseas: how many of the markets that already traded today rose, and the exception.
  const overseas = overseasCues(input.cues).filter((cue) => cue.group === "asia" || cue.group === "europe");
  if (overseas.length >= 3) {
    const rose = overseas.filter((cue) => cue.change_pct > 0);
    const fell = overseas.filter((cue) => cue.change_pct < 0);
    const majority = rose.length >= fell.length ? rose : fell;
    const minority = majority === rose ? fell : rose;
    const best = [...majority].sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))[0];
    if (best && majority.length > overseas.length / 2) {
      const verb = majority === rose ? "rose" : "fell";
      const regions = [...new Set(overseas.map((cue) => cue.group))];
      const where = regions.length > 1 ? "Asia and Europe" : regions[0] === "europe" ? "Europe" : "Asia";
      const odd = minority.length === 1 ? ` ${minority[0]!.label} was the exception, ${moveWords(minority[0]!.change_pct)}.` : "";
      insights.push({
        id: "overseas",
        tone: majority === rose ? "up" : "down",
        figure: { value: `${majority.length} of ${overseas.length}`, label: "markets abroad", tone: majority === rose ? "up" : "down" },
        text: `${where} mostly ${verb} overnight, led by ${best.label} ${moveWords(best.change_pct)}.${odd}`,
      });
    }
  }

  // The gappers: where the early buying is, by sector, and the names that lead it.
  const up = gappers(input.up, "up", input.news);
  const down = gappers(input.down, "down", input.news);
  const sector = [...(input.sectors ?? [])].filter((row) => row.count >= 3 && finite(row.avg_gap_pct)).sort((a, b) => Math.abs(b.avg_gap_pct) - Math.abs(a.avg_gap_pct))[0];
  if (up.length >= 3) {
    const top = up.slice(0, 3);
    const lead = sector && sector.avg_gap_pct > 0 ? ` ${sector.sector} stocks ${live ? "are" : "were"} up ${Number(sector.avg_gap_pct.toFixed(1))}% on average before the bell.` : "";
    insights.push({
      id: "gappers-up",
      tone: "up",
      tickers: top.map((row) => row.ticker),
      figure: { value: gapPct(top[0]!.pct, 1), label: "the biggest gap up", tone: "up" },
      text: `${joinNames(top.map((row) => row.name))} ${live ? "lead" : "led"} the early gainers.${lead}`,
      action: { label: "See every stock gapping up", href: "#gapping-up" },
    });
  }
  if (down.length >= 1) {
    const top = down.slice(0, 3);
    const deep = top[0]!.pct <= -3;
    insights.push({
      id: "gappers-down",
      tone: "down",
      tickers: top.map((row) => row.ticker),
      figure: { value: gapPct(top[0]!.pct, 1), label: "the biggest gap down", tone: "down" },
      text: deep
        ? `${joinNames(top.map((row) => row.name))} ${live ? "are" : "were"} the biggest early decliners.`
        : `The selling is light: no stock we follow ${live ? "is" : "was"} down more than ${Number(Math.abs(top[0]!.pct).toFixed(1))}% before the bell.`,
      action: { label: "See every stock gapping down", href: "#gapping-down" },
    });
  }

  if (!headline && insights.length === 0) return null;
  return {
    headline: headline ?? (live ? "Here is how the open is set up." : "Here is how the open was set up this morning."),
    insights: insights.slice(0, 3),
    asOf: input.generatedAt,
  };
}
