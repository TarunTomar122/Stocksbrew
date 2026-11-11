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
import { companyFirstMove, plainAction, plainCallReason, plainFinance, shortCompanyName, wholeSentences } from "@/lib/plain-copy";
import { getPowerTradesCached, type PowerTrade } from "@/lib/power-trades";
import { isFeaturedStockTicker } from "@/lib/seo/stock-pages";
import { getStockFacts, getStockIntelligenceDoc } from "@/lib/stock";
import { callWord } from "@/lib/stock-chart";
import { getScreenerRows } from "@/lib/screener";
import { matchingCompanyReason } from "@/lib/stock-read";

import {
  ChangeText,
  fmtAmountRange,
  fmtDay,
  fmtPrice,
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
        {/* Its own line on phones, so "84% above today" never breaks away from the price. */}
        {sub ? <span className="block font-normal text-[13px] leading-5 text-oa-muted-fg sm:ml-1.5 sm:inline sm:text-[15px] sm:leading-6">{sub}</span> : null}
      </p>
    </div>
  );
}

/**
 * Where today's price sits between the price where we'd buy more and the price
 * where we'd sell some: one look says how close it is to either.
 */
function ZoneBar({ price, add, trim }: { price: number; add: number; trim: number }) {
  const ZONE = 16; // percent of the track each end zone takes
  const t = (price - add) / (trim - add);
  const pos = Math.min(97, Math.max(3, ZONE + t * (100 - 2 * ZONE)));
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-oa-bg" role="img" aria-label={`Today's price, ${fmtPrice(price)}, between the price where we'd buy more (${fmtWhole(add)}) and where we'd sell some (${fmtWhole(trim)}).`}>
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-[color-mix(in_srgb,var(--signal-bullish)_35%,transparent)]" style={{ width: `${ZONE}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-[color-mix(in_srgb,var(--signal-bearish)_35%,transparent)]" style={{ width: `${ZONE}%` }} />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card bg-oa-fg shadow-sm" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-4 text-[13px] leading-5 text-oa-muted-fg">
        <span>
          We&apos;d buy more below <span className="font-medium tabular-nums text-oa-fg">{fmtWhole(add)}</span>
        </span>
        <span className="text-right">
          We&apos;d sell some above <span className="font-medium tabular-nums text-oa-fg">{fmtWhole(trim)}</span>
        </span>
      </div>
    </div>
  );
}

