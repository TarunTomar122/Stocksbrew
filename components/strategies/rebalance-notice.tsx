import Link from "next/link";

import { longDay } from "@/components/backtest/format";
import { StockLogo } from "@/components/stock-logo";
import { getSessionUser } from "@/lib/auth-server";
import { can } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { newYorkToday } from "@/lib/portfolio-data";
import { readTrackedStrategies } from "@/lib/strategies";
import { dayBefore, getRebalancesSince, REBALANCE_FRESH_DAYS, recentForFollowed } from "@/lib/strategies-rebalances";
import { getUserDoc } from "@/lib/watchlist";

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";
const H2 = "text-pretty text-[16px] font-semibold leading-[22px] tracking-[-0.005em] text-oa-fg sm:text-[17px] sm:leading-6";

/**
 * On My stocks, for Pro: the strategies the person follows that rebalanced in the
 * last few days, each with what changed in one line. Renders nothing otherwise,
 * so it never takes space from the page when there is no news.
 */
export async function FollowedRebalances() {
  const session = await getSessionUser();
  if (!session) return null;
  const viewer = await getViewer();
  // The card names today's basket, so it needs the basket's gate as well as the follow one.
  if (!can("followed_strategies", viewer.plan) || !can("strategy_holdings", viewer.plan)) return null;
  const userDoc = await getUserDoc(session.uid).catch(() => null);
  const slugs = readTrackedStrategies(userDoc).map((entry) => entry.slug);
  if (slugs.length === 0) return null;
  const since = dayBefore(newYorkToday(), REBALANCE_FRESH_DAYS);
  const items = recentForFollowed(await getRebalancesSince(since).catch(() => []), slugs, since);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="rebalances-head" className={CARD}>
      <h2 id="rebalances-head" className={`${H2} px-4 pt-3.5`}>
        {items.length === 1 ? `${items[0].name} rebalanced on ${longDay(items[0].date)}` : `${items.length} strategies you follow rebalanced`}
      </h2>
      <ul className="mt-1.5 divide-y divide-oa-border">
        {items.map((item) => {
          return (
            <li key={`${item.slug}-${item.date}`}>
              <Link href={`/strategies/${item.slug}#rebalance`} className="block px-4 py-2.5 hover:bg-oa-accent">
                {items.length > 1 ? (
                  <span className="block text-[14px] font-medium leading-5 text-oa-fg">
                    {item.name} <span className="oa-mono text-[12.5px] font-normal tabular-nums text-oa-muted-fg">{longDay(item.date)}</span>
                  </span>
                ) : null}
                <span className="block text-[13.5px] leading-5 text-oa-fg">{item.headline}</span>
                <Chips label="In" tone="text-signal-bullish" symbols={item.added.map((row) => row.symbol)} />
                <Chips label="Out" tone="text-signal-bearish" symbols={item.removed.map((row) => row.symbol)} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "In  [logo] TXN  [logo] ADI  and 3 more": up to five names on one wrapping line. */
function Chips({ label, tone, symbols }: { label: string; tone: string; symbols: string[] }) {
  if (symbols.length === 0) return null;
  const shown = symbols.slice(0, 5);
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
      <span className={`w-7 font-semibold ${tone}`}>{label}</span>
      {shown.map((symbol) => (
        <span key={symbol} className="oa-mono inline-flex items-center gap-1 text-oa-fg">
          <StockLogo ticker={symbol} size={16} />
          {symbol}
        </span>
      ))}
      {symbols.length > shown.length ? <span className="text-oa-muted-fg">and {symbols.length - shown.length} more</span> : null}
    </span>
  );
}
