/**
 * The read at the top of /markets: what the cross-asset numbers add up to,
 * built with plain rules from the stored assets (no model writes a number).
 *
 * Stocks, funds and their holdings all come from the same US session close,
 * so the day's story is told with funds (USO for oil, TLT for long bonds)
 * rather than with futures that already trade in the next session.
 */
import type { Insight, TheRead } from "@/lib/insights";
import { pickInsights } from "@/lib/insights";
import { assetHref, type MarketAsset, type MarketsData, type PredictionMarket } from "@/lib/markets-shared";
import { absPct, cap, isNum, listNames, pts, sessionName, signedPct } from "@/lib/read-format";

/** The eleven S&P 500 sector funds (SMH is a sub-industry, counted with the themes). */
export const SECTOR_IDS = ["xlk", "xlf", "xle", "xlv", "xli", "xly", "xlp", "xlu", "xlb", "xlre", "xlc"];

/** What a fund stands for, in the words a reader would use. */
export const FUND_TOPIC: Record<string, string> = {
  xlk: "Tech",
  xlf: "Financials",
  xle: "Energy",
  xlv: "Health care",
  xli: "Industrials",
  xly: "Consumer discretionary",
  xlp: "Consumer staples",
  xlu: "Utilities",
  xlb: "Materials",
  xlre: "Real estate",
  xlc: "Communication services",
  smh: "Chips",
  soxx: "Chips",
  arkk: "Innovation stocks",
  igv: "Software",
  botz: "Robotics",
  cibr: "Cybersecurity",
  xbi: "Biotech",
  kre: "Regional banks",
  ita: "Defense",
  xhb: "Homebuilders",
  jets: "Airlines",
  ura: "Uranium",
  tan: "Solar",
  gdx: "Gold miners",
  kweb: "China internet",
  vnq: "Real estate",
  ibit: "Bitcoin",
  uso: "Oil",
  gld: "Gold",
  slv: "Silver",
  tlt: "Long Treasuries",
  ief: "Mid Treasuries",
  hyg: "High-yield bonds",
  lqd: "Corporate bonds",
  eem: "Emerging markets",
  efa: "Developed markets abroad",
};

/** Below this the day is not a story, either way. */
const DAY_MOVE = 0.5;

function d1(asset: MarketAsset | undefined): number | null {
  return asset && isNum(asset.change.d1) ? asset.change.d1 : null;
}

function topic(asset: MarketAsset): string {
  return FUND_TOPIC[asset.id] ?? asset.name;
}

/** US-listed holdings only ("BRK-B" becomes "BRK.B"); foreign lines like "ASML.AS" are skipped. */
export function usHoldings(asset: MarketAsset | undefined, max = 3): string[] {
  if (!asset) return [];
  return asset.holdings
    .map((holding) => holding.symbol ?? "")
    .filter((symbol) => /^[A-Z]{1,5}(-[A-Z])?$/.test(symbol))
    .map((symbol) => symbol.replace("-", "."))
    .slice(0, max);
}

export type MarketRegime = "risk-on" | "risk-off" | "mixed";

export type SectorBreadth = { up: number; down: number; total: number; best: MarketAsset | null; worst: MarketAsset | null };

export function sectorBreadth(assets: MarketAsset[]): SectorBreadth {
  const sectors = SECTOR_IDS.map((id) => assets.find((asset) => asset.id === id)).filter(
    (asset): asset is MarketAsset => Boolean(asset) && isNum(asset!.change.d1),
  );
  const sorted = [...sectors].sort((a, b) => (b.change.d1 ?? 0) - (a.change.d1 ?? 0) || a.id.localeCompare(b.id));
  return {
    up: sectors.filter((asset) => (asset.change.d1 ?? 0) > 0).length,
    down: sectors.filter((asset) => (asset.change.d1 ?? 0) < 0).length,
    total: sectors.length,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  };
}

/** Risk-on when the S&P 500 rose at least half a percent with at least 8 of 11 sectors up; risk-off the mirror image. */
export function marketRegime(spxDay: number | null, breadth: SectorBreadth): MarketRegime {
  if (spxDay === null || breadth.total < 6) return "mixed";
  const wide = Math.ceil(breadth.total * 0.7);
  if (spxDay >= DAY_MOVE && breadth.up >= wide) return "risk-on";
  if (spxDay <= -DAY_MOVE && breadth.down >= wide) return "risk-off";
  return "mixed";
}

