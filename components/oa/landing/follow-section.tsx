import { SquircleCard } from "@/components/oa/squircle";
import { Reveal } from "@/components/reveal";
import { StockLogo } from "@/components/stock-logo";
import { getFollowSources, type FollowSource } from "@/lib/follow";
import { getPowerTradesCached, type PowerTrade } from "@/lib/power-trades";
import { listStrategies } from "@/lib/strategies";

import { EmptyRow, H2, LEDE, RowLink, fmtAmountRange, fmtDay, fmtPct, initials, toneClass } from "./shared";

type Person = {
  id: string;
  name: string;
  chamber: string;
  party: string;
  state: string;
  trades: PowerTrade[];
};

function groupByPerson(trades: PowerTrade[]): Person[] {
  const byId = new Map<string, Person>();
  for (const trade of trades) {
    if (!trade.person_id || !trade.ticker) continue;
    const person = byId.get(trade.person_id) ?? {
      id: trade.person_id,
      name: trade.person_name,
      chamber: trade.chamber,
      party: trade.party,
      state: trade.state,
      trades: [],
    };
    person.trades.push(trade);
    byId.set(trade.person_id, person);
  }
  return [...byId.values()]
    .map((person) => ({
      ...person,
      trades: person.trades.sort((a, b) => (b.disclosure_date ?? "").localeCompare(a.disclosure_date ?? "")),
    }))
    .sort((a, b) => (b.trades[0]?.disclosure_date ?? "").localeCompare(a.trades[0]?.disclosure_date ?? ""));
}

function personLine(person: Person): string {
  const chamber = person.chamber === "senate" ? "Senate" : person.chamber === "house" ? "House" : "";
  return [chamber, [person.party, person.state].filter(Boolean).join("-")].filter(Boolean).join(", ");
}

/** The funds most people have heard of, in this order, when we have them. */
const KNOWN_FUNDS = ["berkshire-hathaway", "pershing-square", "scion-asset-management", "bridgewater-associates", "duquesne-family-office"];

function pickFunds(sources: FollowSource[], count: number): FollowSource[] {
  const funds = sources.filter((source) => source.kind === "fund" && source.top_holdings.some((holding) => holding.ticker));
  const known = KNOWN_FUNDS.map((slug) => funds.find((fund) => fund.slug === slug)).filter((fund): fund is FollowSource => Boolean(fund));
  const rest = funds
    .filter((fund) => !known.includes(fund))
    .sort((a, b) => (b.latest_date ?? "").localeCompare(a.latest_date ?? ""));
  return [...known, ...rest].slice(0, count);
}

/**
 * Two ways to borrow someone else's homework, side by side: rules that pick
 * stocks, and people whose holdings and trades are public record.
 *
 * No return figures here on purpose. A backtest and a "what following the
 * filing would have made" number are both hypothetical, and they belong on
 * the pages that carry their caveats, not on a landing page.
 */