const fmtWhole = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** "Nov 10, 4:00 PM ET" in New York time, or "" without a usable time. */
function stampET(iso: string | null | undefined): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  const day = at.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day}, ${time} ET`;
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
 * The hero's right side: one moment from today's briefing, built from the same
 * live data the app reads. What it noticed about one stock (the move, its
 * reason, a disclosed trade in that same stock), what that means if you own
 * it, and the next step: watch it. Nothing here is scripted.
 */
/**
 * Everything the card needs, read once and cached together. Before, the card
 * waited on three rounds of store reads in a row on every visit; now a visit
 * inside the window is one cache hit.
 */
const getHeroBriefingData = sharedCache(
  async () => {
    const market = getCurrentMarket();
    const [anomalies, trades] = await Promise.all([
      getLandingAnomalies(),
      getPowerTradesCached(60).catch(() => null),
    ]);
    const featured = await resolveLandingHeroFeatured(anomalies);
    if (!featured) throw new Error("landing_hero_empty");
    const { anomaly, priceHistory } = featured;
    const [intelligence, stockFacts, screenerRow] = await Promise.all([
      getStockIntelligenceDoc(anomaly.instrument_id, market).catch(() => null),
      getStockFacts(anomaly.instrument_id).catch(() => null),
      // The reason under the call written from this company's own numbers (the same one the stock page shows).
      market === "US"
        ? getScreenerRows([anomaly.ticker]).then((rows) => rows.get(anomaly.ticker.toUpperCase()) ?? null).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      anomaly,
      closes: priceHistory.slice(-90).map((p) => p.close),
      directiveV2: intelligence?.directive_v2 ?? null,
      companyReason: screenerRow?.call_reason
        ? { text: screenerRow.call_reason, call: screenerRow.call ?? null, source: screenerRow.call_reason_source ?? null }
        : null,
      analystTarget: stockFacts?.analyst?.target_price ?? null,
      trade: pickTrade(trades?.trades ?? [], anomaly.ticker) ?? null,
    };
  },
  ["landing-hero-briefing-v2"],
  { revalidate: 120 },
);

/** The stock the hero card shows today, so the sections below can leave it out instead of saying it twice. */

/** The call reason's label, so it never reads as the reason for today's move. */
const WHY_LABEL: Record<string, string> = { Add: "Why we'd buy more", Hold: "Why we'd keep it", Trim: "Why we'd sell some" };
export async function heroTicker(): Promise<string | null> {
  const data = await getHeroBriefingData().catch(() => null);
  return data?.anomaly.ticker?.toUpperCase() ?? null;
}

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

  const { anomaly, analystTarget, trade } = featured;
  const directive = normalizeDirectiveForUi(featured.directiveV2);
  const metrics = buildLandingHeroMetrics(directive, anomaly.price, analystTarget);

  const moveReason =
    anomaly.move_explanation?.headline?.trim() ||
    anomaly.headline?.trim() ||
    anomaly.catalyst?.trim() ||
    null;
  // The engine's label in plain words ("Accumulate on pullbacks" -> "Buy more on a dip, not here"), as on the stock page.
  const callText = plainAction(directive?.text, null);
  // The call's own reason, one whole sentence, so the example says why and not only what.
  // Reasons are part of the full report, which is only public on the showcase stocks (same rule as the price levels below).
  // The company reason (its numbers, then what would change the call) when it was written for this same call; else the brief's line.
  const companyReason = matchingCompanyReason(featured.companyReason, callWord(featured.directiveV2?.stance));
  const reasonSource = companyReason ?? directive?.rationale ?? "";
  // One sentence: the card is the call and its main reason; the rest of the thinking is one tap away on the stock page.
  const callReason = isFeaturedStockTicker(anomaly.ticker) && reasonSource ? wholeSentences(plainCallReason(reasonSource), 1) : "";
  // Only say why it moved when we actually researched a reason.
  const why = moveReason ? wholeSentences(plainFinance(moveReason), 1) || moveReason : null;
  const closes = featured.closes;
  const name = shortCompanyName(anomaly.name) || anomaly.ticker;
  const fromHere = (price: number) => {
    if (!(anomaly.price > 0)) return undefined;
    const pct = ((price - anomaly.price) / anomaly.price) * 100;
    // "0% below today" reads as a mistake; within half a percent it is today's price.
    if (Math.abs(pct) < 0.5) return "about today's price";
    return `${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? "above" : "below"} today`;
  };

  // Zones are only public on the showcase stocks; on any other stock
  // they come with covering it, so the landing page must not hand them out.
  const showcase = isFeaturedStockTicker(anomaly.ticker);
  // A level more than half the price away says little about today; the call engine still sets some that far out.
  const near = (level: number) => anomaly.price > 0 && Math.abs(level - anomaly.price) / anomaly.price <= 0.5;
  const add = showcase && metrics.accumulate_below != null && near(metrics.accumulate_below) ? metrics.accumulate_below : null;
  const trim = showcase && metrics.trim_above != null && near(metrics.trim_above) ? metrics.trim_above : null;
  const zoneBar = add != null && trim != null && trim > add && anomaly.price > 0 ? { add, trim } : null;
  // Without both levels, the one figure that still says something about the price.
  const stats: { label: string; value: string; sub?: string }[] = [];
  if (!zoneBar) {
    if (add != null) stats.push({ label: "We'd buy more below", value: fmtWhole(add), sub: fromHere(add) });
    if (trim != null) stats.push({ label: "We'd sell some above", value: fmtWhole(trim), sub: fromHere(trim) });
    if (typeof analystTarget === "number" && analystTarget > 0 && near(analystTarget)) {
      stats.push({ label: "Price analysts expect, on average", value: fmtWhole(analystTarget), sub: fromHere(analystTarget) });
    }
  }
  // No risk/reward ratio here: it is built from our zones, and the call
  // engine's backtests showed no edge we could stand behind on the front page.

  const pct = Number.isFinite(anomaly.day_change_pct) ? anomaly.day_change_pct : null;
  // The move in words, only when we have one; a small move needs no "no reason yet".
  const moved = pct == null ? "" : Math.abs(pct) < 0.05 ? `${name} barely moved.` : `${name} ${pct > 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}%.`;
  // Sentence one of the takeaway: the move with its reason, company first ("Hims & Hers fell after earnings that
  // missed expectations."), or the move and the honest "no confirmed reason yet". The size is in the row above.
  const turnedWhy = why && pct != null ? companyFirstMove(why.replace(/[.!]$/, ""), pct, { company: { name: anomaly.name || name, ticker: anomaly.ticker } }) : null;
  const takeaway = turnedWhy
    ? `${turnedWhy}.`
    : why
      ? // The reason alone: the size of the move is in the row above, and "rose 4%" next to a reason that
        // reads the other way would contradict itself.
        why
      : pct != null && Math.abs(pct) >= 0.5
        ? `${name} ${pct > 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}% today, and we haven't found a confirmed reason yet.`
        : moved;
  const when = stampET(anomaly.price_as_of);
  const watchHref = `/agents?watch=${encodeURIComponent(anomaly.ticker)}`;

  return (
    <figure className="w-full">
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pb-2 pl-3.5 pr-3 pt-1.5">
          <h2 className="ml-1 flex items-center gap-2 text-base font-medium text-oa-fg/80">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {/* "Stood out" only when it did: a quiet day still shows a stock, without the claim. */}
            {pct != null && Math.abs(pct) >= 2 ? "What stood out today" : "One of the stocks we watch, today"}
          </h2>
          {when ? <p className="ml-5 text-[13px] tabular-nums text-oa-muted-fg">{when}</p> : null}
        </div>

        <SquircleSurface className="gap-2 rounded-[22px] bg-oa-bg p-2 [--card-clip-radius:12px] sm:rounded-[44px] sm:p-2.5 sm:[--card-clip-radius:17px]">
          {/* One moment, start to end: what it saw, what that means if you own the stock, and the next step. */}
          <div className="rounded-[18px] border border-oa-border bg-oa-card p-4">
            <a href={`/stock/${anomaly.ticker}`} className="flex items-center justify-between gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-oa-fg/20">
              <span className="flex min-w-0 items-center gap-2.5">
                <StockLogo ticker={anomaly.ticker} market={market === "IN" ? "IN" : "US"} size={26} circle eager />
                <span className="min-w-0 text-[15px] leading-5 text-oa-muted-fg">
                  <span className="font-medium text-oa-fg">{name}</span> <span className="oa-mono">{anomaly.ticker}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[17px] font-medium tabular-nums text-oa-fg">{fmtPrice(anomaly.price)}</span>
                {pct != null ? <ChangeText pct={pct} className="text-[15px] font-medium" /> : null}
              </span>
            </a>

            {/* The takeaway in two sentences (what happened, what we'd do), then the button; the evidence sits under it. */}
            {takeaway || callText ? (
              <p className="mt-3 text-pretty text-[15px] leading-6 text-oa-fg">
                {takeaway ? <span className="text-oa-fg/85">{takeaway}</span> : null}
                {callText ? <span className="font-medium">{takeaway ? " " : ""}{callText}.</span> : null}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href={watchHref}
                data-track="landing_cta_clicked"
                data-track-surface="hero_watch"
                className="inline-flex h-10 items-center rounded-full bg-oa-fg px-4 text-[14px] font-medium text-oa-page outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-oa-fg/30"
              >
                Watch {name} for me
              </a>
              <a href={`/stock/${anomaly.ticker}`} className="text-[14px] font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
                Read our full view of {name}
              </a>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">It checks {name} every market day and emails you only when something happens.</p>

            {callReason || zoneBar || stats.length > 0 || trade || closes.length > 1 ? (
              <div className="mt-3.5 border-t border-oa-border pt-3">
                {callReason ? (
                  <p className="text-pretty text-[14px] leading-[22px] text-oa-fg/85">
                    {/* The reason for the call, not for today's move (which has its own line above). */}
                    <span className="font-medium text-oa-fg">{WHY_LABEL[callWord(featured.directiveV2?.stance) ?? ""] ?? "Why this call"}: </span>
                    {callReason}
                  </p>
                ) : null}
                {zoneBar ? <ZoneBar price={anomaly.price} add={zoneBar.add} trim={zoneBar.trim} /> : null}
                {stats.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {stats.map((s) => (
                      <Stat key={s.label} {...s} />
                    ))}
                  </div>
                ) : null}
                {/* The price line only when there is no level bar: one picture per card. */}
                {!zoneBar && closes.length > 1 ? (
                  <div className="mt-2">
                    <Sparkline closes={closes} />
                    <p className="text-[13px] leading-5 text-oa-muted-fg">Price over the last {closes.length >= 80 ? "3 months" : `${closes.length} trading days`}</p>
                  </div>
                ) : null}
                {trade ? (
                  <p className="mt-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">
                    {trade.person_name}, a member of Congress, {trade.tx_type === "buy" ? "bought" : "sold"} {fmtAmountRange(trade.amount_low, trade.amount_high).toLowerCase()} of it
                    {trade.disclosure_date ? ` (reported ${fmtDay(trade.disclosure_date)})` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

        </SquircleSurface>
      </SquircleSurface>
    </figure>
  );
}
