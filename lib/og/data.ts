/**
 * Builds each share card's spec from the same loaders and read builders the
 * page uses, so the card says what the page says. Server only.
 *
 * Rules (THE RULE, and the honesty rules in docs/volaren-parity-hillclimb.md):
 * - Lead with the read: the page's own headline insight is the hero.
 * - Every number comes from stored data at render time, with its date nearby.
 * - Missing data leaves a part out; it never becomes a zero or a placeholder.
 * - The viewer is always anonymous here: no session is read, nothing personal
 *   is drawn, and add/trim levels never appear on any card. The call and its
 *   reason are open to everyone, so those may.
 */

import { unstable_cache } from "next/cache";

import { getStockSummary, normalizeStockSymbolParam } from "@/lib/stock";
import { getScreenerRows, getScreenerSnapshot } from "@/lib/screener";
import { getDailySeries } from "@/lib/screener-series";
import { getGroupMove, getMarketDay, getStockGroup } from "@/lib/insight-data";
import { buildStockRead as buildStockInsightRead } from "@/lib/stock-insights";
import { etDay } from "@/lib/insight-format";
import { stockLogoSources } from "@/lib/stock-logo-sources";
import { loadMovers, loadPolicy, loadReddit } from "@/lib/signals";
import { buildMoversRead, buildSignalsTodayRead } from "@/lib/signals-insights";
import { getMarketsData } from "@/lib/markets";
import { buildMarketsRead } from "@/lib/markets-insights";
import {
  assetReading,
  classInfoBySlug,
  classInfoFor,
  formatChange,
  formatLevel,
  formatProbability,
  type MarketAsset,
} from "@/lib/markets-shared";
import { loadCalendarRange, loadReportContext } from "@/lib/calendar";
import { buildCalendarRead, readTickers } from "@/lib/calendar-insights";
import { addDays, todayET, weekStart } from "@/lib/calendar-shared";
import { buildScreenerRead } from "@/lib/screener-insights";
import { getFollowProfile, getFollowRead, getInsiderBuys, getInsiderTrades, getSectorMap } from "@/lib/follow";
import { fmtWeight, quarterLabel, type CongressProfile, type FundProfile } from "@/lib/follow-shared";
import { buildCongressMemberRead, buildFundRead, buildInsiderRead } from "@/lib/follow-insights";
import { getFilingsMeta, getFilingsStream } from "@/lib/filings";
import { buildFilingsRead } from "@/lib/filings-insights";
import { getStrategy, listStrategies } from "@/lib/strategies";
import { buildStrategiesRead } from "@/lib/strategies-insights";
import { FREE_COVERED_STOCKS, can } from "@/lib/entitlements";
import { getBasket, getBaskets } from "@/lib/screener-themes";
import { buildThemeRead, buildThemesRead } from "@/lib/themes-insights";
import { loadWire, modelLabel } from "@/lib/wire";
import { readTheWire } from "@/lib/wire-read";
import { parseWireFilters } from "@/lib/wire-shared";
import { buildCompareRead } from "@/lib/compare-insights";
import { parseCompareSymbols } from "@/lib/compare-shared";
import { allBlogPosts } from "@/lib/blog-data";
import { GUIDES, SECTIONS, getGuide, getSection, guidesIn, readingMinutes } from "@/lib/docs";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";
import { DOC_COMPARISONS, docCompareHref, getDocComparison } from "@/lib/docs/compare";
import { getLegalDoc } from "@/lib/docs/company";
import { GLOSSARY } from "@/lib/docs";
import { HERO_HEADLINE, HERO_SUBHEAD } from "@/lib/brand-copy";
import { LANDING_HERO_BREW_TICKERS } from "@/lib/landing-hero-featured";
import type { TheRead } from "@/lib/insights";
import { withoutZones, type ScreenerRow } from "@/lib/screener-shared";
import { loadDeskBrief, loadDeskWire } from "@/app/(app)/explore/desk-data";
import { mergeDeskRead } from "@/lib/explore-insights";

import {
  ogDayLabel,
  ogEyebrow,
  ogFootnote,
  ogMonthLabel,
  ogPrice,
  ogSignedPct,
  ogStamp,
  ogThin,
  ogTone,
  ogWindow,
  levelFree,
  withoutCallSentence,
} from "@/lib/og/format";
import type { OgCall, OgCard, OgLine, OgReadCard, OgRecordCard, OgStat, OgTextCard } from "@/lib/og/types";
import type { OgPageKey } from "@/lib/og/url";

/**
 * The live quote, shared across cards for five minutes. Uncached it is two
 * LocalDB round trips, which can take seconds; when it is slower than the
 * card's budget the card falls back to the screener snapshot's price and says
 * when that price is from.
 */
const getQuoteCached = unstable_cache((symbol: string) => getStockSummary(symbol, "US"), ["og-stock-summary-v1"], { revalidate: 300 });

/* ── shared bits ────────────────────────────────────────────────────────── */

/** Resolve within `ms` or give up with null, so one slow source never stalls a card. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asCall(value: unknown): OgCall | null {
  return value === "Add" || value === "Hold" || value === "Trim" ? value : null;
}

function readLines(read: TheRead | null | undefined, max = 2): OgLine[] {
  return (read?.insights ?? []).slice(0, max).map((insight) => ({ text: insight.text, tone: insight.tone }));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The most specific line we can say about the call: the thesis first, then the action summary. */
function callNote(row: ScreenerRow | null | undefined): string | null {
  return levelFree(row?.thesis) ?? levelFree(row?.call_reason);
}

/* ── logos: inlined, cached per process, never allowed to slow a card much ── */

const LOGO_TTL_MS = 6 * 3600_000;
const logoCache = new Map<string, { at: number; value: string | null }>();

async function fetchLogo(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "force-cache" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0]!.trim();
    // Satori decodes PNG and JPEG reliably; anything else falls back to the monogram.
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 700) return null; // blank placeholder
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The first logo that loads, in the same order the site tries them. All are
 * fetched at once so a dead source costs nothing; Clearbit (shut down) and the
 * 64px favicon (too small for a card) are skipped. A miss is remembered for
 * ten minutes only, so a slow moment does not cost a logo for hours.
 */
