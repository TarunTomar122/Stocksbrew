import { EmptyState } from "@/components/empty-state";
import {
  BlindSpotCard,
  EarningsStripCard,
  HeadlinesCard,
  MacroStripCard,
  MarketOverviewCard,
  SectorsCard,
  WatchlistGrid,
} from "@/components/cards";
import { Shell } from "@/components/shell";
import { getDashboardPayload } from "@/lib/api";
import { LOCAL_USER } from "@/lib/local-user";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 60;

function readString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const market = readString(sp?.market) === "india" ? "india" : "us";

  const payload = await getDashboardPayload(market);

  if (!payload) {
    return (
      <Shell activeNav="dashboard">
        <EmptyState
          title="No data yet"
          body="No data is available. Check back after the next pipeline run."
        />
      </Shell>
    );
  }

  const watchlistStocks = LOCAL_USER.watchlist
    .map((ticker) =>
      payload.stocks.find((s) => s.symbol.toUpperCase() === ticker.toUpperCase()),
    )
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const stocksToShow =
    watchlistStocks.length > 0 ? watchlistStocks : payload.stocks.slice(0, 12);

  const brief = payload.portfolioBrief;
  const briefText = brief?.narrative ?? payload.view.bottomLine;

  return (
    <Shell activeNav="dashboard" ribbonStocks={stocksToShow} searchStocks={payload.stocks} indices={payload.view.indices}>
      {/* ─── Header ─── */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">Dashboard</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-[#F5F6F8]">
          Hey {LOCAL_USER.firstName}. Here&apos;s your market.
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

        {/* Row 1: Mood + brief stacked | Macro */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          <MarketOverviewCard view={payload.view} />
          {briefText && (
            <div className="rounded-[10px] border border-[#252E42] bg-[#141A26] px-6 py-4">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8C94A8]">
                Today&apos;s brief
              </p>
              <p className="text-[14px] leading-relaxed text-[#F5F6F8]/80">{briefText}</p>
            </div>
          )}
          {brief && <BlindSpotCard brief={brief} />}
        </div>
        <div className="lg:col-span-4">
          <MacroStripCard view={payload.view} />
        </div>

        {/* Row 2: Earnings strip — full width, only if there are upcoming earnings */}
        <div className="lg:col-span-12">
          <EarningsStripCard stocks={stocksToShow} market={market} />
        </div>

        {/* Row 3: Watchlist | Sectors */}
        <div className="lg:col-span-8">
          <WatchlistGrid stocks={stocksToShow} market={market} />
        </div>
        <div className="lg:col-span-4">
          <SectorsCard sectors={payload.sectors} market={market} />
        </div>

        {/* Row 4: Headlines */}
        <div className="lg:col-span-12">
          <HeadlinesCard headlines={payload.view.keyHeadlines} />
        </div>

      </div>
    </Shell>
  );
}
