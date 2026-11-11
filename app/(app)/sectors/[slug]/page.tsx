import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { closeWords } from "@/lib/benchmark-day";
import { AppPage, CardGrid, Delta, MoveBar, NUM, PageHead, Panel, ShowMore, SourceLine, StatStrip, Ticker, fmtCompact, fmtDay, fmtMoney } from "@/components/oa/kit";
import { asSentence } from "@/lib/plain-copy";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { CallTag } from "@/components/screener/shared";
import { todayET } from "@/lib/calendar-shared";
import { INVESTMENT_THEMES } from "@/lib/investment-themes";
import { ogImage } from "@/lib/og/url";
import { canonicalSectorSlug, type ScreenerRow } from "@/lib/screener-shared";
import { buildSectorRead, medianPe, ranked, weightedChange } from "@/lib/sector-insights";
import { moveHref, pairHref, sectorHref, sectorIsIndexable, sectorTitle } from "@/lib/seo/families";
import { getCoverage, getMovesDay, sectorGroups, stockPairs } from "@/lib/seo/family-data";
import { alsoClassesLabel, oneRowPerCompany } from "@/lib/share-class";

/**
 * One page per sector (/sectors/technology): the read, the sector against the
 * S&P 500, leaders and laggards over three periods, and every covered stock in
 * it. Built from the screener snapshot. No loading.tsx in this segment, so an
 * unknown sector is a real 404.
 */

export const revalidate = 900;

type Props = { params: { slug: string } };

const BASE = "https://www.stocksbrew.online";

