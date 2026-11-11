import { AnonViewFreshness } from "@/components/anon-view-freshness";
import StockPage from "@/app/(app)/stock/[symbol]/page";

export { generateMetadata } from "@/app/(app)/stock/[symbol]/page";

/**
 * The signed-out /stock/<T>, served from the CDN and rebuilt at most once a
 * minute (lib/anon-view.ts). `force-static` makes cookies() and headers()
 * read as empty, so this is exactly what a visitor without a session sees.
 * Unknown tickers still get a 404 and the not-found page next to this file.
 */
export const dynamic = "force-static";
export const revalidate = 60;

/** Nothing is built with the deployment: each stock is built the first time someone asks for it. */
export function generateStaticParams() {
  return [];
}

export default function AnonStockPage({ params }: { params: { v: string; symbol: string } }) {
  return (
    <>
      <StockPage params={Promise.resolve({ symbol: params.symbol })} />
      <AnonViewFreshness renderedAt={new Date().toISOString()} />
    </>
  );
}