export async function loadLogo(ticker: string, logoUrl?: string | null): Promise<string | null> {
  const key = ticker.toUpperCase();
  const hit = logoCache.get(key);
  if (hit && Date.now() - hit.at < (hit.value ? LOGO_TTL_MS : 10 * 60_000)) return hit.value;
  const sources = stockLogoSources(key, "US", logoUrl).filter((url) => !/clearbit\.com|google\.com\/s2\/favicons/.test(url)).slice(0, 3);
  const results = await Promise.all(sources.map((url) => fetchLogo(url)));
  const value = results.find((result) => result !== null) ?? null;
  logoCache.set(key, { at: Date.now(), value });
  return value;
}

/* ── landing ────────────────────────────────────────────────────────────── */

export async function landingCard(): Promise<OgCard> {
  const snapshot = await within(getScreenerSnapshot(), 2500);
  const rows = snapshot?.rows ?? [];
  const showcase = new Set<string>(LANDING_HERO_BREW_TICKERS);
  const usable = (row: ScreenerRow) => asCall(row.call) && finite(row.day_pct) && finite(row.price) && Boolean(callNote(row));
  // A name people know, with a call and a reason: the biggest mover among the showcase names first.
  const pick =
    rows.filter((row) => showcase.has(row.symbol) && usable(row)).sort((a, b) => Math.abs(b.day_pct!) - Math.abs(a.day_pct!))[0] ??
    rows.filter(usable).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))[0] ??
    null;
  if (!pick) {
    return { kind: "landing", eyebrow: null, headline: HERO_HEADLINE, sub: HERO_SUBHEAD, row: null, footnote: "Free to read every stock" };
  }
  const [live, logo] = await Promise.all([within(getQuoteCached(pick.symbol), 1500), within(loadLogo(pick.symbol), 1800)]);
  const livePrice = live && finite(live.price) && live.price > 0 ? live : null;
  const price = livePrice ? livePrice.price : pick.price!;
  const dayPct = livePrice && finite(livePrice.day_change_pct) ? livePrice.day_change_pct : pick.day_pct!;
  const priceAt = livePrice?.captured_at ?? pick.price_at ?? null;
  return {
    kind: "landing",
    eyebrow: ogEyebrow("Today's call", ogDayLabel(etDay(priceAt) ?? null)),
    headline: HERO_HEADLINE,
    sub: HERO_SUBHEAD,
    row: {
      ticker: pick.symbol,
      logo,
      price: ogPrice(price),
      dayPct,
      call: asCall(pick.call),
      reason: callNote(pick)!,
    },
    footnote: ogFootnote(priceAt ? `${pick.symbol} price ${ogStamp(priceAt)}` : null, pick.call_at ? `call ${ogDayLabel(pick.call_at)}` : null),
  };
}

/* ── stock ──────────────────────────────────────────────────────────────── */

export async function stockCard(raw: string): Promise<OgCard | null> {
  const symbol = normalizeStockSymbolParam(raw);
  if (!symbol) return null;
  const [rows, summary, seriesSet, marketDay, groupRef, movers] = await Promise.all([
    within(getScreenerRows([symbol]), 2500),
    within(getQuoteCached(symbol), 1500),
    within(getDailySeries([symbol, "SPY"]), 2500),
    within(getMarketDay(), 1500),
    within(getStockGroup(symbol), 1500),
    within(loadMovers(), 1500),
  ]);
  const row = rows?.get(symbol) ?? null;
  const live = summary && summary.source !== "none" ? summary : null;
  const name = live?.name ?? row?.name ?? null;
  if (!row && !live) return null;

  const price = live && finite(live.price) && live.price > 0 ? live.price : finite(row?.price) ? row!.price! : null;
  const dayPct = live && finite(live.day_change_pct) ? live.day_change_pct : finite(row?.day_pct) ? row!.day_pct! : null;
  const priceAt = (live ? live.captured_at : null) ?? row?.price_at ?? null;
  const quoteDay = etDay(priceAt);
  const today = todayET();

  const [group, logo] = await Promise.all([
    groupRef ? within(getGroupMove(groupRef.kind, groupRef.name, quoteDay, symbol), 1500) : Promise.resolve(null),
    within(loadLogo(symbol, live?.logo_url), 1800),
  ]);

  const series = seriesSet?.series[symbol] ?? null;
  const mover = movers?.movers.find((item) => item.ticker === symbol && item.explained && item.headline) ?? null;
  const moveReason = mover && movers?.day === quoteDay ? mover.headline : null;
  const call = asCall(row?.call);

  const read = buildStockInsightRead({
    ticker: symbol,
    today,
    quoteDay,
    price,
    dayPct,
    group: group ? { label: group.name, medianPct: group.medianPct, count: group.count } : null,
    marketPct: marketDay && marketDay.day === quoteDay ? marketDay.pct : null,
    series,
    benchmark: seriesSet?.series.SPY ?? null,
    moveReason,
    nextEarnings: row?.earnings_date ? { date: row.earnings_date, time: row.earnings_time ?? null } : null,
    pastEarnings: [],
    // The pill shows the call; the read never sees levels here (gating: anonymous viewer).
    call: null,
    levels: null,
    lastChange: null,
  });
  const headline = read?.headline ? withoutCallSentence(read.headline) : null;
  // Beside the call: why we hold that view. Without a call, the read's next insight.
  const note = (call ? callNote(row) : null) ?? read?.insights[0]?.text ?? null;

  // The line ends on the day the price is from, so its last point is the price on the card.
  const history = (series ?? []).filter((point) => !quoteDay || point.date.slice(0, 10) <= quoteDay);
  const closes = history.map((point) => point.close);
  const lastDay = history.length ? history[history.length - 1]!.date.slice(0, 10) : null;
  if (price !== null && quoteDay && lastDay && lastDay < quoteDay) closes.push(price);
  const window = ogWindow(closes, 63);
  return {
    kind: "quote",
    eyebrow: ogEyebrow("Stock report", ogDayLabel(quoteDay)),
    path: `/stock/${symbol}`,
    symbol,
    name,
    logo,
    showLogo: true,
    headline,
    call,
    note,
    quote: {
      level: ogPrice(price),
      change: ogSignedPct(dayPct),
      dayPct,
      changeLabel: quoteDay && quoteDay !== today ? `on ${ogDayLabel(quoteDay)}` : "today",
      spark: window.values.length > 1 ? window.values : null,
      sparkLabel: window.values.length > 1 ? "3 months" : null,
      sparkPct: window.pct,
    },
    footnote: ogFootnote(priceAt ? `Price ${ogStamp(priceAt)}` : null, call && row?.call_at ? `call ${ogDayLabel(row.call_at)}` : null),
  };
}