/**
 * The fund that went hardest against the day: falling when stocks rose, or
 * rising when they fell. Funds only, so it is the same session as stocks.
 */
export function outlier(assets: MarketAsset[], spxDay: number): MarketAsset | null {
  const against = assets
    .filter((asset) => asset.class === "etf" && asset.group !== "broad" && asset.group !== "sector" && isNum(asset.change.d1))
    .filter((asset) => Math.sign(asset.change.d1!) === -Math.sign(spxDay) && Math.abs(asset.change.d1!) >= 1)
    .sort((a, b) => Math.abs(b.change.d1!) - Math.abs(a.change.d1!) || a.id.localeCompare(b.id));
  return against[0] ?? null;
}

function leaderInsight(assets: MarketAsset[], spxDay: number, regime: MarketRegime): Insight | null {
  // The fund that led in the direction of the day, among sectors and themes.
  const pool = assets.filter((asset) => asset.class === "etf" && (asset.group === "sector" || asset.group === "thematic") && isNum(asset.change.d1));
  if (pool.length < 4) return null;
  const sign = regime === "risk-off" ? -1 : spxDay >= 0 ? 1 : -1;
  const leader = [...pool].sort((a, b) => sign * ((b.change.d1 ?? 0) - (a.change.d1 ?? 0)) || a.id.localeCompare(b.id))[0]!;
  const move = leader.change.d1!;
  const gap = move - spxDay;
  if (Math.abs(gap) < 1) return null;
  const tickers = usHoldings(leader);
  const month = leader.change.m1;
  const reversal = isNum(month) && Math.abs(month) >= 5 && Math.sign(month) !== Math.sign(move);
  return {
    id: "leader",
    tone: move > 0 ? "up" : "down",
    // "Better" or "worse" than the index: "1.9 pts less" read as the wrong way round on a fall.
    text: `${topic(leader)} ${move > 0 ? "led" : "fell hardest"}: ${leader.symbol} ${move > 0 ? "rose" : "fell"} ${absPct(move, 2)}, ${Math.abs(gap).toFixed(1)} points ${gap > 0 ? "better" : "worse"} than the S&P 500.`,
    soWhat: reversal
      ? `It is still ${month! < 0 ? "down" : "up"} ${absPct(month!)} over the month, so this is a bounce, not a trend yet.`
      : tickers.length
        ? `Its biggest holdings are ${listNames(tickers)}.`
        : undefined,
    tickers,
    action: { label: `Open ${leader.symbol}`, href: assetHref(leader) },
  };
}

function sizeInsight(byId: Map<string, MarketAsset>): Insight | null {
  const small = d1(byId.get("iwm"));
  const large = d1(byId.get("spy"));
  if (small === null || large === null) return null;
  const gap = small - large;
  if (Math.abs(gap) < 0.5) return null;
  const smallWon = gap > 0;
  const equal = d1(byId.get("rsp"));
  const breadth =
    equal !== null && Math.abs(equal - large) >= 0.3
      ? ` The equal-weight S&P 500 ${equal > large ? "beat" : "trailed"} the cap-weighted one by ${pts(Math.abs(equal - large))}, so ${equal > large ? "the average stock did better than the giants" : "the giants did the lifting"}.`
      : "";
  return {
    id: "size",
    tone: smallWon ? "up" : "flat",
    text: `Small caps ${smallWon ? "beat" : "trailed"} large caps by ${pts(Math.abs(gap))}: the Russell 2000 fund ${small >= 0 ? "rose" : "fell"} ${absPct(small, 2)}, the S&P 500 fund ${large >= 0 ? "rose" : "fell"} ${absPct(large, 2)}.${breadth}`,
    action: { label: "Compare indices", href: "/markets/indices" },
  };
}

function ratesInsight(byId: Map<string, MarketAsset>): Insight | null {
  const ten = byId.get("us10y");
  if (!ten || !isNum(ten.change.d1)) return null;
  const day = Math.round(ten.change.d1);
  const month = isNum(ten.change.m1) ? Math.round(ten.change.m1) : null;
  if (Math.abs(day) < 4 && (month === null || Math.abs(month) < 20)) return null;
  const dayText = day === 0 ? `The 10-year yield held at ${ten.price.toFixed(2)}%` : `The 10-year yield ${day > 0 ? "rose" : "fell"} ${Math.abs(day)} bp to ${ten.price.toFixed(2)}%`;
  const monthText = month !== null && Math.abs(month) >= 10 ? `, ${Math.abs(month)} bp ${month > 0 ? "above" : "below"} a month ago` : "";
  // Falling yields lower the rate future profits are discounted at: good for stocks, best for long-duration growth names.
  const tone = month !== null && Math.abs(month) >= 20 ? (month < 0 ? "up" : "down") : day < 0 ? "up" : day > 0 ? "down" : "flat";
  return {
    id: "rates",
    tone,
    text: `${dayText}${monthText}.`,
    soWhat: tone === "up" ? "Lower yields help growth stocks and homebuilders most." : tone === "down" ? "Higher yields weigh most on growth stocks and homebuilders." : undefined,
    action: { label: "Open rates", href: "/markets/rates" },
  };
}

