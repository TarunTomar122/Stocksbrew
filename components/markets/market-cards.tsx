/**
 * "More markets" on Market today (/explore): one card per part of the market,
 * each one figure with a few words saying what it is, whether it is good or bad
 * for stocks with the reason in a few words, and a small picture drawn from data
 * already loaded. The whole card opens that part of
 * /markets. Server-rendered, no hooks: six cards cost a few kilobytes, where
 * the folded sections they replace sent every table of /markets again.
 */
import Link from "next/link";
import type * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { KindIcon, type KindIconName } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { marketKindIcon } from "@/components/markets/market-kind";
import { FUND_TOPIC, fedOutcomeWords } from "@/lib/markets-insights";
import {
  biggestMoves,
  classHref,
  formatChange,
  formatLevel,
  formatProbability,
  type MarketAsset,
  type MarketsData,
  type PredictionMarket,
  type TreasuryCurve,
} from "@/lib/markets-shared";

import { dollarVerdict, fedVerdict, goldVerdict, movesVerdict, putCallVerdict, VERDICT_WORDS, verdictTally, vixVerdict, yieldVerdict, type Verdict, type VerdictLine } from "@/lib/market-verdict";

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
  /** A logo or icon beside the figure, saying what the figure is about. */
  mark?: React.ReactNode;
  /** Is this good or bad for stocks right now, and why in a few words (lib/market-verdict.ts). Null without data. */
  verdict: VerdictLine | null;
  /** The card's one line when it is not the verdict's reason; the reason then sits in the chip's hover title. */
  line?: string | null;
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