/* ── compare ────────────────────────────────────────────────────────────── */

export async function compareCard(raw: string): Promise<OgCard | null> {
  const symbols = parseCompareSymbols(raw, 4);
  if (symbols.length < 2) return null;
  const rows = await within(getScreenerRows([...symbols, "SPY"]), 2500);
  if (!rows) return null;
  // Anonymous viewer: no zones reach the read (the call itself is open to everyone).
  const present = symbols.map((symbol) => {
    const row = rows.get(symbol);
    return row ? withoutZones(row) : null;
  });
  if (present.filter(Boolean).length < 2) return null;
  const read = buildCompareRead({ rows: present, benchmark: rows.get("SPY") ?? null });
  const logos = await Promise.all(symbols.map((symbol) => within(loadLogo(symbol), 1800)));
  const priceAt = present.find((row) => row?.price_at)?.price_at ?? null;
  return {
    kind: "compare",
    eyebrow: ogEyebrow("Compare", ogDayLabel(etDay(priceAt))),
    path: `/compare?symbols=${symbols.join(",")}`,
    headline: read?.headline ?? null,
    columns: symbols.map((symbol, index) => {
      const row = present[index];
      const stats: OgStat[] = [];
      if (finite(row?.ret_1y)) stats.push({ label: "1 year", value: ogSignedPct(row!.ret_1y)!, tone: ogTone(row!.ret_1y) });
      if (finite(row?.fwd_pe) && row!.fwd_pe! > 0) stats.push({ label: "Forward P/E", value: row!.fwd_pe!.toFixed(1) });
      else if (finite(row?.pe) && row!.pe! > 0) stats.push({ label: "P/E", value: row!.pe!.toFixed(1) });
      if (finite(row?.rev_growth)) stats.push({ label: "Revenue growth", value: ogSignedPct(row!.rev_growth)!, tone: ogTone(row!.rev_growth) });
      return {
        ticker: symbol,
        name: row?.name ?? null,
        logo: logos[index] ?? null,
        price: ogPrice(row?.price),
        dayPct: finite(row?.day_pct) ? row!.day_pct! : null,
        call: asCall(row?.call),
        stats,
      };
    }),
    footnote: ogFootnote(priceAt ? `Prices ${ogStamp(priceAt)}` : null),
  };
}

/* ── briefing: what moved and why ───────────────────────────────────────── */

async function briefingCard(): Promise<OgCard | null> {
  const [movers, markets] = await Promise.all([within(loadMovers(), 2500), within(getMarketsData(), 2500)]);
  const list = movers?.movers ?? [];
  if (list.length === 0) return null;
  // The day's read leads (how the market did and what stood out), then the movers with their reasons.
  const marketRead = markets && markets.assets.length ? buildMarketsRead(markets) : null;
  const moverRead = buildMoversRead(list, movers?.generatedAt ?? null);
  const ranked = [...list].sort((a, b) => Number(b.explained) - Number(a.explained) || Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 3);
  return {
    kind: "list",
    eyebrow: ogEyebrow("Briefing", ogDayLabel(movers?.day ?? null)),
    path: "/briefing",
    headline: marketRead?.headline ?? moverRead?.headline ?? "What moved today, and why",
    rows: ranked.map((mover) => ({
      label: mover.ticker,
      value: ogSignedPct(mover.pct),
      tone: ogTone(mover.pct),
      note: mover.explained ? mover.headline ?? mover.cause ?? "Reason confirmed" : "No confirmed reason yet",
    })),
    footnote: ogFootnote(movers?.generatedAt ? `Movers as of ${ogStamp(movers.generatedAt)}` : null),
  };
}

/* ── read pages ─────────────────────────────────────────────────────────── */

function readCard(key: string, label: string, path: string, read: TheRead | null, extra: { stats?: OgStat[]; footnote?: string | null; day?: string | null } = {}): OgReadCard | null {
  if (!read || !read.headline.trim()) return null;
  return {
    kind: "read",
    eyebrow: ogEyebrow(label, extra.day ?? ogDayLabel(read.asOf ?? null)),
    path,
    headline: read.headline,
    lines: readLines(read),
    stats: extra.stats,
    footnote: extra.footnote !== undefined ? extra.footnote : ogFootnote(read.source ? read.source : null, read.asOf ? `as of ${ogStamp(read.asOf)}` : null),
  };
}

async function exploreCard(): Promise<OgCard | null> {
  const today = todayET();
  // The same read the page shows: the brief with the news folded in, stocks first.
  const [brief, wire] = await Promise.all([within(loadDeskBrief(today), 4000), within(loadDeskWire(today), 4000)]);
  return readCard("explore", "Explore", "/explore", mergeDeskRead(brief?.read, wire?.read), { day: ogDayLabel(today) });
}