async function resolve(slug: string) {
  const coverage = await getCoverage();
  const groups = sectorGroups(coverage);
  const group = groups.find((item) => item.slug === slug) ?? null;
  return { coverage, groups, group };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { coverage, group } = await resolve(params.slug);
  if (!group) return { title: "Sector not found", robots: { index: false, follow: true } };
  const path = sectorHref(group.slug);
  const title = sectorTitle(group.name);
  const year = weightedChange(group.rows, "ret_ytd");
  const spyYear = coverage.spy?.ret_ytd;
  const yearText =
    year !== null
      ? ` This year the group is ${year >= 0 ? "up" : "down"} ${Math.abs(year).toFixed(1)}%${typeof spyYear === "number" ? ` against ${spyYear >= 0 ? "+" : "−"}${Math.abs(spyYear).toFixed(1)}% for the S&P 500` : ""}.`
      : "";
  const description = `The ${group.rows.length} US ${group.name.toLowerCase()} stocks we cover: the latest session against the S&P 500, 1-month and year-to-date returns, leaders and laggards, valuations and our call on each.${yearText}`;
  const shareImage = ogImage(["page", "screener"], `${group.name} stocks`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: sectorIsIndexable(group.rows.length), follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

type Period = "day_pct" | "ret_1m" | "ret_ytd";

function MoverList({ rows, period }: { rows: ScreenerRow[]; period: Period }) {
  // GOOGL and GOOG move together; one Alphabet row, not two.
  const { rows: list, also } = oneRowPerCompany(ranked(rows, period), (row) => row.symbol);
  if (list.length < 2) return <p className="px-4 py-3 text-[14px] text-oa-muted-fg">Not enough prices for this period.</p>;
  const top = list.slice(0, 3);
  const bottom = list.slice(-3).reverse().filter((row) => !top.includes(row));
  // Bars share one scale per card, so the biggest move in it fills its bar.
  const max = Math.max(...[...top, ...bottom].map((row) => Math.abs(Number(row[period]) || 0)));
  const item = (row: ScreenerRow) => (
    <li key={row.symbol} className="relative flex items-center justify-between gap-3 border-b border-oa-border px-4 py-2 transition-colors last:border-b-0 hover:bg-oa-accent">
      <span className="min-w-0">
        <Ticker symbol={row.symbol} name={row.name} size={18} wrap stretch className="min-w-0" />
        {alsoClassesLabel(also, row.symbol) ? <span className={`${NUM} ml-[26px] block text-[12px] leading-4 text-oa-muted-fg`}>{alsoClassesLabel(also, row.symbol)}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <MoveBar value={row[period]} max={max} width={40} />
        <Delta value={row[period]} digits={1} className="w-16 text-right text-[13.5px]" />
      </span>
    </li>
  );
  return (
    <div>
      <p className="oa-caption border-b border-oa-border bg-oa-bg px-4 py-1.5">Rose most</p>
      <ul>{top.map(item)}</ul>
      <p className="oa-caption border-y border-oa-border bg-oa-bg px-4 py-1.5">Fell most</p>
      <ul>{bottom.map(item)}</ul>
    </div>
  );
}

export default async function SectorPage({ params }: Props) {
  const { coverage, groups, group } = await resolve(params.slug);
  if (!group) {
    // Old sector ids (healthcare, financial-services, ...) go to the sector they meant.
    const canonical = canonicalSectorSlug(params.slug);
    if (canonical !== params.slug && groups.some((item) => item.slug === canonical)) permanentRedirect(sectorHref(canonical));
    notFound();
  }
  const today = todayET();
  const path = sectorHref(group.slug);
  // The read's leaders and laggards are from the snapshot's close, so only that day's reasons may be attached to them.
  const [closeMoves, latestMoves] = await Promise.all([
    coverage.priceDay ? getMovesDay(coverage.priceDay) : Promise.resolve([]),
    coverage.priceDay === today ? Promise.resolve(null) : getMovesDay(today),
  ]);
  const inSector = (ticker: string) => group.rows.some((row) => row.symbol === ticker);
  const moveHrefs = new Map(closeMoves.filter((move) => inSector(move.ticker)).map((move) => [move.ticker, moveHref(move.ticker, move.day)]));
  const read = buildSectorRead({ name: group.name, rows: group.rows, all: coverage.rows, spy: coverage.spy, priceDay: coverage.priceDay, moveHrefs, asOf: coverage.generatedAt });
  const spy = coverage.spy;
  const pe = medianPe(group.rows);
  const allPe = medianPe(coverage.rows);
  const symbols = new Set(group.rows.map((row) => row.symbol));
  const themes = INVESTMENT_THEMES.map((theme) => ({
    theme,
    members: [...new Set([...theme.candidates, ...theme.watchlist].map((item) => item.ticker.toUpperCase()))].filter((ticker) => symbols.has(ticker)),
  }))
    .filter((item) => item.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 6);
  const pairs = stockPairs(coverage).filter((pair) => symbols.has(pair.a) && symbols.has(pair.b)).slice(0, 8);
  // The newest day with explained moves in this sector: today's session when it has any, else the close.
  const explained = (latestMoves?.some((move) => inSector(move.ticker)) ? latestMoves : closeMoves).filter((move) => inSector(move.ticker));

  const columns: DataColumn[] = [
    { id: "stock", label: "Stock" },
    { id: "industry", label: "Industry", hideOnMobile: true },
    { id: "price", label: "Price", align: "right", hideOnMobile: true },
    { id: "day", label: "Day", align: "right" },
    { id: "m1", label: "1 month", align: "right", hideOnMobile: true },
    { id: "ytd", label: "This year", align: "right" },
    { id: "cap", label: "Market value", align: "right", hideOnMobile: true },
    { id: "pe", label: "P/E", align: "right", hideOnMobile: true },
    { id: "call", label: "Our call", align: "right" },
  ];
  const folded = oneRowPerCompany(group.rows, (row) => row.symbol);
  const tableRows: DataRow[] = folded.rows.map((row) => ({
    key: row.symbol,
    href: `/stock/${encodeURIComponent(row.symbol)}`,
    cells: [
      <span key="t" className="block">
        <Ticker symbol={row.symbol} name={row.name} size={18} className="max-w-[13rem]" />
        {alsoClassesLabel(folded.also, row.symbol) ? <span className={`${NUM} ml-[26px] block text-[12px] leading-4 text-oa-muted-fg`}>{alsoClassesLabel(folded.also, row.symbol)}</span> : null}
      </span>,
      <span key="i" title={row.industry ?? undefined} className="block max-w-[10rem] truncate text-[13px] text-oa-muted-fg">{row.industry ?? ""}</span>,
      <span key="p" className={`${NUM} text-[13.5px]`}>{fmtMoney(row.price)}</span>,
      <Delta key="d" value={row.day_pct} digits={1} className="text-[13.5px]" />,
      <Delta key="m" value={row.ret_1m} digits={1} className="text-[13.5px]" />,
      <Delta key="y" value={row.ret_ytd} digits={1} className="text-[13.5px]" />,
      <span key="c" className={`${NUM} text-[13.5px]`}>{fmtCompact(row.market_cap, "$")}</span>,
      <span key="e" className={`${NUM} text-[13.5px]`}>{typeof row.pe === "number" && row.pe > 0 ? `${row.pe.toFixed(1)}x` : "n/a"}</span>,
      <CallTag key="k" call={row.call} />,
    ],
    sort: [
      row.symbol,
      row.industry ?? null,
      row.price ?? null,
      row.day_pct ?? null,
      row.ret_1m ?? null,
      row.ret_ytd ?? null,
      row.market_cap ?? null,
      typeof row.pe === "number" && row.pe > 0 ? row.pe : null,
      row.call ?? null,
    ],
  }));

  const sectorDay = weightedChange(group.rows, "day_pct");
  const sectorMonth = weightedChange(group.rows, "ret_1m");
  const sectorYear = weightedChange(group.rows, "ret_ytd");
  const spyNote = (value: number | undefined) => (typeof value === "number" ? `S&P 500 ${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%` : undefined);

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Sectors", path: "/sectors" }, { name: group.name, path }])} />
      <PageHead
        crumb={<a href="/sectors">Sectors</a>}
        title={`${group.name} stocks`}
        meta={<SourceLine source="Prices and company data" asOf={coverage.priceDay ? closeWords(coverage.priceDay, fmtDay(coverage.priceDay, true)) : undefined} />}
        note={false}
      />

      <TheRead read={read} label={`${group.name}, in short`} fold="phone" foldLabel={`Show more on ${group.name.toLowerCase()} stocks`} className="mb-4" />

      <StatStrip
        className="mb-4"
        stats={[
          { label: coverage.priceDay ? fmtDay(coverage.priceDay) : "Last trading day", value: <Delta value={sectorDay} digits={1} />, sub: spyNote(spy?.day_pct) },
          { label: "1 month", value: <Delta value={sectorMonth} digits={1} />, sub: spyNote(spy?.ret_1m) },
          { label: "This year", value: <Delta value={sectorYear} digits={1} />, sub: spyNote(spy?.ret_ytd) },
          {
            label: "Price for $1 of yearly profit",
            value: pe ? <span className={NUM}>${pe.value.toFixed(0)}</span> : <span className={NUM}>n/a</span>,
            sub: allPe ? `$${allPe.value.toFixed(0)} for the typical stock we follow` : undefined,
          },
        ]}
      />

      <CardGrid cols={3} className="mb-4">
        <Panel flush fill label={coverage.priceDay ? fmtDay(coverage.priceDay) : "Last trading day"}>
          <MoverList rows={group.rows} period="day_pct" />
        </Panel>
        <ShowMore contents label="Show the best and worst over a month and this year">
          <Panel flush fill label="1 month" className="max-lg:mb-3">
            <MoverList rows={group.rows} period="ret_1m" />
          </Panel>
          <Panel flush fill label="This year">
            <MoverList rows={group.rows} period="ret_ytd" />
          </Panel>
        </ShowMore>
      </CardGrid>

      {explained.length > 0 ? (
        <Panel flush className="mb-4" label={`Why they moved on ${fmtDay(explained[0]!.day)}`}>
          <ul>
            {explained.slice(0, 6).map((move) => (
              <li key={move.ticker} className="border-b border-oa-border last:border-b-0">
                <a href={moveHref(move.ticker, move.day)} className="flex items-start gap-3 px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className={`${NUM} w-14 shrink-0 text-[14px] font-medium leading-5 text-oa-fg`}>{move.ticker}</span>
                  <Delta value={move.pct} digits={1} className="w-16 shrink-0 text-[13.5px] leading-5" />
                  <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{asSentence(move.headline)}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ShowMore label={`Show all ${group.rows.length} ${group.name.toLowerCase()} stocks`} className="mb-4">
        <Panel
          flush
          label={`All ${group.rows.length} stocks, biggest first`}
          right={
            <a href={`/screener?sector=${group.slug}`} className="text-oa-primary hover:underline">
              Filter them →
            </a>
          }
        >
          <DataTable columns={columns} rows={tableRows} initialSort={{ id: "cap", dir: "desc" }} pageSize={50} stickyHeader={false} compact />
        </Panel>
      </ShowMore>

      <CardGrid cols={3}>
        <ShowMore contents label="Show rival comparisons and themes">
        <Panel flush fill label="Rivals side by side" className="max-lg:mb-3">
          {pairs.length ? (
            <ul>
              {pairs.map((pair) => (
                <li key={pair.slug} className="border-b border-oa-border last:border-b-0">
                  <a href={pairHref(pair.a, pair.b)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className={NUM}>
                      {pair.a} vs {pair.b}
                    </span>
                    <span className="min-w-0 text-pretty text-right text-[12.5px] text-oa-muted-fg">{pair.group}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No comparison pages in this sector yet.</p>
          )}
        </Panel>
        <Panel flush fill label="Themes with these stocks">
          {themes.length ? (
            <ul>
              {themes.map(({ theme, members }) => (
                <li key={theme.slug} className="border-b border-oa-border last:border-b-0">
                  <a href={`/themes/${theme.slug}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className="min-w-0 text-pretty">{theme.name}</span>
                    <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{members.slice(0, 3).join(", ")}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No theme holds two or more of these stocks.</p>
          )}
        </Panel>
        </ShowMore>
        <Panel flush fill label="Other sectors">
          <ul>
            {groups
              .filter((item) => item.slug !== group.slug)
              .map((item) => (
                <li key={item.slug} className="border-b border-oa-border last:border-b-0">
                  <a href={sectorHref(item.slug)} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <Delta value={weightedChange(item.rows, "day_pct")} digits={1} className="shrink-0 text-[13px]" />
                  </a>
                </li>
              ))}
          </ul>
          <a href="/best" className="oa-card-foot mt-auto block border-t border-oa-border px-4 py-2.5 text-[14px] text-oa-primary outline-none hover:bg-oa-accent hover:underline focus-visible:bg-oa-accent">
            Best stock lists: dividends, value, growth →
          </a>
        </Panel>
      </CardGrid>
    </AppPage>
  );
}
