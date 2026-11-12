import type * as React from "react";

import { AppLink } from "@/components/oa/app-link";
import { CardGrid, NUM, Panel } from "@/components/oa/kit";
import { KindIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { insiderHref, pairHref, stockLabel, type StockPair } from "@/lib/seo/families";

/** One stock of a compare page and its other comparison pages. */
export type PairMoreStock = { row: { symbol: string; name?: string | null }; pairs: StockPair[] };

/** Links, each with what it opens as a logo or an icon (owner VISUALS CHECK). */
function LinkList({ items }: { items: Array<{ href: string; label: string; icon?: React.ReactNode }> }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.href} className="border-b border-oa-border last:border-b-0">
          <AppLink href={item.href} className="flex items-center gap-2.5 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
            {item.icon ? <span className="inline-flex shrink-0 text-oa-muted-fg">{item.icon}</span> : null}
            <span className="min-w-0 truncate">{item.label}</span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * The foot of a compare page (/compare/amd-vs-nvda). One card per stock, side by side: always the same three rows
 * (report, earnings, insiders), so the two end level whatever their rivals (owner rule 4; council, Nov 12). Their other
 * rivals go below in one full-width card, a line of logo chips per stock that has any, which ends where the chips do;
 * with none for either stock the card is left out. The sector is in the page's trail above.
 */
export function PairMore({ stocks }: { stocks: PairMoreStock[] }) {
  const withRivals = stocks.filter(({ pairs }) => pairs.length > 0);
  return (
    <>
      <CardGrid cols={2} className="mt-5">
        {stocks.map(({ row }) => (
          <Panel key={row.symbol} flush fill label={`More on ${row.symbol}`}>
            <LinkList
              items={[
                { href: `/stock/${encodeURIComponent(row.symbol)}`, label: `${stockLabel(row.name, row.symbol)} report`, icon: <StockLogo ticker={row.symbol} size={18} /> },
                { href: `/calendar/earnings/${encodeURIComponent(row.symbol)}`, label: `${row.symbol} earnings`, icon: <KindIcon name="calendar" /> },
                { href: insiderHref(row.symbol), label: `${row.symbol} insider trades`, icon: <KindIcon name="person" /> },
              ]}
            />
          </Panel>
        ))}
      </CardGrid>
      {withRivals.length ? (
        <Panel flush label="Against their other rivals" className="mt-3">
          <ul>
            {withRivals.map(({ row, pairs }) => (
              <li key={row.symbol} className="flex flex-col gap-2 border-b border-oa-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
                <span className={`${NUM} inline-flex w-24 shrink-0 items-center gap-1.5 text-[14px] font-medium text-oa-fg`}>
                  <StockLogo ticker={row.symbol} size={18} />
                  {row.symbol}
                </span>
                <span className="flex flex-wrap gap-2">
                  {pairs.map((item) => {
                    const rival = item.a === row.symbol ? item.b : item.a;
                    return (
                      <AppLink
                        key={item.slug}
                        href={pairHref(item.a, item.b)}
                        aria-label={`${row.symbol} vs ${rival}`}
                        className={`${NUM} inline-flex h-9 items-center gap-1.5 rounded-md border border-oa-border px-2.5 text-[13.5px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent`}
                      >
                        <StockLogo ticker={rival} size={16} />
                        {rival}
                      </AppLink>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