async function newsCard(): Promise<OgCard | null> {
  const now = Date.now();
  const wire = await within(loadWire({ now }), 4000);
  if (!wire) return null;
  const reading = readTheWire(
    {
      items: wire.items,
      quotes: wire.quotes,
      labels: wire.labels,
      newestAt: wire.freshness.newestAt,
      labelledBy: modelLabel(wire.labelsMeta.model),
      labelledAt: wire.labelsMeta.updatedAt,
    },
    { nowMs: now, filters: parseWireFilters({}), buzzLimit: 14, themeLimit: 5 },
  );
  return readCard("news", "The wire", "/news", reading.read, {
    day: ogDayLabel(wire.freshness.newestAt),
    footnote: ogFootnote(wire.freshness.newestAt ? `Newest headline ${ogStamp(wire.freshness.newestAt)}` : null),
  });
}

const MARKET_STRIP = ["spx", "ndx", "us10y", "btc"];

function assetStat(asset: MarketAsset): OgStat {
  const change = formatChange(asset.change.d1, asset.change_mode);
  return {
    label: asset.symbol.length <= 6 ? asset.symbol : asset.name,
    value: formatLevel(asset.price, asset.unit),
    sub: change ?? undefined,
    subTone: ogTone(asset.change.d1),
  };
}

async function marketsCard(): Promise<OgCard | null> {
  const data = await within(getMarketsData(), 3000);
  if (!data || data.assets.length === 0) return null;
  const read = buildMarketsRead(data);
  const strip = MARKET_STRIP.map((id) => data.assets.find((asset) => asset.id === id || asset.symbol.toLowerCase() === id)).filter(
    (asset): asset is MarketAsset => Boolean(asset),
  );
  return readCard("markets", "Markets", "/markets", read, {
    stats: strip.map(assetStat),
    footnote: ogFootnote(data.as_of ? `as of ${ogStamp(data.as_of)}` : null),
  });
}

async function signalsCard(): Promise<OgCard | null> {
  const now = Date.now();
  const [movers, reddit, policy] = await Promise.all([within(loadMovers(), 2500), within(loadReddit(now), 2500), within(loadPolicy(), 2500)]);
  // Anonymous viewer: the policy archive is clipped to seven days, as on the page.
  const posts = (policy?.posts ?? []).filter((post) => {
    const at = Date.parse(post.publishedAt ?? "");
    return Number.isFinite(at) && now - at <= 7 * 86_400_000;
  });
  const read = buildSignalsTodayRead(movers?.movers ?? [], reddit?.names ?? [], posts, now, movers?.generatedAt ?? null);
  return readCard("signals", "Signals", "/signals", read);
}

async function calendarCard(): Promise<OgCard | null> {
  const today = todayET();
  const monday = weekStart(today);
  const data = await within(loadCalendarRange(monday, addDays(monday, 4), today), 3000);
  if (!data || data.failed) return null;
  const context = data.items.length ? (await within(loadReportContext(readTickers(data.items, today, null), today), 2000)) ?? {} : {};
  const read = buildCalendarRead({ items: data.items, today, period: "this week", mine: null, context });
  return readCard("calendar", "Calendar", "/calendar", read, { day: `Week of ${ogDayLabel(monday)}` });
}

async function screenerCard(): Promise<OgCard | null> {
  const snapshot = await within(getScreenerSnapshot(), 3000);
  if (!snapshot) return null;
  // Anonymous viewer: zones are stripped first, as the page does for stocks a viewer does not cover.
  const rows = snapshot.rows.map(withoutZones);
  const read = buildScreenerRead({
    matched: rows,
    universe: rows,
    narrowed: false,
    priceDay: snapshot.meta.price_history_to ?? null,
    spy: snapshot.extras.find((row) => row.symbol === "SPY") ?? null,
    asOf: snapshot.meta.generated_at,
  });
  return readCard("screener", "Screener", "/screener", read, {
    footnote: ogFootnote(`${snapshot.rows.length} US stocks`, `as of ${ogStamp(snapshot.meta.generated_at)}`),
  });
}

async function followCard(): Promise<OgCard | null> {
  const read = await within(getFollowRead([]), 4000);
  return readCard("follow", "Follow", "/follow", read, { footnote: read?.source ?? null });
}

async function insidersCard(): Promise<OgCard | null> {
  const [buys, recent, sectors] = await Promise.all([within(getInsiderBuys(500), 3000), within(getInsiderTrades(900), 3000), within(getSectorMap(), 2000)]);
  if (!buys || !recent || !sectors) return null;
  const read = buildInsiderRead({ buys, recent, sectors, today: new Date().toISOString().slice(0, 10) });
  return readCard("insiders", "Insiders", "/insiders", read, { footnote: "SEC Form 4" });
}

async function filingsCard(): Promise<OgCard | null> {
  const [stream, trades, buys, meta] = await Promise.all([
    within(getFilingsStream(), 3000),
    within(getInsiderTrades(1500), 3000),
    within(getInsiderBuys(400), 3000),
    within(getFilingsMeta(), 1500),
  ]);
  const read = buildFilingsRead({ stream: stream ?? [], trades: trades ?? [], buys: buys ?? [], mine: null, now: Date.now(), asOf: meta?.updatedAt ?? null });
  return readCard("filings", "Filings", "/filings", read, { footnote: ogFootnote("SEC EDGAR", meta?.updatedAt ? `as of ${ogStamp(meta.updatedAt)}` : null) });
}

async function strategiesCard(): Promise<OgCard | null> {
  const items = await within(listStrategies(), 3000);
  if (!items || items.length === 0) return null;
  const read = buildStrategiesRead(items, { seesHoldings: can("strategy_holdings", "anon") });
  const through = items.map((item) => item.backtest?.period.end).filter((day): day is string => Boolean(day)).sort().pop() ?? null;
  return readCard("strategies", "Strategies", "/strategies", read, {
    footnote: ogFootnote("Backtested, hypothetical, against the S&P 500", through ? `through ${ogDayLabel(through)}` : null),
  });
}

async function themesCard(): Promise<OgCard | null> {
  const data = await within(getBaskets(), 3000);
  if (!data || data.baskets.length === 0) return null;
  const read = buildThemesRead(data.baskets);
  return readCard("themes", "Themes", "/themes", read, {
    footnote: ogFootnote(read.source ?? null, data.asOf ? `as of ${ogStamp(data.asOf)}` : null),
  });
}