function outlierInsight(assets: MarketAsset[], byId: Map<string, MarketAsset>, spxDay: number): Insight | null {
  const odd = outlier(assets, spxDay);
  if (!odd) return null;
  const move = odd.change.d1!;
  const week = odd.change.w1;
  const weekText = isNum(week) && Math.abs(week) >= 3 && Math.sign(week) === Math.sign(move) ? `, and it is ${week < 0 ? "down" : "up"} ${absPct(week)} over the week` : "";
  // Oil drags energy stocks with it: name the ones it touches.
  const energy = odd.id === "uso" ? byId.get("xle") : undefined;
  const energyDay = d1(energy);
  const tickers = energy ? usHoldings(energy) : [];
  return {
    id: "outlier",
    tone: move > 0 ? "up" : "down",
    text: `${topic(odd)} went the other way: ${odd.symbol} ${move > 0 ? "rose" : "fell"} ${absPct(move)} while stocks ${spxDay > 0 ? "rallied" : "fell"}${weekText}.`,
    soWhat:
      energy && energyDay !== null && energyDay < spxDay ? `Energy stocks lagged the market at ${signedPct(energyDay, 2)}.` : undefined,
    tickers,
    action: { label: `Open ${odd.symbol}`, href: assetHref(odd) },
  };
}

function volInsight(byId: Map<string, MarketAsset>, regime: MarketRegime): Insight | null {
  const vix = byId.get("vix");
  if (!vix || !isNum(vix.change.m1) || Math.abs(vix.change.m1) < 20) return null;
  const month = vix.change.m1;
  const daily = vix.price / Math.sqrt(252);
  const despite = regime === "risk-on" && month > 0 ? " even after the rally" : "";
  return {
    id: "vix",
    tone: month > 0 ? "down" : "up",
    text: `The VIX is ${vix.price.toFixed(1)}, ${absPct(month, 0)} ${month > 0 ? "higher" : "lower"} than a month ago${despite}.`,
    soWhat: `Options price S&P 500 swings of about ${daily.toFixed(1)}% a day.`,
    action: { label: "Open VIX", href: assetHref(vix) },
  };
}

function fedInsight(predictions: PredictionMarket[]): Insight | null {
  const fed = predictions.find((market) => market.topic === "fed" && market.kind === "exclusive");
  if (!fed) return null;
  const top = [...fed.outcomes].sort((a, b) => b.probability - a.probability)[0];
  if (!top || !isNum(top.change_24h) || Math.abs(top.change_24h) < 0.05) return null;
  const change = Math.round(top.change_24h * 100);
  const hike = /hike|raise/i.test(top.label);
  const cut = /cut|lower/i.test(top.label);
  return {
    id: "fed",
    tone: hike ? "down" : cut ? "up" : "flat",
    text: `${fed.source_name} traders put ${Math.round(top.probability * 100)}% on "${top.label}" at the next Fed meeting, ${change > 0 ? "up" : "down"} ${Math.abs(change)} pts in a day.`,
    action: { label: "Open the odds", href: `/markets/predictions/${encodeURIComponent(fed.id)}` },
  };
}

