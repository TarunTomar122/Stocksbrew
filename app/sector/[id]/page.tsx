import { EmptyState } from "@/components/empty-state";
import { SectorDetail } from "@/components/sector-detail";
import { Shell } from "@/components/shell";
import { getMarketPageContext, getSector } from "@/lib/api";
import { LOCAL_USER } from "@/lib/local-user";

export const revalidate = 60;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SectorPage({ params }: PageProps) {
  const { id } = await params;
  const market = id.startsWith("india-") ? "india" : "us";

  const [sector, ctx] = await Promise.all([
    getSector(id),
    getMarketPageContext(market),
  ]);

  if (!sector) {
    return (
      <Shell activeNav="sector">
        <EmptyState
          title="Sector not found"
          body={`No data available for sector "${id}".`}
        />
      </Shell>
    );
  }

  const sectorTickers = new Set(sector.stocks.map((t) => t.toUpperCase()));
  const sectorStocks = ctx.stocks.filter((s) =>
    sectorTickers.has(s.symbol.toUpperCase()),
  );

  const watchlistStocks = LOCAL_USER.watchlist
    .map((ticker) =>
      ctx.stocks.find((s) => s.symbol.toUpperCase() === ticker.toUpperCase()),
    )
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const ribbonStocks =
    watchlistStocks.length > 0 ? watchlistStocks : ctx.stocks.slice(0, 12);

  return (
    <Shell
      activeNav="sector"
      ribbonStocks={ribbonStocks}
      searchStocks={ctx.stocks}
      indices={ctx.view?.indices ?? []}
    >
      <SectorDetail sector={sector} sectorStocks={sectorStocks} />
    </Shell>
  );
}
