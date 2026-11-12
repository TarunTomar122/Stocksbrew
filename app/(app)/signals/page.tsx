import type { Metadata } from "next";

import { AppPage, PageHead, fmtStampET } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { PolicyTab, RedditTab, SignalsBar, TodayTab } from "@/components/signals/signals-view";
import { clipByAge } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { loadMovers, loadPolicy, loadReddit } from "@/lib/signals";
import { SIGNALS_TABS, inRedditList, parseSignalsFilters, pickToday, signalsHref } from "@/lib/signals-shared";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "The stocks Reddit is loudest about against their own baseline, what people say about each one, and Trump's market posts with the move since.";

/** Each tab answers a different search, so each has its own title and address. Filters inside a tab keep the tab's address. */
const TAB_META: Record<string, { title: string; description: string }> = {
  reddit: {
    title: "Most Mentioned Stocks on Reddit",
    description: "The stocks Reddit is loudest about, each measured against its own usual level of mentions.",
  },
  policy: {
    title: "Trump's Market Posts and the Stocks He Named",
    description: "Trump's posts about markets and companies, with the stocks he named and how each has moved since the post.",
  },
};

export function generateMetadata({ searchParams }: { searchParams?: SearchParams }): Metadata {
  const tab = parseSignalsFilters(searchParams).tab;
  const own = TAB_META[tab];
  const title = own?.title ?? "Stock Signals: Reddit Mentions and the President's Market Posts";
  const description = own?.description ?? DESCRIPTION;
  const canonical = own ? `/signals?tab=${tab}` : "/signals";
  const shareImage = ogImage(["page", "signals"], "Today's signals: Reddit and policy posts", { daily: true });
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: `${title} · stocksbrew`, description, url: `https://www.stocksbrew.online${canonical}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SignalsPage({ searchParams }: { searchParams?: SearchParams }) {
  const filters = parseSignalsFilters(searchParams);
  const now = Date.now();
  const [movers, reddit, policyAll, viewer] = await Promise.all([loadMovers(), loadReddit(now), loadPolicy(), getViewer()]);
  // The archive past seven days is Pro (lib/entitlements.ts: signals_archive). Older rows are dropped here, on the
  // server, and only their count goes to the page.
  const archive = clipByAge("signals_archive", viewer.plan, policyAll.posts, (post) => post.publishedAt, now);
  const policy = { ...policyAll, posts: archive.items };

  // No "0" beside an empty tab (owner rule 4): a count only when there is something to count.
  const counts = { today: null, reddit: reddit.names.filter(inRedditList).length || null, policy: policy.posts.length || null } as const;
  const tabs = SIGNALS_TABS.map((tab) => ({ id: tab.id, label: tab.label, href: signalsHref(filters, { tab: tab.id }), count: counts[tab.id] }));

  const asOf = filters.tab === "reddit" ? reddit.generatedAt : filters.tab === "policy" ? policy.generatedAt : (reddit.generatedAt ?? movers.generatedAt);

  return (
    <AppPage>
      <MarketingSchema path="/signals" name="Market Signals" description={DESCRIPTION} breadcrumbLabel="Signals" />
      <PageHead title="Signals: what people are saying about stocks" />
      <SignalsBar tabs={tabs} filters={filters} policy={policy} />
      {filters.tab === "today" ? (
        <TodayTab pick={pickToday(movers.movers, reddit.names, policy.posts, now)} movers={movers} reddit={reddit} policy={policy} filters={filters} now={now} />
      ) : null}
      {filters.tab === "reddit" ? <RedditTab data={reddit} /> : null}
      {filters.tab === "policy" ? (
        <PolicyTab
          data={policy}
          filters={filters}
          archive={archive.hidden > 0 ? { hidden: archive.hidden, days: archive.days ?? 7, plan: viewer.plan, trialEligible: viewer.trialEligible } : null}
        />
      ) : null}
      {/* The tab's one time, quiet, under its rows. */}
      {asOf ? <p className="mt-3 px-2 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-0">As of {fmtStampET(asOf)}</p> : null}
    </AppPage>
  );
}
