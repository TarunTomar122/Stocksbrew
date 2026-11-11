/**
 * "More markets" on Market today (/explore): one card per part of the market,
 * each leading with one real figure, a plain sentence under it and a small
 * picture drawn from data already loaded. The whole card opens that part of
 * /markets. Server-rendered, no hooks: six cards cost a few kilobytes, where
 * the folded sections they replace sent every table of /markets again.
 */
import Link from "next/link";
import type * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { FUND_TOPIC } from "@/lib/markets-insights";
import {
  biggestMoves,
  changeTone,
  classHref,
  formatChange,
  formatLevel,
  formatProbability,
  rangeReading,
  sessionWord,
  type MarketAsset,
  type MarketsData,
  type PredictionMarket,
  type TreasuryCurve,
} from "@/lib/markets-shared";

import { pickPredictions } from "./overview-sections";
import { Sparkline } from "./widgets";

const MINUS = "−";

type Card = {
  key: string;
  title: string;
  href: string;
  /** What the whole-card link says to a screen reader. */
  linkLabel: string;
  figure: string;
  /** Up or down only when the figure is a signed move. */
  tone: "up" | "down" | "flat";
  label: string;
  /** A fund's ticker, for its logo beside the figure. */
  logo?: string | null;
  text: string;
  more?: string | null;
  visual?: React.ReactNode;
};

