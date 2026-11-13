import type { Metadata } from "next";

import { AppPage, Delta, Empty, NUM, PageHead, Panel } from "@/components/oa/kit";
import { BASKET_BENCHMARK, BASKET_WINDOWS, getBaskets, type Basket, type BasketWindow } from "@/lib/screener-themes";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";

import { SignedBar, barDomain } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";

// Prices behind the basket returns move during the day; never freeze this page at build time.
export const revalidate = 300;

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "themes"], "Idea baskets with a reason for every stock", { daily: true });
  return {
    title: "Investment Themes as Stock Baskets: AI, Defense, Energy and More",
    description:
      "Ten investment themes, each written as a thesis with the companies that carry it, what each one does in the idea and what would break it. Performance is a hypothetical equal-weight basket.",
    alternates: { canonical: "/themes" },
    openGraph: {
      title: "Investment Themes as Stock Baskets · stocksbrew",
      description: "Investment themes as baskets of stocks, with the reasoning for every line.",
      url: "https://www.stocksbrew.online/themes",
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", images: [shareImage] },
  };
}

/** One grid for the head row, the S&P 500 row and every basket, so the numbers line up in columns. */
// The idea column is capped so the leading names, with their logos, take the room (owner, Nov 12: "reduce first column width and add logos").
const ROW = "lg:grid lg:grid-cols-[1.75rem_minmax(12rem,17rem)_minmax(0,1fr)_repeat(4,4.75rem)] lg:items-center lg:gap-x-4 xl:grid-cols-[1.75rem_minmax(14rem,20rem)_minmax(0,1fr)_repeat(4,5.25rem)]";
const LEAD_WINDOW: BasketWindow = "ret_ytd";

function Pct({ value, lead = false }: { value: number | null | undefined; lead?: boolean }) {
  if (value == null) return <span className="text-oa-muted-fg">n/a</span>;
  return <Delta value={value} digits={1} className={lead ? "text-[15px] font-semibold" : "text-[14px]"} />;
}

/**
 * This year's return as a bar under its figure, every basket and the S&P 500 on one scale with one zero line, and a
 * tick where the S&P 500 stands, so each basket reads against it at a glance (owner VISUALS CHECK).
 */
function YearBar({ value, domain, spy, className = "" }: { value: number | null | undefined; domain: [number, number]; spy: number | null; className?: string }) {
  return <SignedBar value={value} domain={domain} mark={spy} strongZero className={`h-1.5 ${className}`} />;
}

/** The S&P 500 tick's key, said once over the bars (council, sweep 87: the black mark needed a name). */
function SpyKey() {
  return (
    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
      <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-oa-fg" />
      S&amp;P 500
    </span>
  );
}

/** Each window's scale (every basket and the S&P 500 in it) and the S&P 500's own figure, for that column's bars. */
type Scales = Record<BasketWindow, { domain: [number, number]; spy: number | null }>;

function BasketRow({ basket, index, scales }: { basket: Basket; index: number; scales: Scales }) {
  const { domain, spy } = scales[LEAD_WINDOW];
  const priced = basket.perf.ret_1m?.priced ?? 0;
  const partial = priced > 0 && priced < basket.size;
  return (
    <li className="border-b border-oa-border last:border-b-0">
      <Link prefetch={false} href={`/themes/${basket.slug}`} className={`block px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent ${ROW}`}>
        <span className={`${NUM} hidden text-[12.5px] text-oa-muted-fg lg:block`}>{index + 1}</span>
        <span className="block min-w-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold leading-6 text-oa-fg lg:text-[15px]">{basket.name}</span>
            {/* Phone: this year's return is the number that leads the row, with its bar against the S&P 500. */}
            <span className="flex w-20 shrink-0 flex-col items-end gap-1 lg:hidden">
              <Pct value={basket.perf[LEAD_WINDOW]?.pct} lead />
              <YearBar value={basket.perf[LEAD_WINDOW]?.pct} domain={domain} spy={spy} className="w-full" />
            </span>
          </span>
          <span className="line-clamp-2 max-w-[70ch] text-[13.5px] leading-5 text-oa-muted-fg lg:line-clamp-1" title={basket.thesis}>{basket.thesis}</span>
          {/* Phone: the leading names with their logos (owner VISUALS CHECK), three at most, then how many more. */}
          <span className={`${NUM} mt-1 flex min-w-0 items-center gap-x-2.5 overflow-hidden text-[12.5px] leading-[18px] text-oa-muted-fg lg:hidden`}>
            {basket.lead.slice(0, 3).map((item) => (
              <span key={item.ticker} className="flex shrink-0 items-center gap-1 text-oa-fg">
                <StockLogo ticker={item.ticker} size={16} circle />
                {item.ticker}
              </span>
            ))}
            {basket.size > 3 ? <span className="shrink-0">+{basket.size - 3}</span> : null}
            {partial ? <span className="truncate">{`${priced} of ${basket.size} priced`}</span> : null}
          </span>
          {/* Phone: the other windows side by side, each with its bar on that window's scale (judges, sweep 87). */}
          <span className={`${NUM} mt-1.5 grid max-w-[22rem] grid-cols-3 gap-x-4 text-[12.5px] leading-[18px] text-oa-muted-fg lg:hidden`}>
            {BASKET_WINDOWS.filter((window) => window.id !== LEAD_WINDOW).map((window) => (
              <span key={window.id} className="flex min-w-0 flex-col gap-1">
                <span className="whitespace-nowrap">
                  {window.label} <Pct value={basket.perf[window.id]?.pct} />
                </span>
                <YearBar value={basket.perf[window.id]?.pct} domain={scales[window.id].domain} spy={scales[window.id].spy} />
              </span>
            ))}
          </span>
        </span>
        <span className={`${NUM} hidden min-w-0 items-center gap-x-3 overflow-hidden text-[13px] text-oa-muted-fg lg:flex`}>
          {/* Two names up to wide screens, three there: whole names only, never one cut off at the edge (judges, ship 71:
              a third name was cut at 1280). */}
          {basket.lead.slice(0, 3).map((item, i) => (
            <span key={item.ticker} className={`shrink-0 items-center gap-1.5 text-oa-fg ${i < 2 ? "flex" : "hidden 2xl:flex"}`}>
              <StockLogo ticker={item.ticker} size={18} circle eager />
              {item.ticker}
            </span>
          ))}
          {basket.size > 2 ? <span className="shrink-0 2xl:hidden">+{basket.size - 2}</span> : null}
          {basket.size > 3 ? <span className="hidden shrink-0 2xl:inline">+{basket.size - 3}</span> : null}
          {partial ? <span className="shrink-0">{`${priced}/${basket.size} priced`}</span> : null}
        </span>
        {BASKET_WINDOWS.map((window) => (
          <span key={window.id} className="hidden text-right lg:block">
            <Pct value={basket.perf[window.id]?.pct} lead={window.id === LEAD_WINDOW} />
            {/* Every window gets its bar on its own column's scale, with a tick at the S&P 500 (judges, sweep 87). */}
            <YearBar value={basket.perf[window.id]?.pct} domain={scales[window.id].domain} spy={scales[window.id].spy} className="mt-1.5" />
          </span>
        ))}
      </Link>
    </li>
  );
}

