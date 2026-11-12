import type { Metadata } from "next";

import { AppPage, Delta, Empty, NUM, PageHead, Panel } from "@/components/oa/kit";
import { BASKET_BENCHMARK, BASKET_WINDOWS, getBaskets, type Basket, type BasketWindow } from "@/lib/screener-themes";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";

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
const ROW = "lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_repeat(4,4.75rem)] lg:items-center lg:gap-x-4 xl:grid-cols-[1.75rem_minmax(0,1fr)_15rem_repeat(4,5.25rem)]";
const LEAD_WINDOW: BasketWindow = "ret_ytd";

function Pct({ value, lead = false }: { value: number | null | undefined; lead?: boolean }) {
  if (value == null) return <span className="text-oa-muted-fg">n/a</span>;
  return <Delta value={value} digits={1} className={lead ? "text-[15px] font-semibold" : "text-[14px]"} />;
}

function BasketRow({ basket, index }: { basket: Basket; index: number }) {
  const priced = basket.perf.ret_1m?.priced ?? 0;
  const partial = priced > 0 && priced < basket.size;
  const tickers = basket.lead.map((item) => item.ticker).join(" · ");
  const more = basket.size > basket.lead.length ? ` +${basket.size - basket.lead.length}` : "";
  return (
    <li className="border-b border-oa-border last:border-b-0">
      <Link prefetch={false} href={`/themes/${basket.slug}`} className={`block px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent ${ROW}`}>
        <span className={`${NUM} hidden text-[12.5px] text-oa-muted-fg lg:block`}>{index + 1}</span>
        <span className="block min-w-0">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold leading-6 text-oa-fg lg:text-[15px]">{basket.name}</span>
            {/* Phone: this year's return is the number that leads the row. */}
            <span className="lg:hidden">
              <Pct value={basket.perf[LEAD_WINDOW]?.pct} lead />
            </span>
          </span>
          <span className="line-clamp-2 max-w-[70ch] text-[14px] leading-5 text-oa-muted-fg lg:line-clamp-1">{basket.thesis}</span>
          <span className={`${NUM} mt-1 block truncate text-[12.5px] leading-[18px] text-oa-muted-fg xl:hidden`}>
            {tickers}
            {more}
            {partial ? ` · ${priced} of ${basket.size} lines priced` : ""}
          </span>
          <span className={`${NUM} mt-1 flex gap-x-3 text-[12.5px] leading-[18px] text-oa-muted-fg lg:hidden`}>
            {BASKET_WINDOWS.filter((window) => window.id !== LEAD_WINDOW).map((window) => (
              <span key={window.id}>
                {window.label} <Pct value={basket.perf[window.id]?.pct} />
              </span>
            ))}
          </span>
        </span>
        <span className={`${NUM} hidden min-w-0 truncate text-[12.5px] text-oa-muted-fg xl:block`}>
          <span className="text-oa-fg">{tickers}</span>
          {more}
          {partial ? ` · ${priced}/${basket.size} priced` : ""}
        </span>
        {BASKET_WINDOWS.map((window) => (
          <span key={window.id} className="hidden text-right lg:block">
            <Pct value={basket.perf[window.id]?.pct} lead={window.id === LEAD_WINDOW} />
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
      <PageHead
        title="Idea baskets"
        lede="One idea per basket, with what would break it."
        className="[&_.oa-head-lede]:hidden"
      />

      <Panel flush>
        {baskets.length === 0 ? (
          <Empty title="No baskets yet">Try again in a few minutes.</Empty>
        ) : (
          <>
            <div className={`oa-caption hidden h-9 border-b border-oa-border bg-oa-bg px-4 ${ROW}`}>
              <span />
              <span>
                {baskets.length} ideas, {lines} lines
              </span>
              <span className="hidden xl:block">Leading names</span>
              {BASKET_WINDOWS.map((window) => (
                <span key={window.id} className={`text-right ${window.id === LEAD_WINDOW ? "text-oa-fg" : ""}`}>
                  {window.label}
                  {window.id === LEAD_WINDOW ? " ↓" : ""}
                </span>
              ))}
            </div>
            <p className="oa-caption border-b border-oa-border bg-oa-bg px-4 py-2 lg:hidden">
              {baskets.length} ideas, best this year first
            </p>
            {benchmark ? (
              <div className={`border-b border-oa-border px-4 py-2 text-[14px] text-oa-muted-fg ${ROW}`}>
                <span className="hidden lg:block" />
                <span className="flex items-baseline justify-between gap-3">
                  <span>S&amp;P 500 ({BASKET_BENCHMARK}), for scale</span>
                  <span className="lg:hidden">
                    <Pct value={benchmark[LEAD_WINDOW]} />
                  </span>
                </span>
                <span className="hidden xl:block" />
                {BASKET_WINDOWS.map((window) => (
                  <span key={window.id} className={`${NUM} hidden text-right lg:block`}>
                    {benchmark[window.id] == null ? "n/a" : `${benchmark[window.id]! > 0 ? "+" : benchmark[window.id]! < 0 ? "−" : ""}${Math.abs(benchmark[window.id]!).toFixed(1)}%`}
                  </span>
                ))}
              </div>
            ) : null}
            <ol>
              {ranked.map((basket, index) => (
                <BasketRow key={basket.slug} basket={basket} index={index} />
              ))}
            </ol>
          </>
        )}
      </Panel>

      <p className="mt-4 max-w-[70ch] text-[12.5px] leading-5 text-oa-muted-fg">
        Hypothetical equal-weight baskets, picked with hindsight, so the past flatters them. Not a recommendation to buy.
      </p>
    </AppPage>
  );
}