function signed(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(digits)}`;
}

function name(asset: MarketAsset): string {
  return FUND_TOPIC[asset.id] ?? asset.name;
}

/* ── the small pictures ─────────────────────────────────────────────────── */

/** Probability bars for a market's leading outcomes: the outcome and its odds, then the bar under them. */
function OddsBars({ outcomes }: { outcomes: Array<{ label: string; probability: number }> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {outcomes.map((outcome) => (
        <li key={outcome.label} className="text-[12px] leading-4 text-oa-muted-fg">
          <span className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 text-pretty">{outcome.label}</span>
            <span className="oa-mono shrink-0 tabular-nums">{formatProbability(outcome.probability)}</span>
          </span>
          <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-oa-border">
            <span className="absolute inset-y-0 left-0 rounded-full bg-oa-primary" style={{ width: `${Math.round(outcome.probability * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The Treasury curve today (solid) and a month ago (dashed), short maturities on the left. */
function CurveLines({ curve }: { curve: TreasuryCurve }) {
  const points = [...curve.points].sort((a, b) => a.months - b.months);
  const values = points.flatMap((point) => [point.value, point.value_1m_ago ?? point.value]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const width = 120;
  const height = 32;
  const x = (index: number) => (points.length > 1 ? (index / (points.length - 1)) * width : 0);
  const y = (value: number) => height - 2 - ((value - lo) / span) * (height - 4);
  const line = (pick: (point: (typeof points)[number]) => number | null) =>
    points
      .map((point, index) => {
        const value = pick(point);
        return value == null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Treasury yields by maturity, today and a month ago" className="block overflow-visible">
      <polyline points={line((point) => point.value_1m_ago)} fill="none" stroke="var(--oa-muted-fg)" strokeWidth={1.25} strokeDasharray="3 3" />
      <polyline points={line((point) => point.value)} fill="none" stroke="var(--oa-fg)" strokeWidth={1.75} strokeLinejoin="round" />
    </svg>
  );
}

/* ── the cards ──────────────────────────────────────────────────────────── */

/**
 * Whether the read above already quotes this asset by its ticker ("GDX fell 5.43%"). Only the ticker, matched
 * whole and in capitals: a plain name like "Gold" would also match "Gold miners" and skip the wrong move.
 */
function quotedIn(said: string, asset: MarketAsset): boolean {
  const symbol = asset.symbol?.trim();
  if (!said || !symbol || symbol.length < 2) return false;
  return new RegExp(`(^|[^A-Za-z0-9])\\$?${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`).test(said);
}

function movedCard(data: MarketsData, said: string): Card | null {
  const movers = biggestMoves(data.assets, 7);
  // The read on top often leads with the day's biggest move ("GDX fell 5.43%"); this card then leads with the
  // biggest one the read does not quote, so the same figure is never shown twice on the page.
  // When the read quotes every one of them, the biggest still leads rather than leaving a hole in the grid.
  const top = movers.find((asset) => !quotedIn(said, asset)) ?? movers[0];
  if (!top || top.change.d1 == null) return null;
  const skipped = top !== movers[0];
  const figure = formatChange(top.change.d1, top.change_mode);
  if (!figure) return null;
  const up = movers.filter((asset) => (asset.change.d1 ?? 0) > 0).length;
  const next = movers
    .filter((asset) => asset !== top && !quotedIn(said, asset))
    .slice(0, 2)
    .map((asset) => `${name(asset)} (${formatChange(asset.change.d1, asset.change_mode)})`)
    .join(" and ");
  const count =
    movers.length < 3
      ? null
      : up === movers.length
      ? `All ${movers.length} of the biggest moves across markets were gains.`
      : up === 0
        ? `All ${movers.length} of the biggest moves across markets were losses.`
        : `${up} of the ${movers.length} biggest moves across markets ${up === 1 ? "was a gain" : "were gains"}.`;
  return {
    key: "moved",
    title: "What moved",
    href: "/markets",
    linkLabel: "Open all markets",
    figure,
    tone: top.change.d1 > 0 ? "up" : "down",
    label: skipped ? `${name(top)}, the next biggest move` : `${name(top)}, the biggest move`,
    logo: top.class === "etf" ? top.symbol : null,
    text: count ?? (skipped ? `${name(top)} was the next biggest move across markets.` : `${name(top)} moved most across markets.`),
    more: next ? `Next were ${next}.` : null,
    // No bar strip: the count sentence already says how many rose (owner rule 5).
  };
}

function stocksCard(data: MarketsData): Card | null {
  const vix = data.assets.find((asset) => asset.id === "vix");
  if (!vix || !(vix.price > 0)) return null;
  const spx = data.assets.find((asset) => asset.id === "sp500");
  const daily = vix.price / Math.sqrt(252);
  const when = spx && sessionWord(spx.as_of) === "today" ? "today" : "in the last session";
  const spxTone = spx ? changeTone(spx.change.d1) : "flat";
  const spxMove =
    spx && spx.change.d1 != null
      ? spxTone === "flat"
        ? `The S&P 500 was flat ${when}.`
        : `The S&P 500 ${spxTone === "up" ? "rose" : "fell"} ${Math.abs(spx.change.d1).toFixed(2)}% ${when}.`
      : null;
  return {
    key: "stocks",
    title: "Indices and funds",
    href: classHref("indices"),
    linkLabel: "Open indices",
    figure: vix.price.toFixed(1),
    tone: "flat",
    label: "VIX, the market's fear gauge",
    text: `Options traders expect the S&P 500 to swing about ${daily.toFixed(1)}% a day.`,
    more: spxMove,
    visual: vix.spark.length > 1 ? <Sparkline values={vix.spark} tone="flat" width={120} height={28} /> : null,
  };
}

function ratesCard(data: MarketsData): Card | null {
  const curve = data.treasury;
  if (!curve) return null;
  const moves = curve.points.filter((point) => point.value_1m_ago != null).map((point) => point.value - (point.value_1m_ago as number));
  if (moves.length < 4) return null;
  const average = moves.reduce((sum, move) => sum + move, 0) / moves.length;
  const two = curve.points.find((point) => point.months === 24);
  const ten = curve.points.find((point) => point.months === 120);
  const shape =
    two && ten
      ? ten.value >= two.value
        ? `The 10-year pays ${ten.value.toFixed(2)}%, ${(ten.value - two.value).toFixed(2)} points more than the 2-year.`
        : `The 2-year pays ${two.value.toFixed(2)}%, ${(two.value - ten.value).toFixed(2)} points more than the 10-year.`
      : null;
  if (!ten) return null;
  const direction = Math.abs(average) < 0.05 ? "about where they were" : average > 0 ? "higher than" : "lower than";
  return {
    key: "rates",
    title: "Rates",
    href: classHref("rates"),
    linkLabel: "Open Treasury yields",
    figure: `${ten.value.toFixed(2)}%`,
    tone: "flat",
    label: "the 10-year Treasury yield",
    text: `Treasury yields are ${direction} a month ago${Math.abs(average) < 0.05 ? "." : `, by ${Math.abs(average).toFixed(2)} percentage points on average.`}`,
    more: shape,
    visual: curve.points.length > 2 ? <CurveLines curve={curve} /> : null,
  };
}

/** What a futures contract is called in a sentence ("Gold for Dec 2027 delivery"). */
const COMMODITY_NAME: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  copper: "Copper",
  wti: "WTI crude oil",
  brent: "Brent crude oil",
  natgas: "Natural gas",
};

function commodityName(asset: MarketAsset): string {
  return COMMODITY_NAME[asset.id] ?? asset.name.replace(/\s*\(.*\)\s*$/, "");
}

/** "Dec 26" is a contract month and a two-digit year; spell the year. */
function contractMonth(label: string): string {
  const match = /^([A-Z][a-z]{2}) (\d{2})$/.exec(label.trim());
  return match ? `${match[1]} 20${match[2]}` : label;
}

function commoditiesCard(data: MarketsData): Card | null {
  const commodities = data.assets.filter((asset) => asset.class === "commodity");
  const lead = commodities.find((asset) => asset.id === "gold" && asset.structure) ?? commodities.find((asset) => asset.structure);
  const dxy = data.assets.find((asset) => asset.id === "dxy");
  const dollar = dxy ? rangeReading(dxy, "The dollar index") : null;
  if (lead?.structure) {
    const { structure } = lead;
    const later = contractMonth(structure.later_label);
    const front = contractMonth(structure.front_label);
    const subject = commodityName(lead);
    const gap = Math.abs(structure.spread_pct).toFixed(1);
    const text =
      structure.state === "contango"
        ? `${subject} for ${later} delivery costs ${gap}% more than for ${front}: buyers pay extra to take it later.`
        : structure.state === "backwardation"
          ? `${subject} for ${later} delivery costs ${gap}% less than for ${front}: buyers pay extra to have it now.`
          : `${subject} for ${front} and ${later} delivery trade within ${gap}% of each other.`;
    return {
      key: "commodities",
      title: "Commodities and the dollar",
      href: classHref("commodities"),
      linkLabel: "Open commodities",
      figure: `${signed(structure.spread_pct, 1)}%`,
      tone: "flat",
      label: `${subject}, ${later} over ${front}`,
      text,
      more: dollar,
      visual: lead.spark.length > 1 ? <Sparkline values={lead.spark} tone="flat" width={120} height={28} /> : null,
    };
  }
  if (!dxy) return null;
  return {
    key: "commodities",
    title: "Commodities and the dollar",
    href: classHref("fx"),
    linkLabel: "Open currencies",
    figure: formatLevel(dxy.price, dxy.unit),
    tone: "flat",
    label: "the dollar index",
    text: dollar ?? "The dollar against six major currencies.",
    visual: dxy.spark.length > 1 ? <Sparkline values={dxy.spark} tone="flat" width={120} height={28} /> : null,
  };
}

function optionsCard(data: MarketsData): Card | null {
  const ratio = data.assets.find((asset) => asset.id === "pc-equity");
  if (!ratio || !(ratio.price > 0)) return null;
  const average = ratio.average_20d;
  const diff = average != null && average > 0 ? ratio.price - average : null;
  const text =
    diff == null || Math.abs(diff) < 0.03
      ? "Puts and calls on single stocks traded in their usual mix."
      : diff > 0
        ? "More puts than usual traded on single stocks: traders paid for protection against a fall."
        : "More calls than usual traded on single stocks: traders leaned toward a rise.";
  return {
    key: "options",
    title: "Options",
    href: classHref("options"),
    linkLabel: "Open options",
    figure: ratio.price.toFixed(2),
    tone: "flat",
    label: average != null && average > 0 ? `puts per call, 20-day average ${average.toFixed(2)}` : "puts per call",
    text,
    visual: ratio.spark.length > 1 ? <Sparkline values={ratio.spark} tone="flat" width={120} height={28} /> : null,
  };
}

function predictionsCard(data: MarketsData): Card | null {
  // A ladder ("above 2.5%", "above 3%") or a multi-outcome market is not one pick out of several, so its top
  // outcome is no headline; the lead is the first yes-or-no or pick-one market.
  const lead: PredictionMarket | undefined = pickPredictions(data.predictions).find((market) => market.kind === "binary" || market.kind === "exclusive");
  if (!lead) return null;
  const ranked = lead.outcomes.filter((outcome) => Number.isFinite(outcome.probability)).sort((a, b) => b.probability - a.probability);
  const top = ranked[0];
  if (!top) return null;
  // "Fed decision in Dec 2026?" stays as it is; a question stored without an end mark gets a full stop.
  const question = /[.?!]$/.test(lead.question.trim()) ? lead.question.trim() : `${lead.question.trim()}.`;
  const yes = lead.kind === "binary" ? ranked.find((outcome) => outcome.label.toLowerCase() === "yes") : null;
  const headline = yes ?? top;
  const second = ranked.find((outcome) => outcome !== headline);
  return {
    key: "predictions",
    title: "Prediction markets",
    href: classHref("predictions"),
    linkLabel: "Open prediction markets",
    figure: formatProbability(headline.probability),
    tone: "flat",
    label: `chance of ${yes ? "yes" : headline.label}, on ${lead.source_name}`,
    text: question,
    more: !yes && second && second.probability >= 0.05 ? `Next is ${second.label}, at ${formatProbability(second.probability)}.` : null,
    visual: <OddsBars outcomes={ranked.slice(0, 3)} />,
  };
}

function MarketCard({ card }: { card: Card }) {
  return (
    <li className="oa-surface relative flex min-w-0 flex-col overflow-hidden border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent">
      <h3 className="oa-label">{card.title}</h3>
      <div className="mt-2 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-oa-fg">
            <span className="oa-mono tabular-nums">{card.figure}</span>
            {card.tone !== "flat" ? <ToneGlyph tone={card.tone} className="size-2.5" decorative /> : null}
          </p>
          <p className="text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{card.label}</p>
        </div>
        {card.logo ? <StockLogo ticker={card.logo} size={24} eager className="mt-1 shrink-0" /> : null}
      </div>
      <p className="mt-2 text-pretty text-[14.5px] leading-[21px] text-oa-fg">{card.text}</p>
      {card.more ? <p className="mt-1 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{card.more}</p> : null}
      {card.visual ? <div className="mt-auto pt-3">{card.visual}</div> : null}
      {/* The whole card opens its part of /markets; no link words repeated on every card. */}
      <Link
        href={card.href}
        prefetch={false}
        aria-label={card.linkLabel}
        className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
    </li>
  );
}

/** The six cards that have data, three across on a wide screen, two on a tablet, one on a phone. */
export function MarketCards({
  data,
  said = "",
  className = "",
}: {
  data: MarketsData;
  /** What the page's read already says; the What moved card skips a move it quotes. */
  said?: string;
  className?: string;
}) {
  const cards = [movedCard(data, said), stocksCard(data), ratesCard(data), commoditiesCard(data), optionsCard(data), predictionsCard(data)].filter(
    (card): card is Card => card !== null,
  );
  if (!cards.length) return null;
  return (
    <ul role="list" className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {cards.map((card) => (
        <MarketCard key={card.key} card={card} />
      ))}
    </ul>
  );
}