/** The Treasury curve today (solid) and a month ago (dashed), short maturities on the left. */
function CurveLines({ curve }: { curve: TreasuryCurve }) {
  const points = [...curve.points].sort((a, b) => a.months - b.months);
  const values = points.flatMap((point) => [point.value, point.value_1m_ago ?? point.value]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const width = 96;
  const height = 28;
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
 * Each card answers one question, is this good or bad for stocks right now (owner, Nov 12): one figure, a label of a
 * few words saying what it is, then the verdict with its reason in one short line. No verdict without the data.
 */

/**
 * What the biggest mover is, when its name alone does not say (owner, Nov 12: "What is this one-line Dogecoin?"):
 * "Dogecoin, a crypto coin", "Natural gas, a commodity". A stock index or fund already says what it is.
 */
export function moverLabel(asset: MarketAsset): string {
  const kind = asset.class === "crypto" ? "a crypto coin" : asset.class === "commodity" ? "a commodity" : asset.class === "fx" ? "a currency" : null;
  const own = name(asset);
  // A fund named by its topic ("Tech") says it is a fund and which one.
  if (asset.class === "etf" && FUND_TOPIC[asset.id]) return `${own} fund, ${asset.symbol}`;
  return kind ? `${own}, ${kind}` : own;
}

/** "Bitcoin −1.5% and Tech −1.1% were next": the moves after the biggest, so one figure is not left on its own. */
export function nextMovesLine(rest: readonly MarketAsset[]): string | null {
  const parts = rest
    .filter((asset) => asset.change.d1 != null && Number.isFinite(asset.change.d1))
    .slice(0, 2)
    .map((asset) => `${name(asset)} ${signed(asset.change.d1 as number, 1)}%`);
  if (parts.length === 0) return null;
  return parts.length === 1 ? `${parts[0]} was next.` : `${parts[0]} and ${parts[1]} were next.`;
}

/** The mover's own mark: a fund's logo, a coin's image, or the icon of its kind of market. */
function MoverMark({ asset }: { asset: MarketAsset }) {
  if (asset.class === "etf") return <StockLogo ticker={asset.symbol} size={24} eager className="mt-1 shrink-0" />;
  if (asset.class === "crypto" && asset.image) {
    // eslint-disable-next-line @next/next/no-img-element -- a 24px coin mark from the market data, not worth the image optimiser
    return <img src={asset.image} alt="" width={24} height={24} loading="eager" className="mt-1 size-6 shrink-0 rounded-full" />;
  }
  return (
    <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-oa-border bg-oa-card text-oa-muted-fg">
      <KindIcon name={marketKindIcon(asset)} className="size-3.5" />
    </span>
  );
}

/** Each card's kind icon beside its title (owner VISUALS CHECK: a list of kinds carries its icons). */
const CARD_ICON: Record<string, KindIconName> = {
  moved: "movers",
  stocks: "markets",
  rates: "percent",
  commodities: "ingot",
  options: "pulse",
  predictions: "target",
};

function movedCard(data: MarketsData): Card | null {
  const movers = biggestMoves(data.assets, 7);
  const top = movers[0];
  if (!top || top.change.d1 == null) return null;
  const figure = formatChange(top.change.d1, top.change_mode);
  if (!figure) return null;
  // The verdict counts only stock indexes and funds among the biggest moves: a rally in gold, the dollar or bitcoin
  // is not a good day for stocks.
  const stockMoves = movers.filter((asset) => asset.class === "index" || asset.class === "etf");
  const gains = stockMoves.filter((asset) => (asset.change.d1 ?? 0) > 0).length;
  return {
    key: "moved",
    title: "Biggest move across markets",
    href: "/markets",
    linkLabel: "Open all markets",
    figure,
    tone: top.change.d1 > 0 ? "up" : "down",
    label: moverLabel(top),
    mark: <MoverMark asset={top} />,
    verdict: movesVerdict(gains, stockMoves.length),
    // The one line is what came next; the verdict's own count moves to the chip's hover title.
    line: nextMovesLine(movers.slice(1)),
  };
}

function stocksCard(data: MarketsData): Card | null {
  const vix = data.assets.find((asset) => asset.id === "vix");
  if (!vix || !(vix.price > 0)) return null;
  return {
    key: "stocks",
    title: "Indices and funds",
    href: classHref("indices"),
    linkLabel: "Open indices",
    figure: vix.price.toFixed(1),
    tone: "flat",
    label: "VIX, the fear gauge",
    verdict: vixVerdict(vix.price),
    visual: vix.spark.length > 1 ? <Sparkline values={vix.spark} tone="flat" width={96} height={28} /> : null,
  };
}

function ratesCard(data: MarketsData): Card | null {
  const curve = data.treasury;
  if (!curve) return null;
  const ten = curve.points.find((point) => point.months === 120);
  if (!ten) return null;
  const before = ten.value_1m_ago;
  const change = before != null && Number.isFinite(before) ? ten.value - before : null;
  return {
    key: "rates",
    title: "Rates",
    href: classHref("rates"),
    linkLabel: "Open Treasury yields",
    figure: `${ten.value.toFixed(2)}%`,
    tone: "flat",
    label: "10-year yield",
    verdict: yieldVerdict(change),
    visual: curve.points.length > 2 ? <CurveLines curve={curve} /> : null,
  };
}

function commoditiesCard(data: MarketsData): Card | null {
  // Gold's month first: a rush into gold is the clearest read of fear in this group. The dollar index otherwise.
  const gold = data.assets.find((asset) => asset.id === "gold");
  const month = gold?.change.m1;
  if (gold && typeof month === "number" && Number.isFinite(month)) {
    return {
      key: "commodities",
      title: "Commodities and the dollar",
      href: classHref("commodities"),
      linkLabel: "Open commodities",
      figure: `${signed(month, 1)}%`,
      tone: "flat",
      label: "Gold, past month",
      verdict: goldVerdict(month),
      visual: gold.spark.length > 1 ? <Sparkline values={gold.spark} tone="flat" width={96} height={28} /> : null,
    };
  }
  const dxy = data.assets.find((asset) => asset.id === "dxy");
  if (!dxy) return null;
  return {
    key: "commodities",
    title: "Commodities and the dollar",
    href: classHref("fx"),
    linkLabel: "Open currencies",
    figure: formatLevel(dxy.price, dxy.unit),
    tone: "flat",
    label: "Dollar index",
    verdict: dollarVerdict(dxy.price, dxy.low_1y, dxy.high_1y),
    visual: dxy.spark.length > 1 ? <Sparkline values={dxy.spark} tone="flat" width={96} height={28} /> : null,
  };
}

function optionsCard(data: MarketsData): Card | null {
  const ratio = data.assets.find((asset) => asset.id === "pc-equity");
  if (!ratio || !(ratio.price > 0)) return null;
  const average = ratio.average_20d;
  return {
    key: "options",
    title: "Options",
    href: classHref("options"),
    linkLabel: "Open options",
    figure: ratio.price.toFixed(2),
    tone: "flat",
    // A put is a bet on a fall, a call a bet on a rise.
    label: "puts per call",
    verdict: putCallVerdict(ratio.price, average),
    visual: ratio.spark.length > 1 ? <Sparkline values={ratio.spark} tone="flat" width={96} height={28} /> : null,
  };
}

/** "raises rates by 0.25 percentage points" -> "of a 0.25-point Fed hike"; "holds rates…" -> "the Fed holds". */
function fedLabel(words: string): string {
  const move = /^(raises|cuts) rates by (more than )?([\d.]+) percentage points?$/.exec(words);
  if (!move) return /^holds\b/.test(words) ? "the Fed holds" : `the Fed ${words}`;
  return `of a ${move[2] ? "more than " : ""}${move[3]}-point Fed ${move[1] === "raises" ? "hike" : "cut"}`;
}

function predictionsCard(data: MarketsData): Card | null {
  // A ladder ("above 2.5%", "above 3%") or a multi-outcome market is not one pick out of several, so its top
  // outcome is no headline; the lead is the first yes-or-no or pick-one market.
  const lead: PredictionMarket | undefined = pickPredictions(data.predictions).find((market) => market.kind === "binary" || market.kind === "exclusive");
  if (!lead) return null;
  const ranked = lead.outcomes.filter((outcome) => Number.isFinite(outcome.probability)).sort((a, b) => b.probability - a.probability);
  const top = ranked[0];
  if (!top) return null;
  const yes = lead.kind === "binary" ? ranked.find((outcome) => outcome.label.toLowerCase() === "yes") : null;
  const headline = yes ?? top;
  // Only a Fed market's outcomes are rate moves; another market's "No change" stays in its own words.
  const words = lead.topic === "fed" && !yes ? fedOutcomeWords(headline.label) : null;
  // "Fed decision in Dec 2026?" gives the month the odds are for.
  const month = /\bin ([A-Z][a-z]{2,8})\b/.exec(lead.question)?.[1] ?? null;
  return {
    key: "predictions",
    title: "Prediction markets",
    href: classHref("predictions"),
    linkLabel: "Open prediction markets",
    figure: formatProbability(headline.probability),
    tone: "flat",
    label: words ? `chance ${fedLabel(words)}${month ? ` in ${month}` : ""}` : yes ? `chance of yes: ${lead.question.trim().replace(/[.?!]$/, "")}` : `chance of ${headline.label}`,
    verdict: fedVerdict(words),
  };
}

function MarketCard({ card }: { card: Card }) {
  return (
    <li className="oa-surface relative flex min-w-0 flex-col overflow-hidden border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent">
      <h3 className="oa-label flex min-w-0 items-center gap-2">
        <KindIcon name={CARD_ICON[card.key] ?? "markets"} className="size-4 text-oa-muted-fg" />
        <span className="min-w-0 truncate">{card.title}</span>
      </h3>
      <div className="mt-2 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-oa-fg">
            <span className="oa-mono tabular-nums">{card.figure}</span>
            {card.tone !== "flat" ? <ToneGlyph tone={card.tone} className="size-2.5" decorative /> : null}
          </p>
          <p className="text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg">{card.label}</p>
        </div>
        {/* The small picture sits beside the figure, where a fund's logo sits on its card, not on a row of its own at
            the foot, so a card without one has no padded band where the picture would be (owner rule 4). */}
        {card.mark ? card.mark : card.visual ? <div className="mt-1 shrink-0">{card.visual}</div> : null}
      </div>
      {card.verdict || card.line ? (
        <p className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5">
          {card.verdict ? (
            <span
              title={card.line ? card.verdict.why : undefined}
              className={`inline-flex h-6 shrink-0 items-center rounded px-2 text-[12.5px] font-medium ${VERDICT_CHIP[card.verdict.verdict]}`}
            >
              {VERDICT_WORDS[card.verdict.verdict]}
            </span>
          ) : null}
          <span className="min-w-0 text-pretty text-oa-muted-fg">{card.line ?? card.verdict?.why}</span>
        </p>
      ) : null}
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

/** The verdict chip's colours: the app's up and down tones for good and bad, muted for neutral. */
const VERDICT_CHIP: Record<Verdict, string> = {
  good: "bg-[color-mix(in_srgb,var(--signal-bullish)_14%,transparent)] text-signal-bullish",
  bad: "bg-[color-mix(in_srgb,var(--signal-bearish)_14%,transparent)] text-signal-bearish",
  neutral: "bg-oa-accent text-oa-muted-fg",
};

/**
 * "More markets": its title with one tally beside it ("4 of 6 good for stocks"), then the cards that have data,
 * three across on a wide screen, two on a tablet, one on a phone.
 */
export function MarketCards({ data, className = "" }: { data: MarketsData; className?: string }) {
  const cards = [movedCard(data), stocksCard(data), ratesCard(data), commoditiesCard(data), optionsCard(data), predictionsCard(data)].filter(
    (card): card is Card => card !== null,
  );
  if (!cards.length) return null;
  const tally = verdictTally(cards.map((card) => card.verdict?.verdict));
  return (
    <section aria-labelledby="more-markets" className={className}>
      <div className="flex items-baseline justify-between gap-3 px-2 pb-2 sm:px-3">
        <h2 id="more-markets" className="text-[17px] font-medium tracking-tight text-oa-fg">
          More markets
        </h2>
        {tally ? <span className="shrink-0 text-[13px] text-oa-muted-fg">{tally}</span> : null}
      </div>
      {/* Each card as tall as its own words (owner rule 4): a short card is not stretched to its longest neighbour. */}
      <ul role="list" className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <MarketCard key={card.key} card={card} />
        ))}
      </ul>
    </section>
  );
}
