import { getDailyAnomalies } from "@/lib/daily-anomalies";
import type { MarketsData } from "@/lib/markets-shared";
import { realReason } from "@/lib/reason-quality";
import { moveReason } from "@/lib/briefing";
import { moveLine } from "@/lib/move-line";
import { etDayOfStamp, oldestStamp } from "@/lib/quote-time";
import { getMarketsData } from "@/lib/markets";
import { FUND_TOPIC, SECTOR_IDS, sectorTakeaway } from "@/lib/markets-insights";
import { moversHeadline } from "@/lib/signals-insights";
import { classifyMover } from "@/lib/signals-shared";
import { sharedCache } from "@/lib/shared-cache";
import { moveFacts, type CloseSeries } from "@/lib/briefing-move-facts";
import { adminFirestore } from "@/lib/firebase-admin";

/**
 * Everything the Market today page shows, one loader per panel so each panel can
 * arrive on its own. A source that is slow or down becomes an empty section,
 * never a broken page and never a placeholder number.
 */

const SOURCE_TIMEOUT_MS = 9000;

async function soft<T>(name: string, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.error("explore_source_timeout", name);
      resolve(fallback);
    }, SOURCE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work.catch((error) => (console.error("explore_source_failed", name, error), fallback)), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type DeskMover = {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number;
  /** One line on why, only when the explanation was confirmed against a source. */
  reason: string | null;
  /** When `changePct` was priced (the live quote the feed was re-priced from, lib/daily-anomalies.ts). */
  priceAsOf: string | null;
};

export type DeskData = {
  movers: {
    /** Every unusual move up, largest first: Market today is the one list of the day's moves, so none is cut. */
    up: DeskMover[];
    down: DeskMover[];
    asOf: string | null;
    /** The New York day the moves were priced on (feed.date is a UTC date, a day ahead after 7 PM New York time). */
    day: string | null;
    thresholdPct: number | null;
    /** What the whole list adds up to, in one line. */
    takeaway?: string | null;
  };
};

/** The market's calendar day, so "today" does not flip at midnight UTC in the middle of the US evening. */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * One panel's data, cached for a minute for everyone. Nothing here changes
 * faster than that, and some sources do live price joins that cost seconds.
 * The loader throws when its source fails, so only a real answer is cached;
 * the failure (or a source that takes too long) becomes `fallback` for this
 * request alone.
 */
function section<T>(name: string, load: (today: string) => Promise<T>, fallback: T): (today: string) => Promise<T> {
  const cached = sharedCache(load, [`explore-desk-${name}-v2`], { revalidate: 60 });
  return (today) => soft(name, cached(today), fallback);
}

export const loadDeskMovers = section<DeskData["movers"]>(
  // Its own cache key since the list stopped at ten: an older cached copy has neither every move nor their times.
  "movers-all",
  async () => {
    const anomalies = await getDailyAnomalies("US");
    const rows = (anomalies?.anomalies ?? []).filter((row) => row.ticker && Number.isFinite(row.day_change_pct));
    const toMover = (row: (typeof rows)[number]): DeskMover => ({
      ticker: row.ticker,
      name: row.name,
      price: Number.isFinite(row.price) && row.price > 0 ? row.price : null,
      changePct: row.day_change_pct,
      // The briefing's rule for a confirmed reason (lib/briefing.ts moveReason: researched, with a source, more than the
      // price action), worded the way the home page words it (lib/move-line.ts). A reason that only says the move
      // again ("reverses recent gains") is none: the row goes without a line.
      reason: moveReason(row).status === "confirmed" ? realReason(moveLine(row), row.ticker, row.name) : null,
      priceAsOf: row.price_as_of ?? null,
    });
    const priced = oldestStamp(rows.map((row) => row.price_as_of));
    return {
      up: rows.filter((row) => row.day_change_pct > 0).sort((a, b) => b.day_change_pct - a.day_change_pct).map(toMover),
      down: rows.filter((row) => row.day_change_pct < 0).sort((a, b) => a.day_change_pct - b.day_change_pct).map(toMover),
      asOf: anomalies?.enriched_at ?? anomalies?.generated_at ?? null,
      day: etDayOfStamp(priced) ?? etDayOfStamp(anomalies?.generated_at ?? null),
      thresholdPct: anomalies?.threshold_pct ?? null,
      takeaway: moversHeadline(rows.map((row) => classifyMover(row))),
    };
  },
  { up: [], down: [], asOf: null, day: null, thresholdPct: null, takeaway: null },
);

/* ── Price facts for moves with no confirmed reason ─────────────────────── */

/** About three years of sessions: enough for "its biggest gain since …" and a stock's normal day. */
const FACT_SESSIONS = 760;
/** Most moves read for one page; the smallest moves past it go without a fact (and so without a line). */
const FACT_MAX_STOCKS = 30;
/** How long the moves wait for the closes before the moves without a reason show as before. */
const FACT_BUDGET_MS = 1500;
/** The most cards one kind of fact sentence may lead, while a stock has another fact to give. */
const FACT_KIND_MAX = 3;

