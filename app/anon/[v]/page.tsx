import { AnonViewFreshness } from "@/components/anon-view-freshness";
import HomePage from "@/app/page";

export { generateMetadata } from "@/app/page";

/**
 * The signed-out home page, served from the CDN and rebuilt at most once a
 * minute (lib/anon-view.ts). Visitors from India get the live page: its
 * plans block offers the trial only outside India.
 */
export const dynamic = "force-static";
export const revalidate = 60;

/** Nothing is built with the deployment (a build-time copy could hold a failed read): the first request builds it. */
export function generateStaticParams() {
  return [];
}

export default function AnonHomePage() {
  return (
    <>
      <HomePage />
      <AnonViewFreshness renderedAt={new Date().toISOString()} />
    </>
  );
}
