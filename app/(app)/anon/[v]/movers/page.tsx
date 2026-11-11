import { AnonViewFreshness } from "@/components/anon-view-freshness";
import MoversPage from "@/app/(app)/movers/page";

export { generateMetadata } from "@/app/(app)/movers/page";

/**
 * The signed-out /movers, served from the CDN (lib/anon-view.ts). Same
 * ten-minute rebuild as the live page: the list changes once a day.
 */
export const dynamic = "force-static";
export const revalidate = 600;

/** Nothing is built with the deployment (a build-time copy could hold a failed read): the first request builds it. */
export function generateStaticParams() {
  return [];
}

export default function AnonMoversPage() {
  return (
    <>
      <MoversPage />
      <AnonViewFreshness renderedAt={new Date().toISOString()} maxAgeMinutes={30} />
    </>
  );
}
