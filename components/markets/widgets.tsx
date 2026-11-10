/**
 * Small market widgets that take plain data and render anywhere under an
 * `.oa-landing` / `.oa-app` root: the landing grid, the briefing, /markets.
 * No hooks and no data fetching here, so they work in server and client trees.
 * Every widget has an empty state and shows how fresh its numbers are.
 */
import * as React from "react";

import { Verdict } from "@/components/oa/kit/tone";
import {
  assetAsOfText,
  assetHref,
  signalTone,
  sparkTone,
  classHref,
  dayChangeLabel,
  formatAsOf,
  formatChange,
  formatCompactUsd,
  formatDay,
  formatLevel,
  formatPredictionVolume,
  formatProbability,
  formatProbabilityChange,
  predictionHref,
  predictionReading,
  SECTOR_SHORT,
  sparkPoints,
  volCurveReading,
  volCurveVerdict,
  yieldCurveReading,
  yieldCurveSpreadBps,
  type HeadlineReading,
  type MarketAsset,
  type MarketClassInfo,
  type MarketsOverviewTile,
  type PredictionMarket,
  type PredictionOutcome,
  type Tone,
  type TreasuryCurve,
  type VolCurve,
} from "@/lib/markets-shared";
import { yieldCurveWord, type ToneWord } from "@/lib/tone";

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card text-oa-fg";

/**
 * A card's one-line reading, led by a good-or-bad word when the sentence needs
 * one ("Inverted", "Stressed"). Neutral gets no chip: the sentence already says it.
 */
function NoteLine({ text, verdict }: { text: string | null | undefined; verdict?: ToneWord | null }) {
  if (!text) return null;
  return (
    <p className="text-pretty text-[13.5px] leading-5 text-oa-fg">
      {verdict && verdict.tone !== "flat" ? (
        <Verdict tone={verdict.tone} className="mr-1.5 align-[-4px]">
          {verdict.word}
        </Verdict>
      ) : null}
      {text}
    </p>
  );
}
const MONO = "oa-mono tabular-nums";

export function toneText(tone: Tone): string {
  if (tone === "up") return "text-signal-bullish";
  if (tone === "down") return "text-signal-bearish";
  return "text-oa-muted-fg";
}

function toneStroke(tone: Tone): string {
  if (tone === "up") return "var(--signal-bullish)";
  if (tone === "down") return "var(--signal-bearish)";
  return "var(--oa-muted-fg)";
}

/** "2:49 PM ET": how fresh a block of quotes is. Live prices are the one place the time matters to the reader. */
export function AsOfLine({
  asOf,
  when: whenText,
  className = "",
  prefix,
}: {
  /** An ISO time, shown in New York time. */
  asOf?: string | null;
  /** Already formatted, for end-of-day data that has a date and no clock time. */
  when?: string | null;
  className?: string;
  prefix?: string;
}) {
  const when = whenText ?? formatAsOf(asOf);
  const text = [prefix, when].filter(Boolean).join(" · ");
  if (!text) return null;
  return <p className={`${MONO} text-[12.5px] leading-4 text-oa-muted-fg ${className}`}>{text}</p>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-4 text-[14px] leading-5 text-oa-muted-fg">{children}</p>;
}