export async function FollowSection() {
  const [strategies, sources, tradesResult] = await Promise.all([
    listStrategies().catch(() => []),
    getFollowSources().catch(() => [] as FollowSource[]),
    getPowerTradesCached(60).catch(() => null),
  ]);

  const rules = strategies.filter((strategy) => strategy.holdings > 0).slice(0, 4);
  const funds = pickFunds(sources, 3);
  const fundCount = sources.filter((source) => source.kind === "fund").length;
  const person = groupByPerson(tradesResult?.trades ?? [])[0] ?? null;

  // Both columns share the grid's rows (subgrid from lg), so the headings,
  // ledes, card tops and card bottoms line up across the page. Row 1 is the
  // heading, rows 2 to 5 are one card each, row 6 is the footnote.
  const COLUMN = "flex min-w-0 flex-col gap-3 lg:row-span-6 lg:grid lg:grid-rows-subgrid lg:gap-y-3";
  const CARD_SLOT = "min-w-0 [&>[data-slot=oa-card]]:h-full";
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2 lg:grid-rows-[auto_repeat(4,auto)_auto] lg:gap-y-3">
      <div className={COLUMN}>
        <Reveal className="mb-3">
          <h2 className={H2}>Follow a set of rules.</h2>
          <p className={LEDE}>
            Each strategy is a short list of rules applied once a month. The rules and the full record are free; Pro
            shows the basket it holds today and why each name is in it.
          </p>
        </Reveal>
          {rules.length > 0 ? (
            rules.map((strategy, index) => (
              <Reveal key={strategy.slug} delay={60 * (index + 1)} className={`${CARD_SLOT} ${index >= 2 ? "hidden lg:block" : ""}`}>
                <SquircleCard title={strategy.name} seeAllHref={`/strategies/${strategy.slug}`} seeAllLabel="Rules and record" contentClassName="flex flex-1 flex-col px-4 py-3">
                  <p className="line-clamp-2 text-pretty text-[15px] leading-6 text-oa-muted-fg">{strategy.tagline}</p>
                  {/* Today's names are part of Pro, so the card shows the record, never the basket. */}
                  <p className="mt-auto pt-3 text-[13px] leading-5 text-oa-muted-fg">
                    {strategy.holdings} {strategy.universe.kind === "funds" ? "funds" : "stocks"} · rebalanced monthly
                    {strategy.backtest?.strategy.annualized_return != null && strategy.backtest.benchmark.annualized_return != null ? (
                      <>
                        {" · backtested "}
                        <span className={toneClass(strategy.backtest.strategy.annualized_return >= 0 ? "up" : "down")}>
                          {fmtPct(strategy.backtest.strategy.annualized_return * 100)}
                        </span>
                        {` a year vs ${fmtPct(strategy.backtest.benchmark.annualized_return * 100)} for the S&P 500`}
                      </>
                    ) : null}
                  </p>
                </SquircleCard>
              </Reveal>
            ))
          ) : (
            <SquircleCard title="Strategies" seeAllHref="/strategies">
              <EmptyRow>Strategies are updating. Open the page for the rules.</EmptyRow>
            </SquircleCard>
          )}
        {/* Keep the footnote in the last row even when there are fewer than four cards. */}
        <p className="text-[14px] leading-5 text-oa-muted-fg lg:row-start-6">
          Records are backtested, not traded, and say so. Or{" "}
          <a href="/backtest" className="text-oa-fg underline decoration-oa-border underline-offset-2">
            test a mix of your own
          </a>
          .
        </p>
      </div>

      <div className={COLUMN}>
        <Reveal className="mb-3">
          <h2 className={H2}>Follow people you know.</h2>
          <p className={LEDE}>
            {fundCount > 0 ? `${fundCount} funds file what they hold every quarter. ` : ""}Members of Congress and
            company insiders have to disclose their trades.
          </p>
        </Reveal>
          {funds.map((fund, index) => (
            <Reveal key={fund.slug} delay={60 * (index + 1)} className={`${CARD_SLOT} ${index >= 2 ? "hidden lg:block" : ""}`}>
              <SquircleCard
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{fund.name}</span>
                    <span className="hidden shrink-0 font-sans text-[12.5px] font-normal normal-case tracking-normal text-oa-muted-fg sm:inline">
                      {fund.person}
                    </span>
                  </span>
                }
                seeAllHref={`/follow/${fund.slug}`}
                seeAllLabel="Portfolio"
                contentClassName="flex flex-1 flex-col px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {fund.top_holdings
                    .filter((holding) => holding.ticker)
                    .slice(0, 5)
                    .map((holding) => (
                      <a
                        key={holding.ticker}
                        href={`/stock/${encodeURIComponent(holding.ticker as string)}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-oa-border bg-oa-bg pl-1.5 pr-2 text-[13px] hover:border-oa-fg/30"
                      >
                        <StockLogo ticker={holding.ticker as string} size={16} circle />
                        <span className="oa-mono text-oa-fg">{holding.ticker}</span>
                        {typeof holding.weight === "number" ? (
                          <span className="oa-mono text-oa-muted-fg">{(holding.weight * (holding.weight <= 1 ? 100 : 1)).toFixed(0)}%</span>
                        ) : null}
                      </a>
                    ))}
                </div>
                <p className="mt-auto pt-2.5 text-[13px] leading-5 text-oa-muted-fg">
                  13F filed {fmtDay(fund.latest_date)}
                </p>
              </SquircleCard>
            </Reveal>
          ))}
          {person ? (
            <Reveal delay={240} className={CARD_SLOT}>
              <SquircleCard
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-oa-secondary font-sans text-[10px] font-medium text-oa-secondary-fg"
                    >
                      {initials(person.name)}
                    </span>
                    <span className="truncate">{person.name}</span>
                    <span className="hidden shrink-0 font-sans text-[12.5px] font-normal normal-case tracking-normal text-oa-muted-fg sm:inline">
                      {personLine(person)}
                    </span>
                  </span>
                }
                seeAllHref="/follow?tab=congress"
                seeAllLabel="Congress"
                contentClassName="py-1"
              >
                {person.trades.slice(0, 2).map((trade) => (
                  <RowLink
                    key={trade.trade_id}
                    href={`/stock/${trade.ticker}`}
                    label={
                      <>
                        <span className="flex items-center gap-2">
                          <StockLogo ticker={trade.ticker} size={18} circle />
                          <span className="oa-mono text-oa-fg">{trade.ticker}</span>
                          <span className={toneClass(trade.tx_type === "buy" ? "up" : "down")}>
                            {trade.tx_type === "buy" ? "Bought" : "Sold"}
                          </span>
                        </span>
                        <span className="line-clamp-1 text-oa-muted-fg">
                          {fmtAmountRange(trade.amount_low, trade.amount_high)}
                          {typeof trade.lag_days === "number"
                            ? `, filed ${trade.lag_days} ${trade.lag_days === 1 ? "day" : "days"} after the trade`
                            : ""}
                        </span>
                      </>
                    }
                    value={<span>{fmtDay(trade.disclosure_date)}</span>}
                  />
                ))}
              </SquircleCard>
            </Reveal>
          ) : null}
          {funds.length === 0 && !person ? (
            <SquircleCard title="Follow" seeAllHref="/follow">
              <EmptyRow>Filings are being read. Open the page for the full list.</EmptyRow>
            </SquircleCard>
          ) : null}
      </div>
    </div>
  );
}
