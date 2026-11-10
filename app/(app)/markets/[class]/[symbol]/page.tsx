import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Crumbs, MarketsPageFrame, SectionLabel, Stat, StatGrid } from "@/components/markets/page-frame";
import { PriceChart } from "@/components/markets/price-chart";
import { ProbabilityChart } from "@/components/markets/probability-chart";
import { WatchButton } from "@/components/markets/watch-button";
import {
  AssetClassCard,
  ChangeValue,
  CurveChart,
  OutcomeRow,
  AsOfLine,
  toneText,
  VolCurveChart,
  YieldCurveChart,
} from "@/components/markets/widgets";
import { getMarketSeries, getMarketsData, getPredictionHistory } from "@/lib/markets";
import {
  assetAsOfText,
  assetHref,
  assetReading,
  athReading,
  signalTone,
  classHref,
  classInfoBySlug,
  classInfoFor,
  dayChangeLabel,
  formatAsOf,
  formatChange,
  formatCompactNumber,
  formatCompactUsd,
  formatDay,
  formatLevel,
  formatPredictionVolume,
  predictionHref,
  predictionReading,
  rangeReading,
  structureReading,
  unitNote,
  type MarketAsset,
  type MarketsData,
  type PredictionMarket,
} from "@/lib/markets-shared";
import { getSearchIndexForApi } from "@/lib/search";
import { ogImage, shareMetadata } from "@/lib/og/url";

export const revalidate = 300;

type Props = { params: Promise<{ class: string; symbol: string }> };

/** The route segment as an id. A malformed escape reads as itself rather than throwing. */
function segment(symbol: string): string {
  try {
    return decodeURIComponent(symbol);
  } catch {
    return symbol;
  }
}

function find(data: MarketsData, slug: string, symbol: string): { asset?: MarketAsset; market?: PredictionMarket } {
  const info = classInfoBySlug(slug);
  if (!info) return {};
  const id = segment(symbol).toLowerCase();
  if (info.slug === "predictions") return { market: data.predictions.find((item) => item.id === id) };
  return { asset: data.assets.find((item) => item.id === id || item.symbol.toLowerCase() === id) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { class: slug, symbol } = await params;
  const { asset, market } = find(await getMarketsData(), slug, symbol);
  if (market) {
    const title = `${market.question} Odds on ${market.source_name}`;
    const description = `Traded odds, daily history and resolution rules for "${market.question}" on ${market.source_name}.`;
    return {
      title,
      description,
      alternates: { canonical: predictionHref(market) },
      ...shareMetadata({
        title: `${title} · stocksbrew`,
        description,
        path: predictionHref(market),
        image: ogImage(["market", "predictions", market.id], `${market.question}: the traded odds`, { daily: true }),
      }),
    };
  }
  if (asset) {
    const title = `${asset.name} (${asset.symbol}): level, chart and changes`;
    const description = `${asset.name}: latest level, one-day to one-year changes and a year of daily closes.`;
    return {
      title,
      description,
      alternates: { canonical: assetHref(asset) },
      ...shareMetadata({
        title: `${title} · stocksbrew`,
        description,
        path: assetHref(asset),
        image: ogImage(["market", classInfoFor(asset.class).slug, asset.id], `${asset.name}: today's level and a year of closes`, { daily: true }),
      }),
    };
  }
  return { title: "Markets" };
}

export default async function MarketAssetPage({ params }: Props) {
  const { class: slug, symbol } = await params;
  const data = await getMarketsData();
  const { asset, market } = find(data, slug, symbol);
  if (market) return <PredictionPage market={market} />;
  if (!asset) notFound();
  // One canonical URL per asset: /markets/etfs/SPY and a wrong class both land on the real one.
  if (classInfoFor(asset.class).slug !== slug.toLowerCase() || asset.id !== segment(symbol)) redirect(assetHref(asset));
  return <AssetPage asset={asset} data={data} />;
}

/* ── asset ──────────────────────────────────────────────────────────────── */

async function stockTickers(): Promise<Set<string>> {
  const entries = await getSearchIndexForApi("US").catch(() => []);
  return new Set(entries.map((entry) => entry.ticker.toUpperCase()));
}

function RangeBar({ asset, showReading }: { asset: MarketAsset; showReading: boolean }) {
  const { low_1y: low, high_1y: high, price } = asset;
  if (low === null || high === null || high <= low) return null;
  const at = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <div className="oa-surface border border-oa-border bg-oa-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="oa-caption">1-year range</span>
        {showReading ? <span className="text-[12.5px] leading-4 text-oa-muted-fg">{rangeReading(asset)}</span> : null}
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-oa-bg">
        <span aria-hidden="true" className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card bg-oa-primary" style={{ left: `${at}%` }} />
      </div>
      <div className="oa-mono mt-2 flex justify-between text-[12.5px] tabular-nums text-oa-muted-fg">
        <span>
          <span className="text-oa-fg">{formatLevel(low, asset.unit)}</span> low · {formatDay(asset.low_1y_date)}
        </span>
        <span className="text-right">
          {formatDay(asset.high_1y_date)} · high <span className="text-oa-fg">{formatLevel(high, asset.unit)}</span>
        </span>
      </div>
    </div>
  );
}

