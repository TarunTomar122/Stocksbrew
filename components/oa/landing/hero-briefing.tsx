import { SquircleSurface } from "@/components/oa/squircle";
import { sharedCache } from "@/lib/shared-cache";
import { StockLogo } from "@/components/stock-logo";
import {
  getLandingAnomalies,
  resolveLandingHeroFeatured,
} from "@/components/terminal-landing-streams";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { buildLandingHeroMetrics } from "@/lib/landing-hero-metrics";
import { getCurrentMarket } from "@/lib/market";
import { plainAction, plainFinance, shortCompanyName, wholeSentences } from "@/lib/plain-copy";
import { getPowerTradesCached, type PowerTrade } from "@/lib/power-trades";
import { getRedditCues, hasRedditBrief } from "@/lib/reddit-cues";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { getStockFacts, getStockIntelligenceDoc } from "@/lib/stock";

import {
  ChangeText,
  LABEL,
  fmtAmountRange,
  fmtDay,
  fmtPrice,
  initials,
  toneClass,
} from "./shared";

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes
    .map(
      (c, i) =>
        `${((i / (closes.length - 1)) * 100).toFixed(2)},${(30 - ((c - min) / range) * 26).toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" className="h-12 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--oa-primary)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] leading-5 text-oa-muted-fg">{label}</p>
      <p className="text-[15px] font-medium leading-6 tabular-nums text-oa-fg">
        {value}
        {sub ? <span className="ml-1.5 font-normal text-oa-muted-fg">{sub}</span> : null}
      </p>
    </div>
  );
}

/** One line of the briefing that is not the lead item. */
function BriefLine({
  href,
  kind,
  avatar,
  children,
  meta,
  metaTone = "flat",
}: {
  href: string;
  kind: string;
  avatar: React.ReactNode;
  children: React.ReactNode;
  meta?: string;
  metaTone?: "up" | "down" | "flat";
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-[18px] border border-oa-border bg-oa-card px-3.5 py-3 outline-none transition-colors hover:border-oa-fg/25 focus-visible:border-oa-fg/40"
    >
      <span className="mt-0.5 shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className={LABEL}>{kind}</span>
          {meta ? (
            <span className={`whitespace-nowrap text-[13px] tabular-nums ${toneClass(metaTone)}`}>{meta}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[15px] leading-6 text-oa-fg/85">{children}</span>
      </span>
    </a>
  );
}

function pickTrade(trades: PowerTrade[], ticker: string): PowerTrade | null {
  // Newest disclosure first: that is the day the public could have known.
  return (
    [...trades]
      .filter((t) => t.ticker?.toUpperCase() === ticker.toUpperCase() && (t.tx_type === "buy" || t.tx_type === "sell"))
      .sort((a, b) => (b.disclosure_date ?? "").localeCompare(a.disclosure_date ?? ""))[0] ?? null
  );
}

/**
 * The hero's right side: today's briefing, built from the same live data the
 * app reads. One lead stock with its call, plus a disclosed trade or what
 * investors are saying, but only when it is about that same stock. Nothing
 * here is scripted.
 */
/**
 * Everything the card needs, read once and cached together. Before, the card
 * waited on three rounds of store reads in a row on every visit; now a visit
 * inside the window is one cache hit.
 */
const getHeroBriefingData = sharedCache(
  async () => {
    const market = getCurrentMarket();
    const [anomalies, trades, reddit] = await Promise.all([
      getLandingAnomalies(),
      getPowerTradesCached(60).catch(() => null),
      getRedditCues(market).catch(() => null),
    ]);
    const featured = await resolveLandingHeroFeatured(anomalies);
    if (!featured) throw new Error("landing_hero_empty");
    const { anomaly, priceHistory } = featured;
    const [intelligence, stockFacts] = await Promise.all([
      getStockIntelligenceDoc(anomaly.instrument_id, market).catch(() => null),
      getStockFacts(anomaly.instrument_id).catch(() => null),
    ]);
    const buzz =
      (reddit?.tickers ?? []).find(
        (t) => hasRedditBrief(t) && t.ticker.toUpperCase() === anomaly.ticker.toUpperCase(),
      ) ?? null;
    return {
      anomaly,
      closes: priceHistory.slice(-90).map((p) => p.close),
      directiveV2: intelligence?.directive_v2 ?? null,
      analystTarget: stockFacts?.analyst?.target_price ?? null,
      trade: pickTrade(trades?.trades ?? [], anomaly.ticker) ?? null,
      buzz,
    };
  },
  ["landing-hero-briefing-v1"],
  { revalidate: 120 },
);

export async function HeroBriefing() {
  const market = getCurrentMarket();
  const featured = await getHeroBriefingData().catch(() => null);

  if (!featured) {
    return (
      <SquircleSurface className="w-full border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="flex h-72 items-center justify-center rounded-[22px] bg-oa-bg px-6 text-center text-base text-oa-muted-fg sm:h-80">
          Today&apos;s briefing is being put together. It lands in a few minutes.
        </div>
      </SquircleSurface>
    );
  }

  const { anomaly, analystTarget, trade, buzz } = featured;
  const directive = normalizeDirectiveForUi(featured.directiveV2);
  const metrics = buildLandingHeroMetrics(directive, anomaly.price, analystTarget);

  const moveReason =
    anomaly.move_explanation?.headline?.trim() ||
    anomaly.headline?.trim() ||
    anomaly.catalyst?.trim() ||
    null;
  // The engine's label in plain words ("Accumulate on pullbacks" -> "Buy more on a dip, not here"), as on the stock page.
  const callText = plainAction(directive?.text, null);
  // Only say why it moved when we actually researched a reason.
  const why = moveReason ? wholeSentences(plainFinance(moveReason), 1) || moveReason : null;
  const closes = featured.closes;
  const name = shortCompanyName(anomaly.name) || anomaly.ticker;
  const fromHere = (price: number) => {
    if (!(anomaly.price > 0)) return undefined;
    const pct = ((price - anomaly.price) / anomaly.price) * 100;
    return `${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? "above" : "below"} today`;
  };
  const mood = (sentiment: string | null | undefined) =>
    sentiment === "bearish" ? "Mostly worried" : sentiment === "bullish" ? "Mostly hopeful" : sentiment ? "Mixed" : undefined;

  const stats: { label: string; value: string; sub?: string }[] = [];
  // Zones are only public on the showcase stocks; on any other stock
  // they come with covering it, so the landing page must not hand them out.
  const showcase = isFeaturedStockTicker(anomaly.ticker);
  if (showcase && metrics.accumulate_below != null) {
    stats.push({ label: "We'd buy more below", value: `$${metrics.accumulate_below.toFixed(0)}`, sub: fromHere(metrics.accumulate_below) });
  }
  if (showcase && metrics.trim_above != null) {
    stats.push({ label: "We'd sell some above", value: `$${metrics.trim_above.toFixed(0)}`, sub: fromHere(metrics.trim_above) });
  }
  if (typeof analystTarget === "number" && analystTarget > 0 && anomaly.price > 0) {
    stats.push({
      label: "Analysts' average target",
      value: `$${analystTarget.toFixed(0)}`,
      sub: fromHere(analystTarget),
    });
  }
  // No risk/reward ratio here: it is built from our zones, and the call
  // engine's backtests showed no edge we could stand behind on the front page.

  // Trade and buzz are only about the lead stock, so the card reads as one story.

  return (
    <figure className="w-full">
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
          <h2 className="ml-1 flex items-center gap-2 text-base font-medium text-oa-fg/80">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            One stock from today&apos;s briefing
          </h2>
        </div>

        <SquircleSurface className="gap-2 rounded-[22px] bg-oa-bg p-2 [--card-clip-radius:12px] sm:rounded-[44px] sm:p-2.5 sm:[--card-clip-radius:17px]">
          {/* lead item: the move, the reason, the call */}
          <a
            href={`/stock/${anomaly.ticker}`}
            className="block rounded-[18px] border border-oa-border bg-oa-card p-4 outline-none transition-colors hover:border-oa-fg/25 focus-visible:border-oa-fg/40"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <StockLogo
                  ticker={anomaly.ticker}
                  market={market === "IN" ? "IN" : "US"}
                  size={26}
                  circle
                  eager
                />
                <p className="min-w-0 text-[15px] leading-5 text-oa-muted-fg">
                  <span className="font-medium text-oa-fg">{name}</span> <span className="oa-mono">{anomaly.ticker}</span>
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-medium tabular-nums tracking-tight text-oa-fg">
                {fmtPrice(anomaly.price)}
              </span>
              <ChangeText pct={anomaly.day_change_pct ?? 0} className="text-base font-medium" />
            </div>
            {why ? (
              <p className="mt-2 text-[15px] leading-6 text-oa-fg/85">
                <span className="font-medium text-oa-fg">Why it moved: </span>
                {why}
              </p>
            ) : null}
            {callText ? (
              <p className="mt-2 text-[15px] leading-6 text-oa-fg/85">
                <span className="font-medium text-oa-fg">Our call: </span>
                {callText}.
              </p>
            ) : null}
            {!why && !callText ? <p className="mt-2 text-[15px] leading-6 text-oa-fg/85">We have not found a confirmed reason for today&apos;s move yet.</p> : null}
            {stats.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-oa-border pt-3">
                {stats.map((s) => (
                  <Stat key={s.label} {...s} />
                ))}
              </div>
            ) : null}
            {closes.length > 1 ? (
              <div className="mt-2">
                <Sparkline closes={closes} />
                <p className="text-[13px] leading-5 text-oa-muted-fg">Price over the last {closes.length >= 80 ? "3 months" : `${closes.length} trading days`}</p>
              </div>
            ) : null}
          </a>

          {trade ? (
            <BriefLine
              href="/follow?tab=congress"
              kind="Congress"
              meta={trade.disclosure_date ? `Filed ${fmtDay(trade.disclosure_date)}` : undefined}
              avatar={
                <span
                  aria-hidden="true"
                  className="flex size-[26px] items-center justify-center rounded-full bg-oa-secondary text-[11px] font-medium text-oa-secondary-fg"
                >
                  {initials(trade.person_name)}
                </span>
              }
            >
              {trade.person_name} {trade.tx_type === "buy" ? "bought" : "sold"}{" "}
              <span className="oa-mono text-oa-fg">{trade.ticker}</span>,{" "}
              {fmtAmountRange(trade.amount_low, trade.amount_high).toLowerCase()}.
            </BriefLine>
          ) : null}

          {buzz ? (
            <BriefLine
              href={`/stock/${buzz.ticker}`}
              kind="On Reddit"
              meta={mood(buzz.sentiment)}
              avatar={<StockLogo ticker={buzz.ticker} size={26} circle />}
            >
              {wholeSentences(buzz.summary, 1) || buzz.summary}
            </BriefLine>
          ) : null}
        </SquircleSurface>
      </SquircleSurface>
    </figure>
  );
}