/** The page's read. Null when there are no stock prices to read. */
export function buildMarketsRead(data: MarketsData, now: Date = new Date()): TheRead | null {
  const byId = new Map(data.assets.map((asset) => [asset.id, asset]));
  const spx = byId.get("sp500") ?? byId.get("spy");
  const spxDay = d1(spx);
  if (!spx || spxDay === null) return null;
  const breadth = sectorBreadth(data.assets);
  const regime = marketRegime(spxDay, breadth);
  const when = sessionName(spx.as_of, now);
  // Said the way a person would: "Most stocks fell today", not trader shorthand like "risk-off".
  // A small S&P move with every sector the same way is not "mixed".
  const label =
    regime === "risk-on"
      ? "Most stocks rose"
      : regime === "risk-off"
        ? "Most stocks fell"
        : breadth.total > 0 && breadth.up === breadth.total
          ? "Stocks edged up"
          : breadth.total > 0 && breadth.down === breadth.total
            ? "Stocks edged down"
            : "Stocks were mixed";
  const sectorsText =
    breadth.total > 0
      ? breadth.up === breadth.total
        ? `all ${breadth.total} sectors rose`
        : breadth.down === breadth.total
          ? `all ${breadth.total} sectors fell`
          : `${regime === "risk-off" ? "only " : ""}${breadth.up} of ${breadth.total} sectors rose`
      : null;
  const spxText = `the S&P 500 ${spxDay >= 0 ? "gained" : "lost"} ${absPct(spxDay, 2)}`;
  const odd = regime === "mixed" ? null : outlier(data.assets, spxDay);
  const oddText = odd ? ` ${topic(odd)}'s ${absPct(odd.change.d1!)} ${odd.change.d1! < 0 ? "drop" : "jump"} was the outlier.` : "";
  // Most sectors one way and the index the other is the story itself: say it straight, never "edged up" on a down day.
  // The same when most sectors went the other way: "mixed" hides that the index fell while most sectors rose.
  const against =
    breadth.total > 0 &&
    ((breadth.up > breadth.total / 2 && spxDay < 0) || (breadth.down > breadth.total / 2 && spxDay > 0));
  // Count the sectors that went the other way: "gained 0.4% even though 7 of 11 sectors fell".
  const againstText = spxDay >= 0 ? (breadth.down === breadth.total ? `all ${breadth.total} sectors fell` : `${breadth.down} of ${breadth.total} sectors fell`) : sectorsText;
  const headline = against
    ? `The S&P 500 ${spxDay >= 0 ? "gained" : "lost"} ${absPct(spxDay, 2)} ${when} even though ${againstText}.${oddText}`
    : `${label} ${when}: ${sectorsText ? `${sectorsText} and ${spxText}` : spxText}.${oddText}`;

  const insights = pickInsights([
    leaderInsight(data.assets, spxDay, regime),
    odd ? outlierInsight(data.assets, byId, spxDay) : null,
    sizeInsight(byId),
    ratesInsight(byId),
    volInsight(byId, regime),
    fedInsight(data.predictions),
  ]);

  return { headline: cap(headline), insights, asOf: spx.as_of };
}

/* ── one-line takeaways for the cards below the read ──────────────────── */

/** "9 of 11 sectors rose; Tech led at +3.73%, Energy trailed at +0.52%." */
export function sectorTakeaway(assets: MarketAsset[]): string | null {
  const breadth = sectorBreadth(assets);
  if (breadth.total < 4 || !breadth.best || !breadth.worst) return null;
  const head = breadth.up === breadth.total ? `All ${breadth.total} sectors rose` : breadth.down === breadth.total ? `All ${breadth.total} sectors fell` : `${breadth.up} of ${breadth.total} sectors rose`;
  return `${head}. ${topic(breadth.best)} led at ${signedPct(breadth.best.change.d1!, 2)}; ${topic(breadth.worst)} trailed at ${signedPct(breadth.worst.change.d1!, 2)}.`;
}

/** For a list of funds or assets: how many rose, and the best and worst. */
export function listTakeaway(assets: MarketAsset[], noun: string): string | null {
  const moved = assets.filter((asset) => isNum(asset.change.d1) && asset.change_mode === "pct");
  if (moved.length < 3) return null;
  const sorted = [...moved].sort((a, b) => b.change.d1! - a.change.d1! || a.id.localeCompare(b.id));
  const up = moved.filter((asset) => asset.change.d1! > 0).length;
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const name = (asset: MarketAsset) => FUND_TOPIC[asset.id] ?? asset.name;
  if (up === moved.length) return `All ${moved.length} ${noun} rose; ${name(best)} led at ${signedPct(best.change.d1!)}.`;
  if (up === 0) return `All ${moved.length} ${noun} fell; ${name(worst)} fell most at ${signedPct(worst.change.d1!)}.`;
  return `${up} of ${moved.length} ${noun} rose. ${name(best)} led at ${signedPct(best.change.d1!)}, ${name(worst)} trailed at ${signedPct(worst.change.d1!)}.`;
}

