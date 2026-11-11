import { AnonViewFreshness } from "@/components/anon-view-freshness";
import BriefingPage from "@/app/(app)/briefing/page";

export { generateMetadata } from "@/app/(app)/briefing/page";

/** The signed-out /briefing, served from the CDN and rebuilt at most once a minute (lib/anon-view.ts). */
export const dynamic = "force-static";
export const revalidate = 60;

/** Nothing is built with the deployment (a build-time copy could hold a failed read): the first request builds it. */
export function generateStaticParams() {
  return [];
}

export default function AnonBriefingPage() {
  return (
    <>
      <BriefingPage searchParams={{}} />
      <AnonViewFreshness renderedAt={new Date().toISOString()} />
    </>
  );
}