/** A year of closes as one line. Renders nothing when there are fewer than two points. */
export function Sparkline({
  values,
  tone = "flat",
  width = 72,
  height = 24,
  className = "",
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparkPoints(values, width, height, 2);
  if (!points) return <span aria-hidden="true" className={`inline-block ${className}`} style={{ width, height }} />;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={`shrink-0 ${className}`}
      fill="none"
    >
      <polyline points={points} stroke={toneStroke(tone)} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ChangeValue({
  value,
  mode,
  className = "",
}: {
  value: number | null;
  mode: MarketAsset["change_mode"];
  className?: string;
}) {
  const text = formatChange(value, mode);
  if (text === null) return <span className={`${MONO} text-oa-muted-fg ${className}`} title="Not available">·</span>;
  return <span className={`${MONO} ${toneText(signalTone(value, mode))} ${className}`}>{text}</span>;
}

/* ── ticker strip ───────────────────────────────────────────────────────── */

/** The cross-asset strip: one tile per headline asset, scrolls sideways on small screens. */
export function MarketTickerStrip({ tiles, className = "" }: { tiles: MarketsOverviewTile[]; className?: string }) {
  if (tiles.length === 0) {
    return (
      <div className={`${CARD} ${className}`}>
        <EmptyState>Market levels are not available right now.</EmptyState>
      </div>
    );
  }
  return (
    <div className={`${CARD} ${className}`}>
      <ul className="flex divide-x divide-oa-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tiles.map((tile) => (
          <li key={tile.id} className="min-w-[164px] flex-1 sm:min-w-[132px]">
            <a
              href={tile.href}
              className="flex h-full flex-col gap-0.5 px-3 py-2.5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              title={`${tile.name}, ${formatAsOf(tile.as_of)}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`${MONO} text-[12.5px] font-medium uppercase tracking-[0.04em] text-oa-muted-fg`}>{tile.symbol}</span>
                <Sparkline values={tile.spark} tone={tile.tone} width={44} height={16} />
              </span>
              <span className={`${MONO} text-[15px] font-medium leading-5 text-oa-fg`}>{tile.level}</span>
              <span className={`${MONO} whitespace-nowrap text-[12.5px] leading-4 ${toneText(tile.tone)}`}>
                {tile.change ?? "·"} <span className="text-oa-muted-fg">{tile.changeLabel}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── asset class card ───────────────────────────────────────────────────── */

function CardHead({ title, href, hrefLabel = "All" }: { title: React.ReactNode; href?: string | null; hrefLabel?: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-oa-border px-3.5 py-2">
      <h3 className="oa-label min-w-0 truncate">{title}</h3>
      {href ? (
        <a href={href} className={`${MONO} shrink-0 text-[12.5px] uppercase tracking-[0.04em] text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:text-oa-fg`}>
          {hrefLabel} →
        </a>
      ) : null}
    </div>
  );
}

function latestAsOf(assets: MarketAsset[]): MarketAsset | null {
  return assets.reduce<MarketAsset | null>((latest, asset) => (!latest || asset.as_of > latest.as_of ? asset : latest), null);
}

/** One row of a class card: symbol and name, a year as a sparkline, level over day change. */
export function AssetRow({ asset }: { asset: MarketAsset }) {
  const tone = signalTone(asset.change.d1, asset.change_mode);
  return (
    <a
      href={assetHref(asset)}
      className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3.5 py-1.5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
    >
      <span className="flex min-w-0 flex-col">
        <span className={`${MONO} truncate text-[14px] font-medium leading-4 text-oa-fg`}>{asset.symbol}</span>
        <span className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{asset.name}</span>
      </span>
      <span className="flex flex-col items-center" title="Past year">
        <Sparkline values={asset.spark} tone={sparkTone(asset.spark, asset.change_mode)} width={52} height={18} />
        <span className="text-[13px] leading-4 text-oa-muted-fg">1Y</span>
      </span>
      <span className="flex min-w-[4.5rem] flex-col items-end">
        <span className={`${MONO} text-[14px] leading-4 text-oa-fg`}>{formatLevel(asset.price, asset.unit)}</span>
        <span className={`${MONO} text-[12.5px] leading-4 ${toneText(tone)}`}>{formatChange(asset.change.d1, asset.change_mode) ?? "·"}</span>
      </span>
    </a>
  );
}

/** A class as a card of dense rows: symbol, a year as a sparkline, level, day change. */
export function AssetClassCard({
  title,
  href,
  assets,
  limit = 6,
  note,
  noteVerdict = null,
  emptyText = "Nothing to show for this class right now.",
  className = "",
}: {
  title: React.ReactNode;
  /** Null hides the header link. */
  href?: string | null;
  assets: MarketAsset[];
  limit?: number;
  /** The card's takeaway: one plain sentence built from the data, shown first, above the rows. */
  note?: string | null;
  /** Good or bad for stocks, in a word, shown before the note. */
  noteVerdict?: ToneWord | null;
  emptyText?: string;
  className?: string;
}) {
  const rows = assets.slice(0, limit);
  const latest = latestAsOf(rows);
  return (
    <section className={`${CARD} flex flex-col ${className}`}>
      <CardHead title={title} href={href} hrefLabel={assets.length > rows.length ? `All ${assets.length}` : "Open"} />
      {rows.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <>
          {note ? (
            <div className="border-b border-oa-border px-3.5 py-2">
              <NoteLine text={note} verdict={noteVerdict} />
            </div>
          ) : null}
          <div className="divide-y divide-oa-border">
            {rows.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </div>
          {latest ? (
            <div className="mt-auto border-t border-oa-border bg-oa-bg px-3.5 py-2">
              <AsOfLine when={assetAsOfText(latest)} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── sector heat grid ───────────────────────────────────────────────────── */

function heatStyle(change: number | null): React.CSSProperties {
  const tone = signalTone(change);
  if (tone === "flat" || change === null) return { background: "var(--oa-bg)" };
  // Full strength at a 2.5% move; never so strong that the ink stops reading.
  const strength = Math.round(8 + Math.min(Math.abs(change) / 2.5, 1) * 30);
  const color = tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)";
  return { background: `color-mix(in srgb, ${color} ${strength}%, var(--oa-card))` };
}

/** Sector ETFs as a grid of cells shaded by the day's change, best first. */
export function SectorHeatGrid({
  assets,
  title = "Sectors",
  href = classHref("etfs"),
  wide = false,
  takeaway = null,
  className = "",
}: {
  /** Any assets: only sector ETFs are drawn. */
  assets: MarketAsset[];
  title?: React.ReactNode;
  /** Null hides the header link. */
  href?: string | null;
  /** True when the grid has the full page width: more cells per row. */
  wide?: boolean;
  /** One plain sentence on what the grid says, shown above it. */
  takeaway?: string | null;
  className?: string;
}) {
  const sectors = assets
    .filter((asset) => asset.class === "etf" && asset.group === "sector")
    .sort((a, b) => (b.change.d1 ?? -Infinity) - (a.change.d1 ?? -Infinity));
  const latest = latestAsOf(sectors);
  return (
    <section className={`${CARD} flex flex-col ${className}`}>
      <CardHead title={title} href={href} hrefLabel="ETFs" />
      {sectors.length === 0 ? (
        <EmptyState>Sector funds are not available right now.</EmptyState>
      ) : (
        <>
          {takeaway ? (
            <div className="border-b border-oa-border px-3.5 py-2">
              <NoteLine text={takeaway} />
            </div>
          ) : null}
          <div className={`grid grid-cols-3 gap-px bg-oa-border ${wide ? "sm:grid-cols-4 lg:grid-cols-6" : ""}`}>
            {sectors.map((asset) => (
              <a
                key={asset.id}
                href={assetHref(asset)}
                style={heatStyle(asset.change.d1)}
                className="flex min-h-[58px] flex-col justify-between gap-1 px-2.5 py-2 outline-none transition-[filter] hover:brightness-95 focus-visible:brightness-95 dark:hover:brightness-125"
                title={asset.name}
              >
                <span className="truncate text-[12.5px] font-medium leading-4 text-oa-fg">{SECTOR_SHORT[asset.id] ?? asset.symbol}</span>
                <span className="flex items-baseline justify-between gap-1">
                  <span className={`${MONO} text-[14px] font-medium leading-4 text-oa-fg`}>
                    {formatChange(asset.change.d1, asset.change_mode) ?? "·"}
                  </span>
                  <span className={`${MONO} text-[12.5px] leading-4 text-oa-fg/80`}>{asset.symbol}</span>
                </span>
              </a>
            ))}
          </div>
          {latest ? (
            <div className="mt-auto border-t border-oa-border bg-oa-bg px-3.5 py-2">
              <AsOfLine asOf={latest.as_of} prefix={`Change ${dayChangeLabel(latest)}`} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── curve charts ───────────────────────────────────────────────────────── */

interface CurvePoint {
  label: string;
  value: number;
  prior: number | null;
  /** Null hides the header link. */
  href?: string | null;
}

function niceBounds(values: number[], minSpan: number): { min: number; max: number } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, minSpan);
  const pad = span * 0.14;
  const mid = (high + low) / 2;
  return { min: mid - span / 2 - pad, max: mid + span / 2 + pad };
}

/**
 * A curve across ordered points (maturities, horizons): today's line in copper,
 * the comparison line dashed. Labels are HTML so they stay sharp at any width.
 */
export function CurveChart({
  points,
  format,
  priorLabel,
  nowLabel,
  height = 150,
  minSpan = 0.4,
  wide = false,
}: {
  points: CurvePoint[];
  format: (value: number) => string;
  nowLabel: string;
  priorLabel?: string | null;
  height?: number;
  minSpan?: number;
  /** True when the chart has the full page width: every point keeps its label from sm up. */
  wide?: boolean;
}) {
  if (points.length < 2) return <EmptyState>Not enough points to draw the curve.</EmptyState>;
  const priors = points.map((item) => item.prior).filter((value): value is number => value !== null);
  const showPrior = Boolean(priorLabel) && priors.length === points.length;
  const { min, max } = niceBounds([...points.map((item) => item.value), ...(showPrior ? priors : [])], minSpan);
  const x = (index: number) => (index / (points.length - 1)) * 100;
  const y = (value: number) => (1 - (value - min) / (max - min)) * 100;
  const path = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const ticks = [max - (max - min) * 0.1, (max + min) / 2, min + (max - min) * 0.1];
  return (
    <div className="px-3.5 pb-2 pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className={`${MONO} flex items-center gap-1.5 text-[12.5px] text-oa-fg`}>
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-oa-primary" />
          {nowLabel}
        </span>
        {showPrior ? (
          <span className={`${MONO} flex items-center gap-1.5 text-[12.5px] text-oa-muted-fg`}>
            <span aria-hidden="true" className="inline-block h-0 w-4 border-t border-dashed border-oa-muted-fg" />
            {priorLabel}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative" style={{ height }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className={`${MONO} absolute right-0 -translate-y-1/2 text-[12.5px] leading-none text-oa-muted-fg`}
              style={{ top: `${y(tick)}%` }}
            >
              {format(tick)}
            </span>
          ))}
          <span className={`${MONO} invisible text-[12.5px]`}>{format(max)}</span>
        </div>
        <div className="relative ml-2 mr-5" style={{ height }}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" fill="none">
            {ticks.map((tick) => (
              <line key={tick} x1={0} x2={100} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {showPrior ? (
              <path d={path(priors)} stroke="var(--oa-muted-fg)" strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            ) : null}
            <path d={path(points.map((item) => item.value))} stroke="var(--oa-primary)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map((item, index) => (
            <span
              key={item.label}
              aria-hidden="true"
              className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-oa-card bg-oa-primary"
              style={{ left: `${x(index)}%`, top: `${y(item.value)}%` }}
            />
          ))}
        </div>
        <div />
        <div className="relative ml-2 mr-5 mt-1.5 h-9">
          {points.map((item, index) => {
            const body = (
              <>
                <span className="text-[12.5px] uppercase tracking-[0.06em] text-oa-muted-fg">{item.label}</span>
                <span className="text-[12.5px] text-oa-fg">{format(item.value)}</span>
              </>
            );
            // The last label leans left so a long value cannot run off the card.
            const cls = `${MONO} absolute top-0 flex flex-col whitespace-nowrap leading-4 ${
              index === points.length - 1 ? "-translate-x-[80%] items-end" : "-translate-x-1/2 items-center"
            } ${
              points.length > 7 && index % 2 === 1 ? (wide ? "max-sm:hidden" : "hidden") : ""
            }`;
            return item.href ? (
              <a key={item.label} href={item.href} className={`${cls} outline-none hover:[&>span:last-child]:underline`} style={{ left: `${x(index)}%` }}>
                {body}
              </a>
            ) : (
              <span key={item.label} className={cls} style={{ left: `${x(index)}%` }}>
                {body}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The Treasury curve today against a month ago, with the 2s10s reading. */
export function YieldCurveChart({
  curve,
  title = "Treasury yield curve",
  href = classHref("rates"),
  wide = false,
  className = "",
}: {
  curve: TreasuryCurve | null;
  title?: React.ReactNode;
  /** Null hides the header link. */
  href?: string | null;
  wide?: boolean;
  className?: string;
}) {
  return (
    <section className={`${CARD} flex flex-col ${className}`}>
      <CardHead title={title} href={href} hrefLabel="Rates" />
      {!curve ? (
        <EmptyState>The Treasury curve is not available right now.</EmptyState>
      ) : (
        <>
          <CurveChart
            points={curve.points.map((item) => ({
              label: item.tenor,
              value: item.value,
              prior: item.value_1m_ago,
              href: item.asset_id ? `/markets/rates/${item.asset_id}` : undefined,
            }))}
            format={(value) => `${value.toFixed(2)}%`}
            wide={wide}
            height={wide ? 190 : 150}
            nowLabel={formatDay(curve.date) || "Latest"}
            priorLabel={curve.date_1m_ago ? `${formatDay(curve.date_1m_ago)} (a month earlier)` : null}
          />
          <div className="mt-auto flex flex-col gap-1 border-t border-oa-border bg-oa-bg px-3.5 py-2">
            <NoteLine text={yieldCurveReading(curve)} verdict={yieldCurveWord(yieldCurveSpreadBps(curve))} />
            <AsOfLine when={`${formatDay(curve.date)} close`} />
          </div>
        </>
      )}
    </section>
  );
}

/** Implied volatility of the S&P 500 by horizon, from the Cboe VIX family. */
export function VolCurveChart({
  curve,
  title = "Implied volatility by horizon",
  href = classHref("options"),
  className = "",
}: {
  curve: VolCurve | null;
  title?: React.ReactNode;
  /** Null hides the header link. */
  href?: string | null;
  className?: string;
}) {
  return (
    <section className={`${CARD} flex flex-col ${className}`}>
      <CardHead title={title} href={href} hrefLabel="Options" />
      {!curve ? (
        <EmptyState>Implied volatility data is not available right now.</EmptyState>
      ) : (
        <>
          <CurveChart
            points={curve.points.map((item) => ({
              label: item.label,
              value: item.value,
              prior: item.value_1m_ago,
              href: item.asset_id ? (item.asset_id === "vix" ? "/markets/indices/vix" : `/markets/options/${item.asset_id}`) : undefined,
            }))}
            format={(value) => value.toFixed(1)}
            nowLabel={formatDay(curve.date) || "Latest"}
            priorLabel="a month earlier"
            minSpan={3}
          />
          <div className="mt-auto flex flex-col gap-1 border-t border-oa-border bg-oa-bg px-3.5 py-2">
            <NoteLine text={volCurveReading(curve)} verdict={volCurveVerdict(curve)} />
            <AsOfLine when={`${formatDay(curve.date)} close`} />
          </div>
        </>
      )}
    </section>
  );
}

/* ── prediction markets ─────────────────────────────────────────────────── */

export function ProbabilityBar({ probability, lead = false }: { probability: number; lead?: boolean }) {
  const width = Math.max(1.5, Math.min(100, probability * 100));
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-oa-bg">
      <span className={`block h-full rounded-full ${lead ? "bg-oa-primary" : "bg-oa-muted-fg/45"}`} style={{ width: `${width}%` }} />
    </span>
  );
}

export function OutcomeRow({ outcome, lead }: { outcome: PredictionOutcome; lead: boolean }) {
  const change = formatProbabilityChange(outcome.change_24h);
  const tone: Tone = !change ? "flat" : (outcome.change_24h ?? 0) > 0 ? "up" : "down";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_3.25rem_3rem] items-center gap-x-2.5 gap-y-1">
      <span className={`truncate text-[14px] leading-4 ${lead ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`} title={outcome.label}>
        {outcome.label}
      </span>
      <span className={`${MONO} text-right text-[12.5px] leading-4 ${toneText(tone)}`}>{change ?? ""}</span>
      <span className={`${MONO} text-right text-[14px] leading-4 ${lead ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>
        {formatProbability(outcome.probability)}
      </span>
      <span className="col-span-3">
        <ProbabilityBar probability={outcome.probability} lead={lead} />
      </span>
    </li>
  );
}

/** The outcomes a card shows: for a yes/no market just "Yes"; otherwise the top few in listed order. */
export function shownOutcomes(market: PredictionMarket, limit: number): PredictionOutcome[] {
  if (market.kind === "binary") return market.outcomes.slice(0, 1);
  if (market.outcomes.length <= limit) return market.outcomes;
  const ranked = [...market.outcomes].sort((a, b) => b.probability - a.probability).slice(0, limit);
  return market.outcomes.filter((outcome) => ranked.includes(outcome));
}

/** One prediction market: the question, outcomes with probability bars, volume, close date, venue. */
export function PredictionCard({
  market,
  limit = 4,
  className = "",
}: {
  market: PredictionMarket | null;
  limit?: number;
  className?: string;
}) {
  if (!market) {
    return (
      <section className={`${CARD} ${className}`}>
        <CardHead title="Prediction markets" href={classHref("predictions")} />
        <EmptyState>No open prediction market to show right now.</EmptyState>
      </section>
    );
  }
  const outcomes = shownOutcomes(market, limit);
  const top = Math.max(...outcomes.map((outcome) => outcome.probability));
  const reading = predictionReading(market);
  const volume = formatPredictionVolume(market);
  const closes = formatDay(market.close_time, true);
  return (
    <section className={`${CARD} flex flex-col ${className}`}>
      <a href={predictionHref(market)} className="flex flex-col gap-2.5 px-3.5 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent">
        <span className="flex items-center justify-between gap-2">
          <span className="oa-caption">{market.topic}</span>
          <span className={`${MONO} text-[12.5px] text-oa-muted-fg`}>{market.source_name}</span>
        </span>
        <span className="text-[15px] font-medium leading-5 text-oa-fg">{market.question}</span>
        <ul className="flex flex-col gap-2">
          {outcomes.map((outcome) => (
            <OutcomeRow key={outcome.label} outcome={outcome} lead={outcome.probability === top} />
          ))}
        </ul>
      </a>
      <div className="mt-auto flex flex-col gap-1 border-t border-oa-border bg-oa-bg px-3.5 py-2">
        {reading ? <p className="text-[12.5px] leading-[18px] text-oa-fg">{reading}</p> : null}
        <p className={`${MONO} text-[12.5px] leading-4 text-oa-muted-fg`}>
          {[volume, closes ? `closes ${closes}` : null, formatAsOf(market.as_of)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </section>
  );
}

/* ── readings ───────────────────────────────────────────────────────────── */

/** "What moved" in sentences. Each line links to its asset. */
export function MarketReadings({
  readings,
  title = "What moved across markets",
  asOf,
  className = "",
}: {
  readings: HeadlineReading[];
  title?: React.ReactNode;
  asOf?: string | null;
  className?: string;
}) {
  return (
    <section className={`${CARD} ${className}`}>
      <CardHead title={title} />
      {readings.length === 0 ? (
        <EmptyState>Nothing to report yet. Readings appear once market data has loaded.</EmptyState>
      ) : (
        <ul className="divide-y divide-oa-border">
          {readings.map((reading) => (
            <li key={reading.key}>
              <a
                href={reading.href}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-3.5 py-2.5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <span className="flex flex-col items-start gap-1.5">
                  <span className={`${MONO} pt-0.5 text-[12.5px] uppercase tracking-[0.04em] text-oa-muted-fg`}>{reading.label}</span>
                  {reading.verdict && reading.verdict.tone !== "flat" ? <Verdict tone={reading.verdict.tone}>{reading.verdict.word}</Verdict> : null}
                </span>
                <span className="text-[14px] leading-[21px] text-oa-fg">{reading.text}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {readings.length > 0 && asOf ? (
        <AsOfLine asOf={asOf} className="border-t border-oa-border bg-oa-bg px-3.5 py-2" />
      ) : null}
    </section>
  );
}

/** Links to every class, for the top of a markets page. */
export function ClassTabs({ classes, active, counts }: { classes: MarketClassInfo[]; active?: string; counts?: Record<string, number> }) {
  return (
    <nav aria-label="Asset classes" className="oa-scroll-fade -mx-2 overflow-x-auto border-b border-oa-border px-4 pr-8 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-6">
        <li>
          <a
            href="/markets"
            aria-current={!active ? "page" : undefined}
            className={`-mb-px flex h-10 items-center border-b-2 text-[14px] outline-none transition-colors ${
              !active ? "border-oa-primary font-medium text-oa-fg" : "border-transparent text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            Overview
          </a>
        </li>
        {classes.map((item) => {
          const on = item.slug === active;
          const count = counts?.[item.slug];
          return (
            <li key={item.slug}>
              <a
                href={classHref(item.slug)}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 text-[14px] outline-none transition-colors ${
                  on ? "border-oa-primary font-medium text-oa-fg" : "border-transparent text-oa-muted-fg hover:text-oa-fg"
                }`}
              >
                {item.title}
                {count ? <span className={`${MONO} text-[12.5px] text-oa-muted-fg`}>{count}</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "$6.1B" style money for stat cells; a dot when unknown. */
export function compactUsd(value: number | null): string {
  return formatCompactUsd(value) ?? "·";
}
