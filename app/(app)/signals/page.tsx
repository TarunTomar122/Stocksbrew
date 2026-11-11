import type { Metadata } from "next";

import { TheRead } from "@/components/oa/insight";
import { AppPage, PageHead, SourceLine, fmtStampET } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { MoversTab, PolicyTab, RedditTab, SignalsBar, TodayTab } from "@/components/signals/signals-view";
import { clipByAge } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { loadMovers, loadPolicy, loadReddit } from "@/lib/signals";
import { buildMoversRead, buildPolicyRead, buildRedditRead, buildSignalsTodayRead } from "@/lib/signals-insights";
import { SIGNALS_TABS, parseSignalsFilters, pickToday, signalsHref } from "@/lib/signals-shared";
import { ogImage } from "@/lib/og/url";
import { loadUpcomingReports, todayET, withReports } from "@/app/(app)/explore/desk-data";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Unusual stock moves with the reason we could confirm, the stocks Reddit is loudest about against their own baseline, and Trump's market posts with the move since.";

/** Each tab answers a different search, so each has its own title and address. Filters inside a tab keep the tab's address. */
const TAB_META: Record<string, { title: string; description: string }> = {
  movers: {
    title: "Unusual Stock Movers Today, with the Reason When We Found One",
    description: "The US stocks moving most against their own normal range today. Each one says why it moved when we could confirm a reason, and says so when we could not.",
  },
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
  const title = own?.title ?? "Stock Signals: Unusual Movers, Reddit Mentions and Policy Posts";
  const description = own?.description ?? DESCRIPTION;
  const canonical = own ? `/signals?tab=${tab}` : "/signals";
  const shareImage = ogImage(["page", "signals"], "Today's signals: unusual movers, Reddit and policy posts", { daily: true });
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
  const today = todayET(new Date(now));
  // The next three weeks of reports ride along, for a read card's "Watch next" line (cached with Market today's).
  const [movers, reddit, policyAll, viewer, upcoming] = await Promise.all([loadMovers(), loadReddit(now), loadPolicy(), getViewer(), loadUpcomingReports(today)]);
  // The archive past seven days is Pro (lib/entitlements.ts: signals_archive). Older rows are dropped here, on the
  // server, and only their count goes to the page.
  const archive = clipByAge("signals_archive", viewer.plan, policyAll.posts, (post) => post.publishedAt, now);
  const policy = { ...policyAll, posts: archive.items };

  const counts = { today: null, movers: movers.movers.length, reddit: reddit.names.length, policy: policy.posts.length } as const;
  const tabs = SIGNALS_TABS.map((tab) => ({ id: tab.id, label: tab.label, href: signalsHref(filters, { tab: tab.id }), count: counts[tab.id] }));

  // Intraday moves are the only thing here where the time matters to the reader.
  const source = filters.tab === "today" || filters.tab === "movers" ? <SourceLine asOf={fmtStampET(movers.generatedAt)} /> : null;

  // The read for the tab: what the rows below add up to, computed from them.
  const read =
    filters.tab === "movers"
      ? buildMoversRead(movers.movers, movers.generatedAt)
      : filters.tab === "reddit"
        ? buildRedditRead(reddit.names, reddit.generatedAt)
        : filters.tab === "policy"
          ? buildPolicyRead(policy.posts, now, policy.generatedAt)
          : buildSignalsTodayRead(movers.movers, reddit.names, policy.posts, now, movers.generatedAt);

  return (
    <AppPage>
      <MarketingSchema path="/signals" name="Market Signals" description={DESCRIPTION} breadcrumbLabel="Signals" />
      <PageHead
        title="Signals: what people are saying about stocks"
        lede="What Reddit is talking about and what the President posted about the market. The day's big moves and their reasons are on Why stocks moved."
        meta={source}
      />
      <SignalsBar tabs={tabs} filters={filters} movers={movers} policy={policy} />
      <TheRead read={read ? withReports(read, upcoming, today) : read} className="mb-4" />
      {filters.tab === "today" ? (
        <TodayTab pick={pickToday(movers.movers, reddit.names, policy.posts, now)} movers={movers} reddit={reddit} policy={policy} filters={filters} now={now} />
      ) : null}
      {filters.tab === "movers" ? <MoversTab data={movers} filters={filters} /> : null}
      {filters.tab === "reddit" ? <RedditTab data={reddit} /> : null}
      {filters.tab === "policy" ? (
        <PolicyTab
          data={policy}
          filters={filters}
          archive={archive.hidden > 0 ? { hidden: archive.hidden, days: archive.days ?? 7, plan: viewer.plan, trialEligible: viewer.trialEligible } : null}
        />
      ) : null}
    </AppPage>
  );
}
