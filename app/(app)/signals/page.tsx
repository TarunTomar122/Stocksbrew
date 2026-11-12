import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppPage, PageHead, fmtStampET } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { PolicySection, RedditSection } from "@/components/signals/signals-view";
import { clipByAge } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { loadPolicy, loadReddit } from "@/lib/signals";
import { legacySignalsHref, parseSignalsFilters } from "@/lib/signals-shared";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

const TITLE = "Stock Signals: Reddit Mentions and the President's Market Posts";
const DESCRIPTION =
  "The stocks Reddit is loudest about against their own baseline, what people say about each one, and Trump's market posts with the move since.";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "signals"], "Today's signals: Reddit and policy posts", { daily: true });
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/signals" },
    openGraph: { title: `${TITLE} · stocksbrew`, description: DESCRIPTION, url: "https://www.stocksbrew.online/signals", images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description: DESCRIPTION, images: [shareImage] },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * One page, no tabs (owner, Nov 12: "You don't need tabs for this"): what Reddit is talking about first, then what the
 * President posted. An old `?tab=` address lands on its section (`/signals#policy`).
 */
export default async function SignalsPage({ searchParams }: { searchParams?: SearchParams }) {
  const legacy = legacySignalsHref(searchParams);
  if (legacy) redirect(legacy);

  const filters = parseSignalsFilters(searchParams);
  const now = Date.now();
  const [reddit, policyAll, viewer] = await Promise.all([loadReddit(now), loadPolicy(), getViewer()]);
  // The archive past seven days is Pro (lib/entitlements.ts: signals_archive). Older rows are dropped here, on the
  // server, and only their count goes to the page.
  const archive = clipByAge("signals_archive", viewer.plan, policyAll.posts, (post) => post.publishedAt, now);
  const policy = { ...policyAll, posts: archive.items };
  const asOf = reddit.generatedAt ?? policy.generatedAt;

  return (
    <AppPage>
      <MarketingSchema path="/signals" name="Market Signals" description={DESCRIPTION} breadcrumbLabel="Signals" />
      <PageHead title="Signals: what people are saying about stocks" />
      <RedditSection data={reddit} />
      <PolicySection
        data={policy}
        filters={filters}
        className="mt-5"
        archive={archive.hidden > 0 ? { hidden: archive.hidden, days: archive.days ?? 7, plan: viewer.plan, trialEligible: viewer.trialEligible } : null}
      />
      {/* The page's one time, quiet, under its rows. */}
      {asOf ? <p className="mt-3 px-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-0">As of {fmtStampET(asOf)}</p> : null}
    </AppPage>
  );
}