async function readClosesUncached(ticker: string): Promise<CloseSeries | null> {
  const snap = await adminFirestore.collection("tm_price_history_daily").doc(ticker.replace(/\//g, "-")).get();
  if (!snap.exists) return null;
  const raw = snap.data() as { dates?: unknown; closes?: unknown };
  const dates = Array.isArray(raw.dates) ? raw.dates : [];
  const closes = Array.isArray(raw.closes) ? raw.closes : [];
  const n = Math.min(dates.length, closes.length);
  const out: CloseSeries = { dates: [], closes: [] };
  for (let index = Math.max(0, n - FACT_SESSIONS); index < n; index += 1) {
    const date = dates[index];
    const close = closes[index];
    if (typeof date === "string" && typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.dates.push(date.slice(0, 10));
      out.closes.push(close);
    }
  }
  return out;
}

// The series gains one close a day; a few hours of staleness changes nothing a card says.
const readCloses = sharedCache(readClosesUncached, ["explore-move-closes-v1"], { revalidate: 6 * 3600 });

/**
 * One measured price fact for each move with no confirmed reason ("Its biggest gain since Sep 9", "About three
 * times a normal 1.1% day"; lib/briefing-move-facts.ts), the most telling one no other move already says, so each
 * card on Market today carries a fact of its own (owner rule 3) and never a reason we could not confirm (rule 7).
 * Within FACT_BUDGET_MS: a stock whose closes are slow or missing has no entry. Null when none came back at all, so
 * the page keeps its moves without a line rather than dropping every one.
 */
export async function loadMoveFacts(rows: DeskMover[], fallbackDay: string): Promise<Record<string, string> | null> {
  const picked = rows.slice(0, FACT_MAX_STOCKS);
  if (picked.length === 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), FACT_BUDGET_MS);
  });
  try {
    const series = await Promise.all(
      picked.map((row) =>
        Promise.race([
          readCloses(row.ticker).catch((error) => {
            console.warn(`[explore] closes for ${row.ticker} failed:`, error instanceof Error ? error.message : error);
            return null;
          }),
          late,
        ]),
      ),
    );
    const said = new Set<string>();
    // How many cards already use each kind of sentence ("About # times a normal #% day"): a kind used FACT_KIND_MAX
    // times gives way to the stock's next fact, so the cards do not read as one sentence with new numbers (owner rule 1).
    const kinds = new Map<string, number>();
    const kindOf = (line: string) => line.replace(/\d[\d.,]*%?/g, "#").replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) #(?:, #)?/g, "D");
    const out: Record<string, string> = {};
    picked.forEach((row, index) => {
      const closes = series[index];
      if (!closes || closes === "late") return;
      const quoted = etDayOfStamp(row.priceAsOf);
      const unsaid = moveFacts(row.changePct, closes, quoted ?? fallbackDay, { exactDay: quoted !== null }).filter((line) => !said.has(line));
      const fact = unsaid.find((line) => (kinds.get(kindOf(line)) ?? 0) < FACT_KIND_MAX) ?? unsaid[0];
      if (!fact) return;
      said.add(fact);
      kinds.set(kindOf(fact), (kinds.get(kindOf(fact)) ?? 0) + 1);
      out[row.ticker] = fact;
    });
    return Object.keys(out).length > 0 ? out : null;
  } finally {
    clearTimeout(timer);
  }
}

const NO_MARKETS: MarketsData = { as_of: null, assets: [], predictions: [], treasury: null, volCurve: null };

/**
 * Every market Market today draws below its read. `getMarketsData` is cached and never throws, but a
 * store that hangs would keep those sections on their ghost, so it gets the same time limit as the rest.
 */
export function loadDeskMarketsData(): Promise<MarketsData> {
  return soft("markets-data", getMarketsData(), NO_MARKETS);
}

export type DeskSector = { id: string; name: string; slug: string; day: number; month: number | null };

/**
 * The 11 sectors and how each did on the day, from the sector funds, best
 * first. Market today leads with this: the whole market before single stocks.
 */
export const loadDeskSectors = section<{ rows: DeskSector[]; takeaway: string | null; asOf: string | null }>(
  "sectors",
  async () => {
    const data = await getMarketsData();
    const rows = SECTOR_IDS.map((id) => data.assets.find((asset) => asset.id === id))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset) && typeof asset!.change.d1 === "number" && Number.isFinite(asset!.change.d1))
      .map((asset) => {
        const name = FUND_TOPIC[asset.id] ?? asset.name;
        const slug = SECTOR_SLUG[asset.id] ?? "";
        const month = asset.change.m1;
        return { id: asset.id, name, slug, day: asset.change.d1 as number, month: typeof month === "number" && Number.isFinite(month) ? month : null };
      })
      .sort((a, b) => b.day - a.day || a.name.localeCompare(b.name));
    if (rows.length < 4) throw new Error("sectors_empty");
    return { rows, takeaway: sectorTakeaway(data.assets), asOf: data.assets.find((asset) => asset.id === "xlk")?.as_of ?? null };
  },
  { rows: [], takeaway: null, asOf: null },
);

/** Sector fund -> our sector page. */
const SECTOR_SLUG: Record<string, string> = {
  xlk: "technology",
  xlf: "financials",
  xle: "energy",
  xlv: "health-care",
  xli: "industrials",
  xly: "consumer-discretionary",
  xlp: "consumer-staples",
  xlu: "utilities",
  xlb: "materials",
  xlre: "real-estate",
  xlc: "communication-services",
};