/* ── markets: a class and an asset ──────────────────────────────────────── */

export async function marketClassCard(slug: string): Promise<OgCard | null> {
  const info = classInfoBySlug(slug);
  if (!info) return null;
  const data = await within(getMarketsData(), 3000);
  if (!data) return null;
  if (!info.assetClass) {
    const markets = data.predictions.slice(0, 3);
    if (markets.length === 0) return null;
    return {
      kind: "list",
      eyebrow: ogEyebrow("Markets", info.title),
      path: `/markets/${info.slug}`,
      headline: "What traders are pricing in, in odds",
      rows: markets.map((market) => {
        const top = [...market.outcomes].sort((a, b) => b.probability - a.probability)[0];
        return {
          label: top ? formatProbability(top.probability) : "",
          value: null,
          tone: "flat" as const,
          note: top && market.kind !== "binary" ? `${market.question} ${top.label}` : market.question,
        };
      }),
      footnote: ogFootnote(data.as_of ? `as of ${ogStamp(data.as_of)}` : null),
    };
  }
  const assets = data.assets.filter((asset) => asset.class === info.assetClass && finite(asset.change.d1));
  if (assets.length === 0) return null;
  const ranked = [...assets].sort((a, b) => Math.abs(b.change.d1!) - Math.abs(a.change.d1!));
  const top = ranked[0]!;
  const topChange = formatChange(top.change.d1, top.change_mode);
  const up = assets.filter((asset) => asset.change.d1! > 0).length;
  return {
    kind: "list",
    eyebrow: ogEyebrow("Markets", info.title),
    path: `/markets/${info.slug}`,
    headline: `${top.name} moved most${topChange ? `, ${topChange}` : ""}; ${up} of ${assets.length} ${/[A-Z].*[A-Z]/.test(info.title) ? info.title : info.title.toLowerCase()} rose`,
    rows: ranked.slice(0, 3).map((asset) => ({
      label: asset.symbol.length <= 7 ? asset.symbol : asset.symbol.slice(0, 7),
      value: formatChange(asset.change.d1, asset.change_mode),
      tone: ogTone(asset.change.d1),
      note: `${asset.name} at ${formatLevel(asset.price, asset.unit)}`,
    })),
    footnote: ogFootnote(data.as_of ? `as of ${ogStamp(data.as_of)}` : null),
  };
}

export async function marketAssetCard(slug: string, id: string): Promise<OgCard | null> {
  const info = classInfoBySlug(slug);
  if (!info) return null;
  const data = await within(getMarketsData(), 3000);
  if (!data) return null;
  const wanted = id.toLowerCase();
  if (!info.assetClass) {
    const market = data.predictions.find((item) => item.id === wanted);
    if (!market) return null;
    const outcomes = [...market.outcomes].sort((a, b) => b.probability - a.probability).slice(0, 3);
    return {
      kind: "text",
      eyebrow: ogEyebrow("Odds", market.source_name),
      path: `/markets/predictions/${market.id}`,
      title: market.question,
      sub: null,
      stats: outcomes.map((outcome) => ({ label: outcome.label, value: formatProbability(outcome.probability) })),
      footnote: ogFootnote(market.source_name, `as of ${ogStamp(market.as_of)}`),
    };
  }
  const asset = data.assets.find((item) => item.id === wanted || item.symbol.toLowerCase() === wanted);
  if (!asset) return null;
  const spark = asset.spark?.length > 1 ? ogThin(asset.spark, 120) : null;
  const yearPct = asset.change_mode === "pct" && finite(asset.change.y1) ? asset.change.y1 : null;
  const dayPct = finite(asset.change.d1) ? asset.change.d1 : null;
  return {
    kind: "quote",
    eyebrow: ogEyebrow("Markets", classInfoFor(asset.class).title),
    path: `/markets/${classInfoFor(asset.class).slug}/${asset.id}`,
    symbol: asset.symbol,
    name: asset.name,
    logo: null,
    showLogo: false,
    headline: assetReading(asset),
    call: null,
    note: null,
    quote: {
      level: formatLevel(asset.price, asset.unit),
      change: formatChange(asset.change.d1, asset.change_mode),
      dayPct,
      changeLabel: "1 day",
      spark,
      sparkLabel: spark ? "1 year" : null,
      sparkPct: yearPct,
    },
    footnote: ogFootnote(asset.source_name, `as of ${ogStamp(asset.as_of)}`),
  };
}

/* ── follow: a fund or a lawmaker ───────────────────────────────────────── */

function recordRows(perf: FundProfile["performance"], label: string): OgRecordCard["record"] {
  if (!perf) return null;
  const mine = perf.fund.r_since;
  const bench = perf.spy.r_since;
  if (!finite(mine) || !finite(bench)) return null;
  const since = ogMonthLabel(perf.start_date);
  return {
    title: label,
    rows: [
      { label: "Following the filings", value: ogSignedPct(mine * 100, 0)!, tone: ogTone(mine), big: true },
      { label: "S&P 500", value: ogSignedPct(bench * 100, 0)!, tone: ogTone(bench) },
    ],
    spark: perf.spark && perf.spark.length > 1 ? perf.spark : null,
    benchmark: perf.spark_spy && perf.spark_spy.length > 1 ? perf.spark_spy : null,
    sparkTone: "flat",
    period: ogFootnote(since ? `Since ${since}` : null, "bought on each filing date", perf.end_date ? `to ${ogDayLabel(perf.end_date)}` : null),
  };
}

export async function followProfileCard(slug: string): Promise<OgCard | null> {
  const profile = await within(getFollowProfile(slug), 3500);
  if (!profile) return null;
  if (profile.kind === "fund") return fundCard(profile);
  return congressCard(profile);
}

