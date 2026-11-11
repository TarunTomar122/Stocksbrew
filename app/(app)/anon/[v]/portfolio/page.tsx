import { AnonViewFreshness } from "@/components/anon-view-freshness";
import PortfolioHomePage from "@/app/(app)/portfolio/page";

export { metadata } from "@/app/(app)/portfolio/page";

/**
 * The signed-out /portfolio (the example portfolio), served from the CDN and
 * rebuilt at most every two minutes (lib/anon-view.ts). Everyone signed out
 * sees the same example, so it need not be worked out again per visit.
 * `force-static` makes cookies() read as empty, so this is exactly the
 * signed-out page; a copy built while a source was slow or failing is kept
 * for seconds only (lib/portfolio-home/server.ts).
 */
export const dynamic = "force-static";
export const revalidate = 120;

/** Nothing is built with the deployment (a build-time copy could hold a failed read): the first request builds it. */
export function generateStaticParams() {
  return [];
}

export default function AnonPortfolioPage() {
  return (
    <>
      <PortfolioHomePage />
      <AnonViewFreshness renderedAt={new Date().toISOString()} />
    </>
  );
}
