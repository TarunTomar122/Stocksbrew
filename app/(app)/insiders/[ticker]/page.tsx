import { noteDegradedRender } from "@/lib/next-render";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { InsiderTable } from "@/components/follow/insider-table";
import { AppPage, CardGrid, NUM, PageHead, Panel, SourceLine, StatStrip, fmtDay } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { todayET } from "@/lib/calendar-shared";
import { getInsiderTradesForSymbol, type InsiderTrade } from "@/lib/follow";
import { insiderTotals, usd } from "@/lib/insider-page";
import { ogImage } from "@/lib/og/url";
import { sectorSlug } from "@/lib/screener-shared";
import { cleanTicker, insiderHref, insiderIsIndexable, insiderTitle, insiderWindow, pairHref, sectorHref, stockLabel } from "@/lib/seo/families";
import { getCoverage, pairsFor, stockPairs } from "@/lib/seo/family-data";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

/**
 * Insider trades for one stock (/insiders/NVDA), from SEC Form 4: the totals
 * and every open-market trade we hold. The page exists for every stock we cover and for any ticker with a trade on file; anything else is a
 * real 404 (no loading.tsx in this segment; the hub's lives in (hub)).
 * Indexable with INSIDER_MIN_TRADES or more trades in the window.
 */

export const revalidate = 900;

type Props = { params: { ticker: string } };

const BASE = "https://www.stocksbrew.online";