function fundCard(profile: FundProfile): OgCard {
  const read = buildFundRead(profile);
  const chips = profile.portfolio
    .filter((position) => position.ticker)
    .slice(0, 5)
    .map((position) => `${position.ticker} ${fmtWeight(position.weight)}`.trim());
  return {
    kind: "record",
    eyebrow: ogEyebrow("13F", quarterLabel(profile.latest.period)),
    path: `/follow/${profile.slug}`,
    title: profile.fund,
    subtitle: profile.manager,
    headline: read.headline || null,
    chips,
    chipsLabel: chips.length ? `Top holdings, ${quarterLabel(profile.latest.period)}` : null,
    record: recordRows(profile.performance, "Record vs the S&P 500"),
    footnote: ogFootnote(`13F filed ${ogDayLabel(profile.latest.filed_at)}`, "SEC EDGAR"),
  };
}

/** Without a priced record, the reported trades themselves. */
function tradeTally(profile: CongressProfile): OgRecordCard["record"] {
  const { buys, sells, median_lag_days: lag } = profile.stats;
  if (!finite(buys) || !finite(sells) || buys + sells === 0) return null;
  const rows: NonNullable<OgRecordCard["record"]>["rows"] = [
    { label: "Buys", value: String(buys), big: true },
    { label: "Sales", value: String(sells), big: true },
  ];
  if (finite(lag)) rows.push({ label: "Median days to report", value: String(Math.round(lag)) });
  return { title: "Reported trades", rows, spark: null, benchmark: null, sparkTone: "flat", period: profile.first_report ? `Since ${ogDayLabel(profile.first_report)}` : null };
}

function congressCard(profile: CongressProfile): OgCard {
  const read = buildCongressMemberRead(profile);
  const chips = profile.stats.top_bought
    .filter((chip) => chip.ticker)
    .slice(0, 5)
    .map((chip) => chip.ticker!);
  const seat = [profile.party, profile.state].filter(Boolean).join("-");
  return {
    kind: "record",
    eyebrow: ogEyebrow("Congress", ogDayLabel(profile.latest_date)),
    path: `/follow/${profile.slug}`,
    title: profile.name,
    subtitle: ogFootnote(seat || null, `${profile.stats.trades} reported trades`),
    headline: read.headline || null,
    chips,
    chipsLabel: chips.length ? "Most bought" : null,
    record: recordRows(profile.performance, "Record vs the S&P 500") ?? tradeTally(profile),
    footnote: ogFootnote(`Latest report ${ogDayLabel(profile.latest_date)}`, "House Clerk"),
  };
}

/* ── strategies ─────────────────────────────────────────────────────────── */

export async function strategyCard(slug: string): Promise<OgCard | null> {
  const strategy = await within(getStrategy(slug), 3000);
  if (!strategy) return null;
  const test = strategy.backtest;
  const live = strategy.live;
  const rows: NonNullable<OgRecordCard["record"]>["rows"] = [];
  let period: string | null = null;
  if (test) {
    const perYear = test.strategy.annualized_return !== null && test.benchmark.annualized_return !== null;
    const mine = perYear ? test.strategy.annualized_return! : test.strategy.total_return;
    const bench = perYear ? test.benchmark.annualized_return! : test.benchmark.total_return;
    rows.push({ label: perYear ? "Backtest, a year" : "Backtest", value: ogSignedPct(mine * 100)!, tone: ogTone(mine), big: true });
    rows.push({ label: perYear ? "S&P 500, a year" : "S&P 500", value: ogSignedPct(bench * 100)!, tone: ogTone(bench) });
    period = `Backtest ${ogMonthLabel(test.period.start)} to ${ogMonthLabel(test.period.end)}, hypothetical`;
  }
  if (live.sessions > 0 && finite(live.strategy_return)) {
    rows.push({ label: `Live since ${ogDayLabel(live.since)}`, value: ogSignedPct(live.strategy_return * 100)!, tone: ogTone(live.strategy_return) });
    period = ogFootnote(period, finite(live.benchmark_return) ? `live S&P 500 ${ogSignedPct(live.benchmark_return * 100)}` : null);
  }
  const seesHoldings = can("strategy_holdings", "anon");
  const holdings = strategy.basket.holdings;
  const chips = seesHoldings
    ? holdings.slice(0, 5).map((holding) => holding.symbol)
    : [...new Set(holdings.map((holding) => holding.sector).filter((sector): sector is string => Boolean(sector)))].slice(0, 4);
  return {
    kind: "record",
    eyebrow: ogEyebrow("Strategy", strategy.rebalance),
    path: `/strategies/${strategy.slug}`,
    title: strategy.name,
    subtitle: ogFootnote(strategy.universe.label, strategy.risk.label),
    // The tagline is the rule in one sentence; the full rules are long lists.
    headline: strategy.tagline || strategy.rules[0] || strategy.summary,
    chips,
    chipsLabel: chips.length ? (seesHoldings ? `Holds today, ${ogDayLabel(strategy.basket.as_of)}` : "Sectors it holds today") : null,
    record: rows.length
      ? {
          title: test && live.sessions > 0 ? "Backtested vs live" : test ? "Backtest vs the S&P 500" : "Live record",
          rows,
          spark: test?.spark.strategy && test.spark.strategy.length > 1 ? test.spark.strategy : null,
          benchmark: test?.spark.benchmark && test.spark.benchmark.length > 1 ? test.spark.benchmark : null,
          sparkTone: "flat",
          period,
        }
      : null,
    footnote: ogFootnote(`Prices ${ogDayLabel(strategy.price_as_of)}`, "past results, not a forecast"),
  };
}

/* ── themes ─────────────────────────────────────────────────────────────── */