/** Of the biggest moves across markets, how many went up and which one led. */
export function moversTakeaway(movers: MarketAsset[]): string | null {
  if (movers.length < 3) return null;
  const up = movers.filter((asset) => (asset.change.d1 ?? 0) > 0).length;
  const top = movers[0]!;
  const lead = `${FUND_TOPIC[top.id] ?? top.name} moved most, ${signedPct(top.change.d1!)}.`;
  if (up === movers.length) return `All ${movers.length} of the biggest moves were gains. ${lead}`;
  if (up === 0) return `All ${movers.length} of the biggest moves were losses. ${lead}`;
  return `${up} of the ${movers.length} biggest moves were gains. ${lead}`;
}

/* ── the read for one class page (/markets/indices, /markets/crypto, ...) ── */

const CLASS_NOUN: Record<string, string> = { indices: "indices", etfs: "funds", commodities: "commodities", fx: "currencies", crypto: "coins", options: "volatility gauges" };

/** A move this far from the baseline is worth a line on a class page. */
const CLASS_GAP = 1;

function classMoverInsight(asset: MarketAsset, base: { name: string; day: number } | null, window: string): Insight | null {
  const move = asset.change.d1;
  if (!isNum(move)) return null;
  const gap = base ? move - base.day : move;
  if (Math.abs(gap) < CLASS_GAP) return null;
  const baseText = base ? `, ${pts(Math.abs(gap))} ${gap > 0 ? "better" : "worse"} than ${base.name} (${signedPct(base.day, 2)})` : "";
  const month = asset.change.m1;
  const holdings = asset.class === "etf" ? usHoldings(asset) : [];
  const monthText =
    isNum(month) && Math.abs(month) >= 5
      ? Math.sign(month) === Math.sign(move)
        ? `That extends a ${absPct(month)} ${month > 0 ? "gain" : "drop"} over the month.`
        : `It is still ${month > 0 ? "up" : "down"} ${absPct(month)} over the month.`
      : undefined;
  return {
    id: `mover-${asset.id}`,
    tone: move > 0 ? "up" : "down",
    text: `${topic(asset)} ${move > 0 ? "rose" : "fell"} ${absPct(move, 2)} ${window}${baseText}.`,
    soWhat: monthText ?? (holdings.length ? `Its biggest holdings are ${listNames(holdings)}.` : undefined),
    tickers: holdings,
    action: { label: `Open ${asset.symbol}`, href: assetHref(asset) },
  };
}

/**
 * The read on a class page: the class in one line (the curve or sector
 * reading when the page has one, else how many rose and who led), then the
 * moves that stood out against the S&P 500 (bitcoin for coins). Rates and
 * options use the same yield and VIX lines as the overview.
 */
export function buildClassRead(input: { slug: string; assets: MarketAsset[]; data: MarketsData; reading?: string | null }): TheRead | null {
  const { slug, assets, data } = input;
  const byId = new Map(data.assets.map((asset) => [asset.id, asset]));
  const noun = CLASS_NOUN[slug];
  const headline = input.reading?.trim() || (noun ? listTakeaway(assets, noun) : null);
  let insights: Insight[];
  if (slug === "rates") insights = pickInsights([ratesInsight(byId)]);
  else if (slug === "options") insights = pickInsights([volInsight(byId, "mixed")]);
  else {
    const btc = slug === "crypto" ? assets.find((asset) => asset.id === "btc") : undefined;
    const spx = byId.get("sp500") ?? byId.get("spy");
    const baseAsset = btc ?? spx;
    const baseDay = d1(baseAsset);
    // Currencies are not measured against stocks: a pair needs a 1% day on its own to make the read.
    const base = slug !== "fx" && baseAsset && baseDay !== null ? { name: btc ? "bitcoin" : "the S&P 500", day: baseDay } : null;
    const window = slug === "crypto" ? "in 24 hours" : "today";
    const movers = assets
      .filter((asset) => asset.change_mode === "pct" && isNum(asset.change.d1) && asset.id !== baseAsset?.id)
      .sort((a, b) => Math.abs(b.change.d1! - (base?.day ?? 0)) - Math.abs(a.change.d1! - (base?.day ?? 0)) || a.id.localeCompare(b.id));
    insights = pickInsights(movers.slice(0, 2).map((asset) => classMoverInsight(asset, base, window)));
  }
  if (!headline && insights.length === 0) return null;
  const latest = assets.reduce<string | null>((best, asset) => (asset.as_of && (!best || asset.as_of > best) ? asset.as_of : best), null);
  return { headline: headline ? cap(headline) : "", insights, asOf: latest ?? data.as_of ?? null };
}