async function resolve(raw: string) {
  const ticker = cleanTicker(raw);
  if (!ticker) return null;
  const [coverage, all] = await Promise.all([getCoverage(), getInsiderTradesForSymbol(ticker).catch(() => (noteDegradedRender(), [] as InsiderTrade[]))]);
  const row = coverage.bySymbol.get(ticker) ?? null;
  if (!row && all.length === 0) return null;
  const trades = insiderWindow(all, todayET());
  const name = row?.name ?? all.find((trade) => trade.company)?.company ?? null;
  return { ticker, coverage, row, trades, name };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params.ticker);
  if (!found) return { title: "Insider trades not found", robots: { index: false, follow: true } };
  const { ticker, row, trades, name } = found;
  const path = insiderHref(ticker);
  const title = insiderTitle(name, ticker);
  const totals = insiderTotals(trades);
  const counts =
    trades.length > 0
      ? ` ${totals.buys ? `${totals.buys} open-market ${totals.buys === 1 ? "buy" : "buys"} (${usd(totals.bought)})` : "No open-market buys"} and ${totals.sells ? `${totals.sells} ${totals.sells === 1 ? "sale" : "sales"} (${usd(totals.sold)})` : "no sales"} on file${totals.first ? ` since ${fmtDay(totals.first, true)}` : ""}.`
      : " No open-market trades on file yet.";
  const description = `${stockLabel(name, ticker)} insider buying and selling from SEC Form 4 filings: who traded, how much, at what price, cluster buys and pre-set plan sales.${counts}`;
  const shareImage = ogImage(["page", "insiders"], `${ticker} insider trades`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: Boolean(row) && insiderIsIndexable(trades.length), follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function InsiderStockPage({ params }: Props) {
  const ticker = cleanTicker(params.ticker);
  if (!ticker) notFound();
  if (params.ticker !== ticker) permanentRedirect(insiderHref(ticker));
  const found = await resolve(ticker);
  if (!found) notFound();
  const { coverage, row, trades, name } = found;
  const path = insiderHref(ticker);
  const totals = insiderTotals(trades);
  const sorted = [...trades].sort((a, b) => (a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0));
  const pairs = pairsFor(stockPairs(coverage), ticker).slice(0, 3);

  return (
    <AppPage>
      <JsonLd
        data={breadcrumbLd([
          { name: "Insiders", path: "/insiders" },
          { name: `${ticker} insider trades`, path },
        ])}
      />
      <PageHead
        crumb={
          <>
            <Link prefetch={false} href="/insiders">Insiders</Link> / <Link prefetch={false} href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</Link>
          </>
        }
        title={`${name ?? ticker} insider trades`}
        meta={<SourceLine source="SEC Form 4" asOf={totals.last ? `filings through ${fmtDay(totals.last, true)}` : undefined} />}
        note={false}
      />

      {trades.length === 0 ? (
        <Panel className="mb-4">
          <p className="text-[15px] leading-[22px] text-oa-fg">No open-market insider buys or sales of {ticker} on file in the last 12 months.</p>
        </Panel>
      ) : null}

      {trades.length > 0 ? (
        <>
          <StatStrip
            className="mb-4"
            stats={[
              { label: "Bought", value: <span className={`${NUM} text-signal-bullish`}>{usd(totals.bought)}</span>, sub: `${totals.buys} ${totals.buys === 1 ? "trade" : "trades"}, ${totals.buyers} ${totals.buyers === 1 ? "insider" : "insiders"}` },
              { label: "Sold", value: <span className={`${NUM} text-signal-bearish`}>{usd(totals.sold)}</span>, sub: `${totals.sells} ${totals.sells === 1 ? "trade" : "trades"}, ${totals.sellers} ${totals.sellers === 1 ? "insider" : "insiders"}` },
              {
                label: "Net",
                value: <span className={`${NUM} ${totals.bought - totals.sold >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{`${totals.bought - totals.sold >= 0 ? "+" : "−"}${usd(totals.bought - totals.sold)}`}</span>,
                sub: totals.first ? `since ${fmtDay(totals.first, true)}` : undefined,
              },
              { label: "Under 10b5-1 plans", value: <span className={NUM}>{totals.planSells}</span>, sub: `of ${totals.sells} ${totals.sells === 1 ? "sale" : "sales"}` },
            ]}
          />
          <section aria-label="Trades" className="mb-4">
            <InsiderTable trades={sorted} initialSide="all" group={false} />
          </section>
        </>
      ) : null}

      <CardGrid cols={3}>
        <Panel flush fill label={`More on ${ticker}`}>
          <ul>
            {[
              { href: `/stock/${encodeURIComponent(ticker)}`, label: `${stockLabel(name, ticker)} report` },
              { href: `/calendar/earnings/${encodeURIComponent(ticker)}`, label: `${ticker} earnings` },
              ...(row?.sector ? [{ href: sectorHref(sectorSlug(row.sector)), label: `${row.sector} stocks` }] : []),
            ].map((item) => (
              <li key={item.href} className="border-b border-oa-border last:border-b-0">
                <AppLink href={item.href} className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="min-w-0 truncate">{item.label}</span>
                </AppLink>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel flush fill label={`${ticker} against its rivals`}>
          {pairs.length ? (
            <ul>
              {pairs.map((pair) => (
                <li key={pair.slug} className="border-b border-oa-border last:border-b-0">
                  <Link prefetch={false} href={pairHref(pair.a, pair.b)} className={`${NUM} flex items-center gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent`}>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <StockLogo ticker={pair.a} size={18} />
                      {pair.a}
                      <span className="px-0.5 text-oa-muted-fg">vs</span>
                      <StockLogo ticker={pair.b} size={18} />
                      {pair.b}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No comparison pages for {ticker}.</p>
          )}
        </Panel>
        <Panel flush fill label="Insider buying across the market">
          <ul>
            {[
              { href: "/insiders", label: "Latest insider trades and cluster buys" },
              { href: "/follow?tab=insiders", label: "Follow insiders" },
            ].map((item) => (
              <li key={item.href} className="border-b border-oa-border last:border-b-0">
                <AppLink href={item.href} className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="min-w-0 truncate">{item.label}</span>
                </AppLink>
              </li>
            ))}
          </ul>
        </Panel>
      </CardGrid>
    </AppPage>
  );
}