export async function themeCard(slug: string): Promise<OgCard | null> {
  const basket = await within(getBasket(slug), 3000);
  if (!basket) return null;
  const read = buildThemeRead({ ...basket, lines: basket.lines.map((line) => (line.row ? { ...line, row: withoutZones(line.row) } : line)) });
  const rows: NonNullable<OgRecordCard["record"]>["rows"] = [];
  const month = basket.perf.ret_1m;
  const ytd = basket.perf.ret_ytd;
  if (ytd) rows.push({ label: "Basket, this year", value: ogSignedPct(ytd.pct)!, tone: ogTone(ytd.pct), big: true });
  if (finite(basket.benchmark.ret_ytd)) rows.push({ label: "S&P 500, this year", value: ogSignedPct(basket.benchmark.ret_ytd)!, tone: ogTone(basket.benchmark.ret_ytd) });
  if (month) rows.push({ label: "Basket, 1 month", value: ogSignedPct(month.pct)!, tone: ogTone(month.pct) });
  return {
    kind: "record",
    eyebrow: ogEyebrow("Theme", `${basket.size} stocks`),
    path: `/themes/${basket.slug}`,
    title: basket.name,
    subtitle: null,
    headline: read.insights[0]?.text ?? basket.thesis,
    chips: basket.lead.slice(0, 6).map((line) => line.ticker),
    chipsLabel: "In the basket",
    record: rows.length
      ? { title: "Equal-weight basket vs SPY", rows, spark: null, benchmark: null, sparkTone: "flat", period: "Hypothetical equal-weight basket, before costs" }
      : null,
    footnote: ogFootnote(basket.asOf ? `Prices ${ogStamp(basket.asOf)}` : null),
  };
}

/* ── words-only pages ───────────────────────────────────────────────────── */

const TEXT_PAGES: Record<string, { eyebrow: string; title: string; sub: string; path: string }> = {
  agents: {
    eyebrow: "Agents",
    title: "Agents that watch your stocks while you get on with your day",
    sub: "Standing jobs on a schedule, a new filing, an insider trade or a price. Every run ends in a decision, including do nothing.",
    path: "/agents",
  },
  developers: {
    eyebrow: "Developers",
    title: "Stock research your own tools can call",
    sub: "A REST API, an MCP server and a CLI over the same calls, prices and filings the site shows.",
    path: "/developers",
  },
  backtest: {
    eyebrow: "Backtest",
    title: "Test a portfolio idea against the S&P 500",
    sub: "Pick stocks or funds, a rebalance and a period. Results are hypothetical and labelled with their biases.",
    path: "/backtest",
  },
  practice: {
    eyebrow: "Practice",
    title: "$100,000 of practice money to try an idea",
    sub: "A paper account priced from real closes. No broker, no real money.",
    path: "/practice",
  },
  ask: {
    eyebrow: "Ask",
    title: "Ask about any US stock, get an answer with its sources",
    sub: "Every number in the answer links to where it came from.",
    path: "/ask",
  },
  compare: {
    eyebrow: "Compare",
    title: "Two to four stocks, side by side",
    sub: "Returns, valuation, growth, margins and our call on each, with the best value in each row marked.",
    path: "/compare",
  },
  about: {
    eyebrow: "About",
    title: "Why stocksbrew exists",
    sub: "An investing agent that reads the filings, earnings and news for you. It never touches your money.",
    path: "/about",
  },
  security: {
    eyebrow: "Security",
    title: "We never ask for your broker login",
    sub: "How your account and data are handled, and what we will not do.",
    path: "/security",
  },
  blog: {
    eyebrow: "Blog",
    title: "Notes on reading stocks well",
    sub: "Guides to earnings, filings and valuation, written for people who follow stocks but do not work at a trading desk.",
    path: "/blog",
  },
};

function textPage(key: string): OgTextCard | null {
  const page = TEXT_PAGES[key];
  if (!page) return null;
  return { kind: "text", eyebrow: page.eyebrow, path: page.path, title: page.title, sub: page.sub, footnote: null };
}

function pricingCard(): OgTextCard {
  return {
    kind: "text",
    eyebrow: "Pricing",
    path: "/pricing",
    title: "Reading is free. The agent working for you is Pro.",
    sub: "Every stock report, call and filing is free to read. Pro covers every stock with price zones, alerts and the briefing.",
    stats: [
      { label: "Free", value: "$0", sub: `${FREE_COVERED_STOCKS} covered stocks` },
      { label: "Pro monthly", value: `$${US_PRO_MONTHLY}`, sub: "a month" },
      { label: "Pro yearly", value: `$${US_PRO_YEARLY}`, sub: "a year" },
    ],
    footnote: "No card to start · cancel any time",
  };
}

function glossaryCard(): OgTextCard {
  return {
    kind: "text",
    eyebrow: "Docs · Glossary",
    path: "/docs/glossary",
    title: "The words stocksbrew uses, in plain English",
    sub: "13F, Form 4, drawdown, Sharpe ratio, survivorship bias, add zone and the rest, each in a sentence or two.",
    chips: [`${GLOSSARY.length} terms`],
    footnote: null,
  };
}

function toolsCard(): OgTextCard {
  return {
    kind: "text",
    eyebrow: "Docs · Compare",
    path: "/docs/compare",
    title: "stocksbrew next to the other research tools",
    sub: "What each tool is built for, and where the other one is stronger.",
    chips: [`${DOC_COMPARISONS.length} comparisons`],
    footnote: null,
  };
}

function docsIndexCard(): OgTextCard {
  return {
    kind: "text",
    eyebrow: "Docs",
    path: "/docs",
    title: "How stocksbrew works, and how to read what it shows",
    sub: "The course and the reference: each surface, the methodology behind the calls, and a glossary in plain words.",
    chips: [`${GUIDES.length} guides`, `${SECTIONS.length} sections`],
    footnote: null,
  };
}

export function docsSectionCard(sectionId: string): OgTextCard | null {
  const section = getSection(sectionId);
  if (!section) return null;
  const guides = guidesIn(section.id);
  return {
    kind: "text",
    eyebrow: "Docs",
    path: `/docs/${section.id}`,
    title: section.title,
    sub: section.blurb,
    chips: [`${guides.length} guides`],
    footnote: null,
  };
}