async function AssetPage({ asset, data }: { asset: MarketAsset; data: MarketsData }) {
  const info = classInfoFor(asset.class);
  const [series, tickers] = await Promise.all([
    getMarketSeries(asset.id),
    asset.holdings.length > 0 ? stockTickers() : Promise.resolve(new Set<string>()),
  ]);
  const tone = signalTone(asset.change.d1, asset.change_mode);
  const dayLabel = asset.daily_only || asset.source === "treasury" ? "vs prior close" : dayChangeLabel(asset);
  const note = unitNote(asset.unit);
  const reading = assetReading(asset);
  const peers = data.assets.filter((item) => item.class === asset.class && item.id !== asset.id && (asset.class !== "etf" || item.group === asset.group));
  const totalVolume = asset.call_volume !== null && asset.put_volume !== null ? asset.call_volume + asset.put_volume : null;
  const maxWeight = Math.max(...asset.holdings.map((holding) => holding.weight_pct), 0);

  return (
    <MarketsPageFrame>
      {/* One head: where this sits, what it is, then the price as the one big number. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div className="min-w-0">
          <Crumbs items={[{ label: "Markets", href: "/markets" }, { label: info.title, href: classHref(info.slug) }]} />
          <h1 className="mt-1 text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
            {asset.name} <span className="oa-mono text-[14px] font-normal text-oa-muted-fg">{asset.symbol}</span>
          </h1>
        </div>
        <WatchButton assetId={asset.id} label={asset.name} />
        <div className="col-span-2 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="oa-mono text-[32px] font-medium leading-9 tabular-nums tracking-tight text-oa-fg sm:text-[34px] sm:leading-10">{formatLevel(asset.price, asset.unit)}</span>
          {formatChange(asset.change.d1, asset.change_mode) ? (
            <span className={`oa-mono text-[17px] font-medium leading-6 tabular-nums ${toneText(tone)}`}>
              {formatChange(asset.change.d1, asset.change_mode)} <span className="font-sans text-[12.5px] font-normal text-oa-muted-fg">{dayLabel}</span>
            </span>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
            <AsOfLine when={assetAsOfText(asset)} />
            {note ? <span>· {note}</span> : null}
            {asset.contract ? <span>· {asset.contract} contract</span> : null}
          </div>
        </div>
        {reading ? <p className="col-span-2 mt-1 max-w-[70ch] text-[14px] leading-[22px] text-oa-muted-fg">{reading}</p> : null}
      </header>

      <PriceChart
        series={series}
        unit={asset.unit}
        mode={asset.change_mode}
        stored={{ "1W": asset.change.w1, "1M": asset.change.m1, "1Y": asset.change.y1 }}
      />

      <StatGrid>
        <Stat label="Previous close" value={asset.prev_close !== null ? formatLevel(asset.prev_close, asset.unit) : null} />
        <Stat label="1 week" value={<ChangeValue value={asset.change.w1} mode={asset.change_mode} />} />
        <Stat label="1 month" value={<ChangeValue value={asset.change.m1} mode={asset.change_mode} />} />
        <Stat label="Year to date" value={<ChangeValue value={asset.change.ytd} mode={asset.change_mode} />} />
        <Stat label="1 year" value={<ChangeValue value={asset.change.y1} mode={asset.change_mode} />} />
        <Stat label="Expense ratio" value={asset.expense_ratio_pct !== null ? `${asset.expense_ratio_pct.toFixed(2)}%` : null} sub="a year, of assets" />
        <Stat label="Fund assets" value={formatCompactUsd(asset.total_assets)} />
        <Stat label="Yield" value={asset.yield_pct !== null ? `${asset.yield_pct.toFixed(2)}%` : null} />
        <Stat label="Fund family" value={asset.fund_family} />
        <Stat label="Category" value={asset.category} />
        <Stat label="Market cap" value={formatCompactUsd(asset.market_cap)} />
        <Stat label="Volume, 24h" value={formatCompactUsd(asset.volume_24h)} />
        <Stat label="All-time high" value={asset.ath !== null ? formatLevel(asset.ath, "USD") : null} sub={formatDay(asset.ath_date, true)} title={athReading(asset) ?? undefined} />
        <Stat label="20-day average" value={asset.average_20d !== null ? asset.average_20d.toFixed(2) : null} />
        <Stat label="Puts traded" value={formatCompactNumber(asset.put_volume)} sub={totalVolume ? `of ${formatCompactNumber(totalVolume)} contracts` : undefined} />
        <Stat label="Calls traded" value={formatCompactNumber(asset.call_volume)} />
      </StatGrid>

      <RangeBar asset={asset} showReading={reading !== rangeReading(asset)} />

      {asset.class === "etf" ? (
        <>
          <SectionLabel aside={asset.holdings_weight_pct !== null ? `${asset.holdings_weight_pct.toFixed(1)}% of the fund` : undefined}>Top holdings</SectionLabel>
          {asset.holdings.length === 0 ? (
            <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-4 text-[14px] leading-5 text-oa-muted-fg">
              Our source does not list stock holdings for this fund. That is normal for funds that hold Treasuries, bullion, futures or crypto.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
                <ol className="divide-y divide-oa-border">
                  {asset.holdings.map((holding, index) => {
                    const linked = holding.symbol !== null && tickers.has(holding.symbol);
                    const body = (
                      <>
                        <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{String(index + 1).padStart(2, "0")}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className={`oa-mono truncate text-[14px] font-medium leading-4 ${linked ? "text-oa-primary" : "text-oa-fg"}`}>{holding.symbol ?? "·"}</span>
                          <span className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{holding.name}</span>
                        </span>
                        <span aria-hidden="true" className="hidden h-1.5 overflow-hidden rounded-full bg-oa-bg sm:block">
                          <span className="block h-full rounded-full bg-oa-primary/70" style={{ width: `${maxWeight > 0 ? (holding.weight_pct / maxWeight) * 100 : 0}%` }} />
                        </span>
                        <span className="oa-mono text-right text-[14px] tabular-nums text-oa-fg">{holding.weight_pct.toFixed(2)}%</span>
                      </>
                    );
                    const cls = "grid min-h-11 grid-cols-[1.5rem_minmax(0,1fr)_4rem] items-center gap-3 px-3.5 py-1.5 sm:grid-cols-[1.5rem_minmax(0,1fr)_7rem_4rem]";
                    return (
                      <li key={`${holding.symbol}-${holding.name}`}>
                        {linked ? (
                          <a href={`/stock/${holding.symbol}`} className={`${cls} outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent`}>
                            {body}
                          </a>
                        ) : (
                          <div className={cls}>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="border-t border-oa-border bg-oa-bg px-3.5 py-2">
                  <AsOfLine asOf={asset.profile_as_of} prefix="Weights as the fund last reported them" />
                </div>
              </div>
              {asset.sectors.length > 0 ? (
                <div className="oa-surface h-fit overflow-hidden border border-oa-border bg-oa-card">
                  <div className="border-b border-oa-border px-3.5 py-2">
                    <h3 className="oa-label">Sector mix</h3>
                  </div>
                  <ul className="flex flex-col gap-2.5 px-3.5 py-3">
                    {asset.sectors.map((sector) => (
                      <li key={sector.sector} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1">
                        <span className="truncate text-[14px] capitalize leading-4 text-oa-fg">{sector.sector}</span>
                        <span className="oa-mono text-right text-[12.5px] tabular-nums text-oa-muted-fg">{sector.weight_pct.toFixed(1)}%</span>
                        <span aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-oa-bg">
                          <span className="block h-full rounded-full bg-oa-muted-fg/50" style={{ width: `${Math.min(100, sector.weight_pct)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : null}

      {asset.class === "commodity" && asset.curve.length >= 2 ? (
        <>
          <SectionLabel aside="price by delivery month">Futures curve</SectionLabel>
          <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
            <CurveChart
              points={asset.curve.map((point) => ({ label: point.label, value: point.price, prior: null }))}
              format={(value) => formatLevel(value, asset.unit)}
              nowLabel={`${asset.name}, latest`}
              minSpan={Math.abs(asset.price) * 0.02}
            />
            {structureReading(asset) ? (
              <div className="border-t border-oa-border bg-oa-bg px-3.5 py-2">
                <p className="text-[12.5px] leading-[18px] text-oa-fg">{structureReading(asset)}</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {asset.class === "rate" ? <YieldCurveChart curve={data.treasury} href={null} /> : null}
      {(asset.class === "option" && asset.group === "volatility") || asset.id === "vix" ? <VolCurveChart curve={data.volCurve} href={asset.id === "vix" ? classHref("options") : null} /> : null}

      {peers.length > 0 ? (
        <AssetClassCard title={`More ${info.title.toLowerCase()}`} href={classHref(info.slug)} assets={peers} limit={6} />
      ) : null}

      <p className="max-w-3xl text-[12.5px] leading-5 text-oa-muted-fg">
        Public data, may be delayed. Not investment advice.
      </p>
    </MarketsPageFrame>
  );
}

/* ── prediction market ──────────────────────────────────────────────────── */

async function PredictionPage({ market }: { market: PredictionMarket }) {
  const history = market.has_history ? await getPredictionHistory(market.id) : [];
  const top = Math.max(...market.outcomes.map((outcome) => outcome.probability));
  const reading = predictionReading(market);
  const hidden = market.outcome_count - market.outcomes.length;
  const dayVolume =
    market.volume_24h !== null && market.volume_24h > 0
      ? market.volume_unit === "usd"
        ? formatCompactUsd(market.volume_24h)
        : `${formatCompactNumber(market.volume_24h)} contracts`
      : null;

  return (
    <MarketsPageFrame>
      <Crumbs items={[{ label: "Markets", href: "/markets" }, { label: "Prediction markets", href: classHref("predictions") }, { label: market.topic }]} />

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 max-w-3xl flex-col gap-1.5">
          <p className="oa-caption">
            {market.topic} · {market.source_name}
          </p>
          <h1 className="text-[24px] font-medium leading-8 tracking-tight text-oa-fg">{market.question}</h1>
          {market.detail ? <p className="text-[14px] leading-5 text-oa-muted-fg">{market.detail}</p> : null}
          {reading ? <p className="text-[14px] leading-[21px] text-oa-fg">{reading}</p> : null}
          <AsOfLine asOf={market.as_of} />
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <a
            href={market.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="oa-mono inline-flex h-8 items-center rounded-lg border border-oa-border bg-oa-card px-3 text-[12.5px] uppercase tracking-[0.06em] text-oa-fg outline-none transition-colors hover:border-oa-fg/40 focus-visible:ring-2 focus-visible:ring-oa-ring"
          >
            Open on {market.source_name} ↗
          </a>
          <WatchButton assetId={market.id} label={market.question} />
        </span>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="oa-surface h-fit overflow-hidden border border-oa-border bg-oa-card">
          <div className="flex items-center justify-between gap-3 border-b border-oa-border px-3.5 py-2">
            <h2 className="oa-label">Outcomes</h2>
            <span className="oa-mono text-[12.5px] text-oa-muted-fg">24h change · odds</span>
          </div>
          <ul className="flex flex-col gap-3 px-3.5 py-3">
            {market.outcomes.map((outcome) => (
              <OutcomeRow key={outcome.label} outcome={outcome} lead={outcome.probability === top} />
            ))}
          </ul>
          <p className="oa-mono border-t border-oa-border bg-oa-bg px-3.5 py-2 text-[12.5px] leading-4 text-oa-muted-fg">
            {hidden > 0 ? `${hidden} less likely ${hidden === 1 ? "outcome" : "outcomes"} not shown.` : null}
          </p>
        </div>
        <ProbabilityChart series={history} />
      </div>

      <StatGrid>
        <Stat label="Traded, 24h" value={dayVolume} />
        <Stat label="Traded, all time" value={formatPredictionVolume(market)?.replace(" traded", "") ?? null} />
        <Stat label="Trading closes" value={formatDay(market.close_time, true)} sub={formatAsOf(market.close_time)?.includes("ET") ? formatAsOf(market.close_time) : undefined} />
        <Stat label="Outcomes listed" value={String(market.outcome_count)} />
      </StatGrid>

      <SectionLabel aside={market.rules_outcome ? `as written for "${market.rules_outcome}"` : undefined}>How it resolves</SectionLabel>
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-3">
        {market.rules ? (
          <p className="max-w-3xl whitespace-pre-line break-words text-[14px] leading-[21px] text-oa-fg">{market.rules}</p>
        ) : (
          <p className="text-[14px] leading-5 text-oa-muted-fg">The venue did not publish rules text through its API for this market. Read them on the market page.</p>
        )}
        <p className="oa-mono mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-oa-border pt-2.5 text-[12.5px] leading-4 text-oa-muted-fg">
          <span>Rules quoted from {market.source_name}, unedited.</span>
          {market.settlement_sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
              Settles on: {source.name} ↗
            </a>
          ))}
          <a href={market.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Full market on {market.source_name} ↗
          </a>
        </p>
      </div>

      <p className="max-w-3xl text-[12.5px] leading-5 text-oa-muted-fg">
        Prediction market prices are what traders are paying, not a forecast we make. Thin markets can be moved by one trade. Information, not advice.
      </p>
    </MarketsPageFrame>
  );
}
