import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { normalizeDirectiveForUi } from "@/lib/directive-ui";
import { plainAction } from "@/lib/plain-copy";
import { getLatestPriceQuotes } from "@/lib/firestore";
import { getCurrentMarket } from "@/lib/market";
import { getStockIntelligenceDoc } from "@/lib/stock";
import { sharedCache } from "@/lib/shared-cache";

import { ChangeText, EmptyRow, LABEL, fmtPrice } from "./shared";

/** An example book. Share counts are made up; prices and calls are live. */
const EXAMPLE_BOOK: { ticker: string; shares: number; held: boolean }[] = [
  { ticker: "NVDA", shares: 60, held: true },
  { ticker: "AAPL", shares: 35, held: true },
  { ticker: "MSFT", shares: 14, held: true },
  { ticker: "AMZN", shares: 30, held: true },
  { ticker: "PLTR", shares: 25, held: false },
  { ticker: "LLY", shares: 0, held: false },
];

// Blue is the one accent; the rest of the ring steps down through neutral ink.
const RING = [
  "var(--oa-primary)",
  "color-mix(in srgb, var(--oa-primary) 62%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 62%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 34%, var(--oa-card))",
  "color-mix(in srgb, var(--oa-fg) 16%, var(--oa-card))",
];

const STANCE: Record<string, { label: string; className: string }> = {
  accumulate: { label: "Buy more", className: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300" },
  hold: { label: "Hold", className: "bg-oa-accent text-oa-fg" },
  watch: { label: "Watch", className: "bg-oa-accent text-oa-fg" },
  trim: { label: "Sell some", className: "bg-amber-500/15 text-amber-900 dark:text-amber-300" },
  avoid: { label: "Avoid", className: "bg-red-600/10 text-red-800 dark:text-red-300" },
};

function fmtDollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function Ring({ slices }: { slices: { weight: number; color: string }[] }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32 shrink-0 -rotate-90 sm:size-36">
      {slices.map((slice, index) => {
        const length = slice.weight * circumference;
        const dash = `${Math.max(length - 1.2, 0)} ${circumference - Math.max(length - 1.2, 0)}`;
        const circle = (
          <circle
            key={index}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="11"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
          />
        );
        offset += length;
        return circle;
      })}
    </svg>
  );
}

/**
 * "Everything you own and follow, in one place." The left card is the book,
 * the right card is what the agent says about each name in it today.
 */
// The example book is the same for every visitor; reading a full research doc
// per name on every visit made this the slowest card on the page.
const loadExampleBook = sharedCache(
  async (market: string) => {
    const ids = EXAMPLE_BOOK.map((row) => `${market}_${row.ticker}`);
    const [quotes, intel] = await Promise.all([
      getLatestPriceQuotes(ids).catch(() => new Map()),
      Promise.all(ids.map((id) => getStockIntelligenceDoc(id, market as ReturnType<typeof getCurrentMarket>).catch(() => null))),
    ]);
    const rows = EXAMPLE_BOOK.map((row, index) => {
      const quote = quotes.get(ids[index]!)?.quote;
      const price = typeof quote?.current === "number" && quote.current > 0 ? quote.current : null;
      const changePct = typeof quote?.day_change_pct === "number" ? quote.day_change_pct : null;
      const directive = normalizeDirectiveForUi(intel[index]?.directive_v2 ?? null);
      return {
        ...row,
        price,
        changePct,
        value: price != null ? price * row.shares : 0,
        stance: directive?.stance ?? null,
        // The engine label in plain words ("Accumulate now" -> what we would do), as on the stock page.
        call: plainAction(directive?.text?.trim() || null, null) || null,
      };
    }).filter((row) => row.price != null);
    if (rows.length === 0) throw new Error("example_book_empty");
    return rows;
  },
  ["landing-example-book-v1"],
  { revalidate: 300 },
);

export async function OnePlace() {
  const market = getCurrentMarket();
  const rows = await loadExampleBook(market).catch(() => []);

  const holdings = rows.filter((row) => row.held && row.value > 0);
  const total = holdings.reduce((sum, row) => sum + row.value, 0);
  const dayChange = holdings.reduce(
    (sum, row) =>
      sum + (row.changePct != null ? row.value - row.value / (1 + row.changePct / 100) : 0),
    0,
  );
  const dayChangePct = total - dayChange > 0 ? (dayChange / (total - dayChange)) * 100 : 0;
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const slices = sorted.map((row, index) => ({
    weight: total > 0 ? row.value / total : 0,
    color: RING[Math.min(index, RING.length - 1)]!,
  }));

  if (rows.length === 0) {
    return (
      <SquircleCard title="Your stocks" seeAllHref="/watchlist">
        <EmptyRow>Prices are refreshing. Open your watchlist to see your own stocks.</EmptyRow>
      </SquircleCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
      <Reveal delay={60} className="h-full">
        <SquircleCard title="What you own" seeAllHref="/watchlist" className="h-full" contentClassName="grow px-4 py-5 sm:px-5">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Ring slices={slices} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[13px] leading-4 text-oa-muted-fg">Today</span>
                <ChangeText pct={dayChangePct} className="text-base font-medium" />
              </div>
            </div>
            <div className="min-w-0">
              <p className={LABEL}>Example portfolio</p>
              <p className="mt-1 text-3xl font-medium tabular-nums tracking-tight text-oa-fg">
                {fmtDollars(total)}
              </p>
              <p className="mt-1 text-[15px] leading-6 text-oa-muted-fg">
                Share counts are an example. Prices are live.
              </p>
            </div>
          </div>
          <ul className="mt-5 flex flex-col gap-2.5 border-t border-oa-border pt-4">
            {sorted.map((row, index) => (
              <li key={row.ticker} className="flex items-center gap-3 text-[15px]">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: slices[index]?.color }}
                />
                <StockLogo ticker={row.ticker} size={20} circle />
                <span className="oa-mono text-oa-fg">{row.ticker}</span>
                <span className="text-oa-muted-fg">{row.shares} shares</span>
                <span className="ml-auto tabular-nums text-oa-fg">
                  {((slices[index]?.weight ?? 0) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </SquircleCard>
      </Reveal>

      <Reveal delay={140} className="h-full">
        <SquircleCard title="What each one needs today" seeAllHref="/watchlist" className="h-full" contentClassName="grow py-1">
          {rows.map((row) => {
            const stance = row.stance ? STANCE[row.stance] : null;
            return (
              <a
                key={row.ticker}
                href={`/stock/${row.ticker}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
              >
                <StockLogo ticker={row.ticker} size={28} circle />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="oa-mono text-[15px] text-oa-fg">{row.ticker}</span>
                    <span className="text-[13px] text-oa-muted-fg">{row.held ? "Holding" : "Watching"}</span>
                    {stance ? (
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${stance.className}`}>
                        {stance.label}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[15px] leading-6 text-oa-muted-fg">
                    {row.call ?? "We are still researching this one."}
                  </span>
                </span>
                <span className="flex flex-col items-end text-[15px] tabular-nums">
                  <span className="text-oa-fg">{fmtPrice(row.price ?? 0)}</span>
                  {row.changePct != null ? <ChangeText pct={row.changePct} /> : null}
                </span>
              </a>
            );
          })}
        </SquircleCard>
      </Reveal>
    </div>
  );
}