export function docsGuideCard(sectionId: string, slug: string): OgTextCard | null {
  const guide = getGuide(sectionId, slug);
  if (!guide) return null;
  const section = getSection(guide.section);
  return {
    kind: "text",
    eyebrow: ogEyebrow("Docs", section?.title ?? null),
    path: `/docs/${guide.section}/${guide.slug}`,
    title: guide.title,
    sub: guide.summary,
    chips: [`${readingMinutes(guide)} min read`],
    footnote: guide.updated ? `Updated ${ogDayLabel(guide.updated)}` : null,
  };
}

export function blogPostCard(slug: string): OgTextCard | null {
  const post = allBlogPosts.find((item) => item.slug === slug);
  if (!post) return null;
  return {
    kind: "text",
    eyebrow: ogEyebrow("Blog", post.category),
    path: `/blog/${post.slug}`,
    title: post.title,
    sub: post.description,
    chips: [post.readTime].filter(Boolean),
    footnote: ogFootnote(post.updated ? `Updated ${ogDayLabel(post.updated)}` : `Published ${ogDayLabel(post.date)}`),
  };
}

/* ── page keys ──────────────────────────────────────────────────────────── */

const PAGE_LOADERS: Partial<Record<OgPageKey, () => Promise<OgCard | null>>> = {
  briefing: briefingCard,
  explore: exploreCard,
  news: newsCard,
  markets: marketsCard,
  signals: signalsCard,
  calendar: calendarCard,
  screener: screenerCard,
  follow: followCard,
  insiders: insidersCard,
  filings: filingsCard,
  strategies: strategiesCard,
  themes: themesCard,
};

/** Words for a data page whose read is not available right now. */
const PAGE_FALLBACK: Partial<Record<OgPageKey, { eyebrow: string; title: string; sub: string }>> = {
  briefing: { eyebrow: "Briefing", title: "What moved today, and why", sub: "How the market closed, the biggest movers with the reason when we could confirm one, and what to check next." },
  explore: { eyebrow: "Explore", title: "The research desk for US stocks", sub: "News, movers, the calendar, signals, themes and markets, each with what it means." },
  news: { eyebrow: "The wire", title: "US stock news, read by company", sub: "Headlines as a dense, time-ordered wire, with what each story means for the stock." },
  markets: { eyebrow: "Markets", title: "Indices, rates, commodities, FX and crypto", sub: "Every asset with its level, its changes and a year of daily closes." },
  signals: { eyebrow: "Signals", title: "Unusual movers, Reddit and policy posts", sub: "What moved against its normal range, what the crowd is saying, and what the President posted." },
  calendar: { eyebrow: "Calendar", title: "Earnings, IPOs and economic events in one agenda", sub: "Week, month and list views, with how each stock has reacted to past reports." },
  screener: { eyebrow: "Screener", title: "Screen US stocks by what matters to you", sub: "Returns, valuation, growth, margins and our call, with the sector heat map." },
  follow: { eyebrow: "Follow", title: "What funds, lawmakers and insiders just filed", sub: "13F holdings, House trade reports and Form 4 buys, with each record measured from the filing date." },
  insiders: { eyebrow: "Insiders", title: "Insider buying and selling, from SEC Form 4", sub: "Who bought their own company's stock, how big it was, and how it compares with normal." },
  filings: { eyebrow: "Filings", title: "SEC filings in plain words", sub: "New 8-K, 10-Q and 10-K filings as they land, attached to the stocks they are about." },
  strategies: { eyebrow: "Strategies", title: "Rule-based strategies with honest records", sub: "The rules in plain words, a labelled backtest against the S&P 500 and a separate live record." },
  themes: { eyebrow: "Themes", title: "Idea baskets with a reason for every stock", sub: "Each line says what the company does, why it fits and what would break the idea." },
};

export async function pageCard(key: OgPageKey): Promise<OgCard> {
  const loader = PAGE_LOADERS[key];
  if (loader) {
    const card = await loader().catch((error) => {
      console.error(`og: ${key} card failed`, error);
      return null;
    });
    if (card) return card;
  }
  if (key === "pricing") return pricingCard();
  if (key === "docs") return docsIndexCard();
  if (key === "glossary") return glossaryCard();
  if (key === "tools") return toolsCard();
  const text = textPage(key);
  if (text) return text;
  const fallback = PAGE_FALLBACK[key];
  if (fallback) return { kind: "text", eyebrow: fallback.eyebrow, path: `/${key}`, title: fallback.title, sub: fallback.sub, footnote: null };
  return { kind: "landing", eyebrow: null, headline: HERO_HEADLINE, sub: HERO_SUBHEAD, row: null, footnote: "Free to read every stock" };
}

/** The card for a stock, compare or other lookup that found nothing: the words-only home card. */
export function notFoundCard(): OgCard {
  return { kind: "landing", eyebrow: null, headline: HERO_HEADLINE, sub: HERO_SUBHEAD, row: null, footnote: "Free to read every stock" };
}

/**
 * One human line for a stock page's share description: our call and why,
 * level-free. Null when the stock has no call or the snapshot is slow, and the
 * page keeps its usual description.
 */
export async function stockShareLine(symbol: string): Promise<string | null> {
  const rows = await within(getScreenerRows([symbol]), 800);
  const row = rows?.get(symbol.toUpperCase()) ?? null;
  const call = asCall(row?.call);
  if (!row || !call) return null;
  const note = callNote(row);
  return `Our call on ${row.symbol}: ${call}.${note ? ` ${note}` : ""}`;
}

/** /docs/compare/<slug>: a tool comparison, words only. */
export function versusCard(slug: string): OgTextCard | null {
  const page = getDocComparison(slug);
  if (!page) return null;
  return { kind: "text", eyebrow: "Docs · Compare", path: docCompareHref(page.slug), title: page.title, sub: page.description, footnote: null };
}

/** /legal/<slug>. */
export function legalCard(slug: string): OgTextCard | null {
  const doc = getLegalDoc(slug);
  if (!doc) return null;
  return { kind: "text", eyebrow: "Legal", path: `/legal/${doc.slug}`, title: doc.title, sub: doc.description, footnote: doc.updated ? `Updated ${ogDayLabel(doc.updated)}` : null };
}
