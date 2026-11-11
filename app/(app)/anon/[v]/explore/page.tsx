import { AnonViewFreshness } from "@/components/anon-view-freshness";
import ExplorePage from "@/app/(app)/explore/page";

export { generateMetadata } from "@/app/(app)/explore/page";

/** The signed-out /explore, served from the CDN and rebuilt at most once a minute (lib/anon-view.ts). */
export const dynamic = "force-static";
export const revalidate = 60;

/** Nothing is built with the deployment (a build-time copy could hold a failed read): the first request builds it. */
export function generateStaticParams() {
  return [];
}

export default function AnonExplorePage() {
  return (
    <>
      <ExplorePage />
      <AnonViewFreshness renderedAt={new Date().toISOString()} />
    </>
  );
}
