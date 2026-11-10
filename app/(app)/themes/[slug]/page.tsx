import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LockCard } from "@/components/oa/gate";
import { AppPage, Delta, NUM, PageHead, Panel, StatStrip, type StatItem } from "@/components/oa/kit";
import { BasketActions } from "@/components/screener/basket-actions";
import { OverlayChart, type OverlayRange } from "@/components/screener/overlay-chart";
import { BookHead, BookLine } from "@/components/themes-book/book";
import { TheRead } from "@/components/oa/insight";
import { buildThemeRead } from "@/lib/themes-insights";
import { limitFor } from "@/lib/entitlements";
import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { INVESTMENT_THEMES } from "@/lib/investment-themes";
import { withoutZones } from "@/lib/screener-shared";
import { BASKET_BENCHMARK, BASKET_WINDOWS, getBasket, getBasketChart, type BasketLine } from "@/lib/screener-themes";
import { ogImage } from "@/lib/og/url";

// Reads the viewer (cookies) and live prices, so it is rendered per request like the old theme page.
export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

const BASE = "https://www.stocksbrew.online";

export function generateStaticParams() {
  return INVESTMENT_THEMES.map((theme) => ({ slug: theme.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const basket = await getBasket(params.slug);
  if (!basket) return {};
  const title = `${basket.name}: idea basket of ${basket.size} stocks`;
  const shareImage = ogImage(["theme", basket.slug], `${basket.name}: the stocks in the basket and how it has done against the S&P 500`, { daily: true });
  return {
    title,
    description: basket.description,
    alternates: { canonical: `/themes/${basket.slug}` },
    openGraph: { title: `${title} · stocksbrew`, description: basket.description, url: `${BASE}/themes/${basket.slug}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description: basket.description, images: [shareImage] },
  };
}

export default async function ThemeBookPage({ params }: Props) {
  const [basket, viewer] = await Promise.all([getBasket(params.slug), getViewer()]);
  if (!basket) notFound();

  // The call is open to everyone; price zones only on stocks this viewer covers.
  const gate = (line: BasketLine): BasketLine =>
    line.row && !canSeeLevels(viewer, line.ticker) ? { ...line, row: withoutZones(line.row) } : line;
  const lines = basket.lines.map(gate);
  const alsoWatching = basket.alsoWatching.map(gate);
  const tickers = lines.map((line) => line.ticker);
  const pricedLines = lines.filter((line) => line.row);
  const weight = pricedLines.length > 0 ? 100 / pricedLines.length : null;
  const zonesHidden = viewer.plan !== "pro" && basket.lines.some((line) => line.row?.zone) && !lines.some((line) => line.row?.zone);

  const chart = await getBasketChart(tickers).catch(() => null);
  const ranges: OverlayRange[] = (chart?.ranges ?? []).map((range) => ({
    key: range.key,
    label: range.label,
    startDate: range.startDate,
    endDate: range.endDate,
    note: range.excluded.length > 0 ? `${range.members} of ${tickers.length} lines; ${range.excluded.join(", ")} had no price at the start` : null,
    lines: [
      { id: "basket", label: "Basket", color: "var(--oa-primary)", points: range.basket, pct: range.basketPct },
      ...(range.benchmark ? [{ id: "bench", label: `S&P 500 (${BASKET_BENCHMARK})`, color: "var(--oa-muted-fg)", dashed: true, points: range.benchmark, pct: range.benchmarkPct }] : []),
    ],
  }));
  const year = chart?.ranges.find((range) => range.key === "1Y") ?? chart?.ranges[chart.ranges.length - 1] ?? null;

  const stats: StatItem[] = BASKET_WINDOWS.map((window) => {
    const value = basket.perf[window.id];
    const bench = basket.benchmark[window.id];
    return {
      label: window.label === "YTD" ? "This year" : window.label === "1M" ? "1 month" : window.label === "3M" ? "3 months" : "1 year",
      value: value ? <Delta value={value.pct} digits={1} /> : <span className="text-oa-muted-fg">n/a</span>,
      sub: value && bench !== null ? `S&P 500 ${bench >= 0 ? "+" : "−"}${Math.abs(bench).toFixed(1)}%` : undefined,
    };
  });
  if (year?.basketDrawdown !== null && year?.basketDrawdown !== undefined) {
    stats.push({
      label: "Worst fall",
      value: <Delta value={year.basketDrawdown} digits={1} />,
      sub: year.benchmarkDrawdown !== null ? `${year.label}, S&P 500 −${Math.abs(year.benchmarkDrawdown).toFixed(1)}%` : `over ${year.label}`,
    });
  }

  const read = buildThemeRead({ ...basket, lines });
  const calls = { Add: 0, Hold: 0, Trim: 0 };
  for (const line of lines) if (line.row?.call) calls[line.row.call] += 1;
  const called = calls.Add + calls.Hold + calls.Trim;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${basket.name}: idea basket`,
    description: basket.description,
    url: `${BASE}/themes/${basket.slug}`,
    about: lines.map((line) => ({ "@type": "Corporation", name: line.company, tickerSymbol: line.ticker })),
    publisher: { "@type": "Organization", name: "stocksbrew", url: BASE },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Idea baskets", item: `${BASE}/themes` },
      { "@type": "ListItem", position: 2, name: basket.name, item: `${BASE}/themes/${basket.slug}` },
    ],
  };

  return (
    <AppPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageHead
        crumb={
          <a href="/themes" className="hover:underline">
            Idea baskets
          </a>
        }
        title={basket.name}
        lede={basket.thesis}
        className="[&_.oa-head-lede]:hidden"
        actions={
          <div className="max-sm:hidden">
            <BasketActions symbols={tickers} compareLimit={limitFor("compare", viewer.plan)} watchLabel="Save as watchlist" />
          </div>
        }
      />

      <TheRead read={read} className="mb-4" />

      {/* The numbers lead: returns, then the chart. The words that explain them support on the right (below on a phone). */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <StatStrip stats={stats} />
          <Panel flush label="The basket against the S&P 500" right={<span>Hypothetical</span>}>
            <OverlayChart ranges={ranges} initialRange="1Y" emptyText="Not enough price history to draw this basket." />
          </Panel>
          <p className="max-w-[70ch] text-[12.5px] leading-5 text-oa-muted-fg">
            Hypothetical equal-weight basket, picked with hindsight.
          </p>
        </div>

        <Panel label="The thesis">
          <p className="text-pretty text-[15px] font-medium leading-6 text-oa-fg">{basket.thesis}</p>
          <p className="mt-2 text-pretty text-[14px] leading-[22px] text-oa-fg">{basket.description}</p>
          <p className="mt-2 text-[12.5px] leading-5 text-oa-muted-fg">Leans on: {basket.roles.join(" · ")}</p>
          <h3 className="oa-label mt-5">What has to hold</h3>
          <p className="mt-1 text-pretty text-[14px] leading-[22px] text-oa-fg">{basket.holds}</p>
          <a href="#book" className="mt-3 inline-block text-[14px] text-oa-primary underline underline-offset-2">
            What would break each of the {lines.length} lines
          </a>
        </Panel>
      </div>
      <div className="mt-4 sm:hidden">
        <BasketActions symbols={tickers} compareLimit={limitFor("compare", viewer.plan)} watchLabel="Save as watchlist" />
      </div>

      <Panel
        id="book"
        flush
        className="mt-5"
        label="The book"
        right={
          called > 0 ? (
            <span className={NUM}>
              Our call: {calls.Add} add · {calls.Hold} hold · {calls.Trim} trim
            </span>
          ) : undefined
        }
      >
        <BookHead />
        <ol>
          {lines.map((line, index) => (
            <BookLine key={line.ticker} line={line} index={index} weight={line.row ? weight : null} />
          ))}
        </ol>
      </Panel>
      {zonesHidden ? (
        <LockCard feature="stock_zones" plan={viewer.plan} trialEligible={viewer.trialEligible} className="mt-3" />
      ) : null}

      {alsoWatching.length > 0 ? (
        <Panel flush className="mt-5" label="Also watching" right={<span>Not in the basket</span>}>
          <BookHead />
          <ol>
            {alsoWatching.map((line, index) => (
              <BookLine key={line.ticker} line={line} index={index} weight={null} />
            ))}
          </ol>
        </Panel>
      ) : null}

      {basket.resources.length > 0 ? (
        <Panel className="mt-5" label="Sources and further reading">
          <ul className="flex flex-col gap-1.5">
            {basket.resources.map((resource) => (
              <li key={resource.href}>
                <a href={resource.href} target="_blank" rel="noopener noreferrer" className="text-[14px] text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                  {resource.label}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </AppPage>
  );
}
