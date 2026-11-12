import { Bar } from "@/components/oa/kit/skeleton";
import { ownCallLevel } from "@/lib/call-level";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { fitWhy, levelIsNear, rankStandOut, threeMonthCloses, type HeroDemoStock } from "@/lib/landing-hero-demo";
import { getTasteCard } from "@/lib/landing-taste";
import { moveStamp, pickLines, type TasteLine } from "@/lib/landing-taste-shared";
import { shortCompanyName } from "@/lib/plain-copy";
import { getScreenerRows } from "@/lib/screener";
import { FEATURED_STOCK_TICKERS } from "@/lib/seo/stock-pages";
import { sharedCache } from "@/lib/shared-cache";
import { getStockIntelligenceDoc, getStockPriceHistory, getStockSummary } from "@/lib/stock";
import { buildStockRead } from "@/lib/stock-read";

import { HeroDemoCard } from "./hero-demo-card";

/**
 * The hero's right side: a live demo of the product on today's real data. Up to three of the showcase stocks
 * (lib/seo/stock-pages.ts, whose levels are public) that stood out today, each with its price and move, our call
 * with its own level, one short reason and three months of closes; the visitor flips between them with logo tabs.
 * The call and its reason are the landing taste's own (lib/landing-taste.ts), so typing the same ticker into the
 * search shows the same call. Renders nothing at all without data (owner rule 4: no empty card).
 */

/** How many stocks the card flips between. */
const SHOWN = 3;
/** How many of the ranked pool are read in full: a stock without a current call drops out, so read a few spare. */
const READ = 5;

type Loaded = { stock: HeroDemoStock; lines: TasteLine[] };

/**
 * One stock, or null when it has no current call or price. A failed read throws rather than returning less: the
 * result is shared for everyone (sharedCache), and a blip must not leave a card with one stock and no chart cached.
 */
async function loadStock(ticker: string): Promise<Loaded | null> {
  const [card, stock] = await Promise.all([getTasteCard(ticker), getStockSummary(ticker, "US")]);
  if (!card?.call || !stock || !(typeof stock.price === "number" && stock.price > 0)) return null;
  const [intelligence, history] = await Promise.all([getStockIntelligenceDoc(stock.instrument_id, "US"), getStockPriceHistory(stock.instrument_id)]);
  const zones = buildStockRead(intelligence)?.zones ?? null;
  const own = zones ? ownCallLevel(card.call, zones) : null;
  const shown: HeroDemoStock = {
    ticker: card.ticker,
    name: shortCompanyName(card.name) || card.ticker,
    price: stock.price,
    dayPct: card.dayPct,
    priceAt: card.priceAt,
    call: card.call,
    level: own && levelIsNear(own.price, stock.price) ? own : null,
    why: null,
    closes: threeMonthCloses(history, stock.price),
  };
  // Only lines that fit the card's word budget compete for it, a trailing comparison dropped when that makes one fit.
  const lines = card.lines.flatMap((line) => {
    const text = fitWhy(line.text);
    return text ? [{ ...line, text }] : [];
  });
  return { stock: shown, lines };
}

const getHeroDemo = sharedCache(
  async (): Promise<HeroDemoStock[]> => {
    const [rows, anomalies] = await Promise.all([
      getScreenerRows(FEATURED_STOCK_TICKERS),
      // Puts a move with a confirmed reason first; without the feed the order is by the size of the move alone.
      getDailyAnomalies("US")
        .then((doc) => doc?.anomalies ?? [])
        .catch(() => []),
    ]);
    if (rows.size === 0) throw new Error("hero_demo_no_rows");
    const explained = new Set(anomalies.filter((row) => row.move_explanation?.headline?.trim()).map((row) => row.ticker.toUpperCase()));
    const order = rankStandOut(FEATURED_STOCK_TICKERS, (ticker) => rows.get(ticker)?.day_pct ?? null, (ticker) => explained.has(ticker));
    const loaded = (await Promise.all(order.slice(0, READ).map(loadStock))).filter((item): item is Loaded => item !== null);
    // A stock with a reason that fits makes the better demo; the move order holds within each group.
    const chosen = [...loaded].sort((a, b) => Number(b.lines.length > 0) - Number(a.lines.length > 0)).slice(0, SHOWN);
    if (chosen.length === 0) throw new Error("hero_demo_empty");
    // One reason per stock, not the same kind twice in a row (the taste's own rule).
    const lines = pickLines(chosen.map((item) => ({ call: item.stock.call, lines: item.lines })));
    return chosen.map((item, index) => ({ ...item.stock, why: lines[index]?.text ?? null }));
  },
  ["landing-hero-demo-v3"],
  { revalidate: 120 },
);

export async function HeroDemo() {
  const stocks = await getHeroDemo().catch(() => null);
  if (!stocks || stocks.length === 0) return null;
  // When each price was taken, worded here on the server so the client renders the same text it hydrates.
  return <HeroDemoCard stocks={stocks} stamps={stocks.map((stock) => moveStamp(stock.priceAt))} />;
}

/** The card's shape while today's data loads: the same frame and height, so nothing jumps when it arrives. */
export function HeroDemoGhost() {
  return (
    <div aria-hidden="true" className="oa-surface w-full border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-5">
      <Bar className="h-4 w-36" />
      <div className="mt-4 flex gap-2">
        <Bar className="h-9 w-24 rounded-full" />
        <Bar className="h-9 w-24 rounded-full" />
        <Bar className="h-9 w-24 rounded-full" />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bar className="size-10 rounded-full" />
          <Bar className="h-5 w-28" />
        </div>
        <Bar className="h-7 w-24" />
      </div>
      <Bar className="mt-4 h-7 w-44" />
      <Bar className="mt-3 h-4 w-full" />
      <Bar className="mt-2 h-4 w-2/3" />
      <Bar className="mt-4 h-20 w-full" />
      <Bar className="mt-5 h-11 w-40 rounded-full" />
    </div>
  );
}
