import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, Delta, NUM, PageHead, Panel, SourceLine, Tag, fmtDay, fmtStampET } from "@/components/oa/kit";
import { CallTag } from "@/components/screener/shared";
import { todayET } from "@/lib/calendar-shared";
import { buildMoveRead, closeOn, sinceClose } from "@/lib/move-page";
import { ogImage } from "@/lib/og/url";
import { getDailySeries } from "@/lib/screener-series";
import { sectorSlug } from "@/lib/screener-shared";
import { causeWords, cleanTicker, insiderHref, isIsoDay, longDay, moveHref, moveTitle, moversDayHref, sectorHref, stockLabel } from "@/lib/seo/families";
import { getCoverage, getMovesDay, getRecentMoves } from "@/lib/seo/family-data";
import { getSeoStockPage, stockHasCurrentRead } from "@/lib/seo/stock-pages";

/**
 * Why a stock moved on one day (/stock/LCID/moves/2026-11-10). A page exists
 * only for a move with a confirmed reason and at least one cited source
 * (isConfirmedMove); every other address is a real 404. The page stays live
 * as a dated record; it is indexable when the stock page is, and the sitemap
 * lists the last MOVE_SITEMAP_DAYS days.
 */

export const revalidate = 600;

type Props = { params: { symbol: string; date: string } };