export default async function ThemesPage() {
  const { baskets } = await getBaskets();
  // Best this year first: the list is a ranking, and the S&P 500 row above it is the yardstick.
  const ranked = [...baskets].sort((a, b) => (b.perf[LEAD_WINDOW]?.pct ?? -Infinity) - (a.perf[LEAD_WINDOW]?.pct ?? -Infinity));
  const benchmark = baskets[0]?.benchmark ?? null;
  const lines = baskets.reduce((sum, basket) => sum + basket.size, 0);
  // One scale for every basket's year and the S&P 500's, so the bars read as one chart down the column.
  const scales = Object.fromEntries(
    BASKET_WINDOWS.map(({ id }) => {
      const mark = benchmark?.[id] ?? null;
      return [id, { domain: barDomain([...baskets.map((basket) => basket.perf[id]?.pct), mark]), spy: mark }];
    }),
  ) as Scales;
  const { domain, spy } = scales[LEAD_WINDOW];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Idea baskets",
    itemListElement: ranked.map((basket, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: basket.name,
      url: `https://www.stocksbrew.online/themes/${basket.slug}`,
    })),
  };

  return (
    <AppPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <PageHead title="Idea baskets" />

      <Panel flush>
        {baskets.length === 0 ? (
          <Empty title="No baskets yet">Try again in a few minutes.</Empty>
        ) : (
          <>
            <div className={`oa-caption hidden h-9 border-b border-oa-border bg-oa-bg px-4 ${ROW}`}>
              <span />
              <span className="flex items-center gap-3">
                {baskets.length} ideas, {lines} lines
                {benchmark ? <SpyKey /> : null}
              </span>
              <span className="hidden lg:block">Leading names</span>
              {BASKET_WINDOWS.map((window) => (
                <span key={window.id} className={`text-right ${window.id === LEAD_WINDOW ? "text-oa-fg" : ""}`}>
                  {window.label}
                  {window.id === LEAD_WINDOW ? " ↓" : ""}
                </span>
              ))}
            </div>
            <p className="oa-caption flex items-center justify-between gap-3 border-b border-oa-border bg-oa-bg px-4 py-2 lg:hidden">
              <span>{baskets.length} ideas, best this year first</span>
              {benchmark ? <SpyKey /> : null}
            </p>
            {benchmark ? (
              <div className={`border-b border-oa-border px-4 py-2 text-[14px] text-oa-muted-fg ${ROW}`}>
                <span className="hidden lg:block" />
                <span className="flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <StockLogo ticker={BASKET_BENCHMARK} size={18} circle eager />
                    S&amp;P 500 ({BASKET_BENCHMARK}), for scale
                  </span>
                  <span className="flex w-20 shrink-0 flex-col items-end gap-1 lg:hidden">
                    <Pct value={benchmark[LEAD_WINDOW]} />
                    <SignedBar value={spy} domain={domain} color="var(--oa-muted-fg)" strongZero className="h-1.5 w-full" />
                  </span>
                </span>
                <span className="hidden lg:block" />
                {BASKET_WINDOWS.map((window) => (
                  <span key={window.id} className={`${NUM} hidden text-right lg:block`}>
                    {benchmark[window.id] == null ? "n/a" : `${benchmark[window.id]! > 0 ? "+" : benchmark[window.id]! < 0 ? "−" : ""}${Math.abs(benchmark[window.id]!).toFixed(1)}%`}
                    <SignedBar value={benchmark[window.id]} domain={scales[window.id].domain} color="var(--oa-muted-fg)" strongZero className="mt-1.5 h-1.5" />
                  </span>
                ))}
              </div>
            ) : null}
            <ol>
              {ranked.map((basket, index) => (
                <BasketRow key={basket.slug} basket={basket} index={index} scales={scales} />
              ))}
            </ol>
          </>
        )}
      </Panel>
      {/* No footnote and no "About this page" (owner rule 8: no mechanics copy); the site footer says past returns
          promise nothing. */}
    </AppPage>
  );
}