const BASE = "https://www.stocksbrew.online";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function resolve(params: Props["params"]) {
  const ticker = cleanTicker(params.symbol);
  if (!ticker || !isIsoDay(params.date)) return null;
  const moves = await getMovesDay(params.date);
  const move = moves.find((item) => item.ticker === ticker);
  if (!move) return null;
  const coverage = await getCoverage();
  const row = coverage.bySymbol.get(ticker) ?? null;
  const name = row?.name ?? getSeoStockPage(ticker)?.name ?? move.name;
  const { series } = await getDailySeries([ticker, "SPY"]).catch(() => ({ series: {} as Record<string, never> }));
  const close = closeOn(series[ticker], move.day);
  const spyClose = closeOn(series.SPY, move.day);
  const since = sinceClose(series[ticker], move.day);
  return { ticker, move, moves, row, name, close, spyClose, since };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return { title: "Move not found", robots: { index: false, follow: true } };
  const { ticker, move, row, name, close, since } = found;
  const path = moveHref(ticker, move.day);
  const pct = close?.pct ?? move.pct;
  const title = moveTitle({ name, ticker, pct, day: move.day, today: todayET(), closed: Boolean(close) });
  const description = `${move.headline.replace(/\.$/, "")}. ${stockLabel(name, ticker)} ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct).toFixed(1)}% on ${longDay(move.day)}: the reason and ${move.sources.length} cited ${move.sources.length === 1 ? "source" : "sources"}${since ? `, and ${since.pct >= 0 ? "+" : "−"}${Math.abs(since.pct).toFixed(1)}% since that close` : ""}.`;
  const shareImage = ogImage(["stock", ticker], `Why ${ticker} moved on ${fmtDay(move.day, true)}`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: stockHasCurrentRead(row, todayET()), follow: true },
    openGraph: { type: "article", title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function MovePage({ params }: Props) {
  const ticker = cleanTicker(params.symbol);
  if (!ticker || !isIsoDay(params.date)) notFound();
  if (params.symbol !== ticker) permanentRedirect(moveHref(ticker, params.date));
  const found = await resolve(params);
  if (!found) notFound();
  const { move, moves, row, name, close, spyClose, since } = found;
  const today = todayET();
  const path = moveHref(ticker, move.day);
  const title = moveTitle({ name, ticker, pct: close?.pct ?? move.pct, day: move.day, today, closed: Boolean(close) });
  const read = buildMoveRead({ move, close, spyClose, since, call: row?.call ? { word: row.call, at: row.call_at ?? null } : null });
  const others = (await getRecentMoves()).filter((item) => item.ticker === ticker && item.day !== move.day).slice(0, 5);
  const sameDay = moves.filter((item) => item.ticker !== ticker).slice(0, 6);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: move.headline,
    datePublished: move.researchedAt ?? `${move.day}T21:00:00Z`,
    dateModified: move.researchedAt ?? `${move.day}T21:00:00Z`,
    url: `${BASE}${path}`,
    mainEntityOfPage: `${BASE}${path}`,
    author: { "@type": "Organization", name: "stocksbrew", url: BASE },
    publisher: { "@type": "Organization", name: "stocksbrew", url: BASE },
    about: { "@type": "Corporation", name: name ?? ticker, tickerSymbol: ticker, url: `${BASE}/stock/${encodeURIComponent(ticker)}` },
    citation: move.sources.map((source) => ({ "@type": "CreativeWork", name: source.title, url: source.url })),
  };

  return (
    <AppPage>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Movers", path: moversDayHref(move.day) },
            { name: ticker, path: `/stock/${encodeURIComponent(ticker)}` },
            { name: `Why ${ticker} moved on ${fmtDay(move.day, true)}`, path },
          ]),
          article,
        ]}
      />
      <PageHead
        crumb={
          <>
            <a href={moversDayHref(move.day)}>Movers, {fmtDay(move.day, true)}</a> / <a href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</a>
          </>
        }
        title={title.replace(/\?\s.*$/, "?")}
        meta={<SourceLine source="Researched from news and filings" asOf={move.researchedAt ? fmtStampET(move.researchedAt) : undefined} />}
        note={false}
      />

      <TheRead read={read} label={`${ticker} on ${fmtDay(move.day)}, in short`} className="mb-4" />

      <CardGrid cols={2} className="mb-4">
        <Panel fill label="The reason we found">
          <h2 className="text-pretty text-[17px] font-semibold leading-6 text-oa-fg">{move.headline}</h2>
          {move.why ? <p className="mt-2 max-w-[66ch] text-pretty text-[14.5px] leading-[1.5rem] text-oa-fg">{move.why}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {move.cause ? <Tag>{causeWords(move.cause)}</Tag> : null}
            {move.confidence ? <Tag tone="primary">{move.confidence} confidence</Tag> : null}
          </div>
        </Panel>
        <Panel flush fill label={`Sources ${move.sources.length}`}>
          <ul>
            {move.sources.map((source) => (
              <li key={source.url} className="border-b border-oa-border last:border-b-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
                >
                  <span className="block text-pretty text-[14px] leading-5 text-oa-fg">{source.title}</span>
                  <span className={`${NUM} mt-0.5 block text-[12px] text-oa-muted-fg`}>{hostOf(source.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </CardGrid>

      <CardGrid cols={3}>
        <Panel fill label="Our call">
          {row?.call ? (
            <>
              <div className="flex items-center gap-2">
                <CallTag call={row.call} />
                {row.call_at ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>dated {fmtDay(row.call_at, true)}</span> : null}
              </div>
              {row.call_reason ? <p className="mt-2 text-pretty text-[14px] leading-[1.45rem] text-oa-fg">{row.call_reason}</p> : null}
            </>
          ) : (
            <p className="text-[14px] leading-5 text-oa-muted-fg">We do not have a call on {ticker} yet.</p>
          )}
          <p className="mt-3 text-[13.5px]">
            <a href={`/stock/${encodeURIComponent(ticker)}`} className="text-oa-primary hover:underline">
              {stockLabel(name, ticker)} report →
            </a>
          </p>
        </Panel>
        <Panel flush fill label={`Other moves on ${fmtDay(move.day)}`}>
          {sameDay.length ? (
            <ul>
              {sameDay.map((item) => (
                <li key={item.ticker} className="border-b border-oa-border last:border-b-0">
                  <a href={moveHref(item.ticker, item.day)} className="flex items-center gap-3 px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className={`${NUM} w-12 shrink-0 text-[13.5px] font-medium text-oa-fg`}>{item.ticker}</span>
                    <Delta value={item.pct} digits={1} className="w-14 shrink-0 text-[13px]" />
                    <span className="min-w-0 truncate text-[13.5px] text-oa-fg">{item.headline}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No other explained moves that day.</p>
          )}
          <a href={moversDayHref(move.day)} className="block border-t border-oa-border px-4 py-2.5 text-[13.5px] text-oa-primary hover:underline">
            Every explained move on {fmtDay(move.day)} →
          </a>
        </Panel>
        <Panel flush fill label={`More on ${ticker}`}>
          <ul>
            {[
              ...others.map((item) => ({ href: moveHref(ticker, item.day), label: `${fmtDay(item.day, true)}: ${item.headline}` })),
              ...(row?.sector ? [{ href: sectorHref(sectorSlug(row.sector)), label: `${row.sector} stocks` }] : []),
              // The insider page exists for every covered stock; an uncovered one may have no page.
              ...(row ? [{ href: insiderHref(ticker), label: `${ticker} insider trades` }] : []),
              { href: `/calendar/earnings/${encodeURIComponent(ticker)}`, label: `${ticker} earnings` },
              ...(move.day === today ? [{ href: "/briefing", label: "Today's briefing" }] : []),
            ].map((item) => (
              <li key={item.href} className="border-b border-oa-border last:border-b-0">
                <a href={item.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="min-w-0 truncate">{item.label}</span>
                  <span aria-hidden="true" className="text-oa-muted-fg">→</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </CardGrid>
    </AppPage>
  );
}
