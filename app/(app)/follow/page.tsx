import type * as React from "react";
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  FollowDirectory,
  type DirectoryTab,
} from "@/components/follow/follow-directory";
import { AppPage, CardGrid, PageHead, PageNote, TabBar, type TabItem } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { StockTallyPanel } from "@/components/follow/stock-tally";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";
import {
  ClusterCard,
  InsiderRow,
  InsiderTableHead,
} from "@/components/follow/insider-rows";
import { MovesStream } from "@/components/follow/moves-stream";
import { Panel } from "@/components/follow/panel";
import { getSessionUser } from "@/lib/auth-server";
import { mostBought, mostSold, type FollowRead } from "@/lib/follow-insights";
import { quarterLabel } from "@/lib/follow-shared";
import { getUserDoc } from "@/lib/watchlist";
import {
  fmtUsd,
  getFollowActivity,
  getFollowRead,
  getFollowMeta,
  getFollowSources,
  getFollowedSources,
  getInsiderBuys,
  getInsiderSummary,
  type FollowMeta,
  type FollowSource,
} from "@/lib/follow";
import { ogImage } from "@/lib/og/url";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "follow"], "What funds, lawmakers and insiders just filed", { daily: true });
  return {
    title: "13F Fund Holdings, Congress Stock Trades and Insider Buying",
    description:
      "What well-known funds, members of Congress and company insiders bought and sold, from 13F filings, House trade reports and SEC Form 4. Each record starts on the day the filing became public and is measured against the S&P 500.",
    alternates: { canonical: "/follow" },
    openGraph: { title: "13F Fund Holdings, Congress Stock Trades and Insider Buying · stocksbrew", url: "https://www.stocksbrew.online/follow", images: [shareImage] },
    twitter: { card: "summary_large_image", images: [shareImage] },
  };
}

/** The table only needs a slice of each card; the rest stays on the server. */
function lean(source: FollowSource): FollowSource {
  const spark = (values?: number[]) => {
    if (!values || values.length < 2) return undefined;
    const step = Math.max(1, Math.floor(values.length / 28));
    const out = values
      .filter((_, index) => index % step === 0)
      .map((value) => Number(value.toFixed(3)));
    if (out[out.length - 1] !== Number(values[values.length - 1].toFixed(3)))
      out.push(Number(values[values.length - 1].toFixed(3)));
    return out;
  };
  return {
    id: source.slug,
    slug: source.slug,
    kind: source.kind,
    name: source.name,
    person: source.person,
    style: "",
    active: source.active,
    latest_date: source.latest_date,
    headline: "",
    stock_value: source.stock_value,
    top_holdings: (source.top_holdings ?? []).slice(0, 3),
    performance: source.performance
      ? {
          ...source.performance,
          spark: spark(source.performance.spark),
          spark_spy: spark(source.performance.spark_spy),
        }
      : null,
    party: source.party,
    stats: undefined,
    source: "",
    source_url: "",
    updated_at: "",
  };
}

function tabOf(value: string | string[] | undefined): DirectoryTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "congress" || tab === "insiders" ? tab : "funds";
}

/*
 * The page awaits nothing itself: the head and the tab row are on screen at
 * once, and each block below waits only for the reads it shows. Every read is
 * started once here and handed down as a promise, so two blocks that need the
 * same list share one request.
 */

type InsiderSummary = Awaited<ReturnType<typeof getInsiderSummary>>;

function splitSources(sources: FollowSource[]) {
  return {
    funds: sources.filter((source) => source.kind === "fund"),
    congress: sources.filter((source) => source.kind === "congress"),
  };
}

function tabItems(counts?: { funds: number; congress: number }): TabItem[] {
  return [
    { id: "funds", label: "Funds", href: "/follow", count: counts?.funds || null },
    { id: "congress", label: "Congress", href: "/follow?tab=congress", count: counts?.congress || null },
    { id: "insiders", label: "Insiders", href: "/follow?tab=insiders" },
  ];
}

async function FollowTabs({ tab, sources }: { tab: DirectoryTab; sources: Promise<FollowSource[]> }) {
  const { funds, congress } = splitSources(await sources);
  return <TabBar current={tab} tabs={tabItems({ funds: funds.length, congress: congress.length })} />;
}

async function InsidersTab({
  insiderSummary,
  insiderBuys,
}: {
  insiderSummary: Promise<InsiderSummary>;
  insiderBuys: ReturnType<typeof getInsiderBuys>;
}) {
  const [summary, buys] = await Promise.all([insiderSummary, insiderBuys]);
  const insiderMeta = summary.meta;
  const biggestBuys = [...buys]
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 8);
  return (
    <div className="space-y-4">
      {insiderMeta ? (
        <p className="text-[14px] leading-5 text-oa-muted-fg">
          Past {insiderMeta.days} days:{" "}
          <span className="font-medium text-oa-fg">{insiderMeta.buys.toLocaleString("en-US")} buys</span> worth {fmtUsd(insiderMeta.buy_value)},{" "}
          <span className="font-medium text-oa-fg">{insiderMeta.sells.toLocaleString("en-US")} sales</span> worth {fmtUsd(insiderMeta.sell_value)}.
        </p>
      ) : null}
      {summary.clusters.length > 0 ? (
        <div>
          <p className="oa-label mb-2">Several insiders buying one stock</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summary.clusters.slice(0, 6).map((cluster) => (
              <ClusterCard key={cluster.symbol} cluster={cluster} />
            ))}
          </div>
        </div>
      ) : null}
      <Panel
        title={
          insiderMeta
            ? `Largest insider buys, past ${insiderMeta.days} days`
            : "Largest insider buys"
        }
        right={
          <a
            href="/insiders"
            className="font-medium text-oa-fg hover:text-oa-primary"
          >
            All insider trades →
          </a>
        }
      >
        {biggestBuys.length > 0 ? (
          <>
            <InsiderTableHead />
            <ul className="divide-y divide-oa-border">
              {biggestBuys.map((trade) => (
                <InsiderRow key={trade.id} trade={trade} />
              ))}
            </ul>
          </>
        ) : (
          <p className="px-4 py-5 text-[14px] text-oa-muted-fg">
            No open-market insider buys yet.
          </p>
        )}
      </Panel>
    </div>
  );
}

/** The tab row as the directory's own top row: the search sits at its right end on a desktop. */
const BAR = "!mb-0 min-w-0 lg:flex-1 lg:!border-b-0";

async function DirectoryTabBody({
  tab,
  sources,
  followed,
  meta,
}: {
  tab: Exclude<DirectoryTab, "insiders">;
  sources: Promise<FollowSource[]>;
  followed: Promise<string[]>;
  meta: Promise<FollowMeta>;
}) {
  const [all, mine, followMeta] = await Promise.all([sources, followed, meta]);
  const { funds, congress } = splitSources(all);
  const fundsNote = <span>Before costs and taxes.</span>;
  const congressNote = (
    <span>
      Held from each filing date until the member reported selling.
      {followMeta.congress ? ` ${followMeta.congress.trades.toLocaleString("en-US")} trades since ${followMeta.congress.years[0]}.` : ""}
    </span>
  );
  return (
    <FollowDirectory
      key={tab}
      tab={tab}
      sources={(tab === "funds" ? funds : congress).map(lean)}
      followed={mine}
      note={tab === "funds" ? fundsNote : congressNote}
      bar={<TabBar current={tab} tabs={tabItems({ funds: funds.length, congress: congress.length })} className={BAR} />}
    />
  );
}

async function LatestMoves({
  activity,
  followed,
}: {
  activity: ReturnType<typeof getFollowActivity>;
  followed: Promise<string[]>;
}) {
  const [events, followedIds] = await Promise.all([activity, followed]);
  const followedSet = new Set(followedIds);
  const mine = events.filter((event) => followedSet.has(event.source_id));
  const stream = [
    ...mine,
    ...events.filter((event) => !followedSet.has(event.source_id)),
  ].slice(0, 24);
  return (
    <Panel
      title={mine.length > 0 ? "Latest moves, yours first" : "Latest moves"}
      right={<span>Newest filing first</span>}
    >
      <MovesStream
        events={stream}
        emptyText="No filings yet."
      />
    </Panel>
  );
}

/** The read for the whole surface, then the tab's stocks grouped by who bought and sold them. */
async function ReadBlock({ read, tab }: { read: Promise<FollowRead | null>; tab: DirectoryTab }) {
  const data = await read;
  if (!data) return null;
  const quarter = data.fundPeriod ? quarterLabel(data.fundPeriod) : "";
  let panels: React.ReactNode = null;
  if (tab === "funds") {
    const bought = mostBought(data.fundTallies, 6);
    const sold = mostSold(data.fundTallies, 6);
    const top = bought[0];
    const cut = sold[0];
    panels = (
      <>
        <StockTallyPanel
          label={`Most bought by funds · ${quarter}`}
          side="buy"
          unit="fund"
          rows={bought}
          empty="No fund filings to count yet."
          takeaway={
            top ? `${top.buyers.length} of ${data.fundsInPeriod} funds bought or added to ${top.ticker}${top.opened ? `, ${top.opened} of them as a new position` : ""}.` : undefined
          }
        />
        <StockTallyPanel
          label={`Most sold by funds · ${quarter}`}
          side="sell"
          unit="fund"
          rows={sold}
          empty="No fund filings to count yet."
          takeaway={cut ? `${cut.sellers.length} funds trimmed or sold ${cut.ticker}; ${cut.buyers.length} bought it.` : undefined}
        />
      </>
    );
  } else if (tab === "congress") {
    const bought = mostBought(data.congressTallies, 6);
    const sold = mostSold(data.congressTallies, 6);
    const top = bought[0];
    const cut = sold[0];
    panels = (
      <>
        <StockTallyPanel
          label="Most bought by Congress · 30 days"
          side="buy"
          unit="member"
          rows={bought}
          empty="No buys reported in the last 30 days."
          takeaway={top ? `${top.buyers.length} ${top.buyers.length === 1 ? "member" : "members"} reported buying ${top.ticker}, more than any other stock.` : undefined}
        />
        <StockTallyPanel
          label="Most sold by Congress · 30 days"
          side="sell"
          unit="member"
          rows={sold}
          empty="No sales reported in the last 30 days."
          takeaway={cut ? `${cut.sellers.length} ${cut.sellers.length === 1 ? "member" : "members"} reported selling ${cut.ticker}.` : undefined}
        />
      </>
    );
  } else {
    const bought = data.insiderTallies.slice(0, 6);
    const top = bought[0];
    panels = (
      <StockTallyPanel
        label="Most bought by insiders · 2 weeks"
        side="buy"
        unit="insider"
        rows={bought}
        empty="No open-market insider buys in the last two weeks."
        takeaway={top ? `${top.ticker} drew the most insiders buying with their own money: ${top.buyers.length}, ${fmtUsd(top.value ?? 0)} in all.` : undefined}
      />
    );
  }
  return (
    <>
      <TheRead read={data} className="mb-4" />
      {tab === "insiders" ? (
        <div className="mb-5">{panels}</div>
      ) : (
        <CardGrid cols={2} className="mb-5">
          {panels}
        </CardGrid>
      )}
    </>
  );
}

export default function FollowPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const tab = tabOf(searchParams?.tab);
  // Started together, awaited where they are shown. Each one resolves to a
  // fallback instead of rejecting, so a failed read empties its own block only.
  const sources = getFollowSources().catch(() => [] as FollowSource[]);
  const activity = getFollowActivity(40).catch(() => []);
  const meta = getFollowMeta().catch((): FollowMeta => ({ funds: null, congress: null }));
  const insiderSummary = getInsiderSummary().catch((): InsiderSummary => ({ clusters: [], meta: null }));
  // Per person, never cached. A failed session read shows the page as signed out.
  const session = getSessionUser().catch(() => null);
  const followed = session.then((user) => getFollowedSources(user?.uid));
  // "Your stocks" in the read: the US tickers the signed-in reader tracks.
  const read = session
    .then((user) => (user ? getUserDoc(user.uid).catch(() => null) : null))
    .then((doc) =>
      getFollowRead(
        (doc?.tracked_stocks ?? [])
          .filter((id): id is string => typeof id === "string" && id.startsWith("US_"))
          .map((id) => id.slice(3).replace(/_/g, ".")),
      ),
    )
    .catch(() => null);

  return (
    <AppPage>
      <MarketingSchema path="/follow" name="13F Fund Holdings, Congress Stock Trades and Insider Buying" description="What well-known funds, members of Congress and company insiders bought and sold, from 13F filings, House trade reports and SEC Form 4." breadcrumbLabel="Follow" />
      <PageHead title="What funds, lawmakers and insiders just filed" note={false} />
      <Suspense fallback={<div aria-busy="true" className="mb-4"><PanelGhost rows={4} /></div>}>
        <ReadBlock read={read} tab={tab} />
      </Suspense>

      {tab === "insiders" ? (
        <>
          {/* The tabs work before the counts arrive. */}
          <Suspense fallback={<TabBar current={tab} tabs={tabItems()} />}>
            <FollowTabs tab={tab} sources={sources} />
          </Suspense>
          <Suspense
            fallback={
              <div className="space-y-4" aria-busy="true">
                <div>
                  <Bar className="mb-2 h-5 w-[30rem] max-w-full" />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className="oa-surface h-[9.5rem] border border-oa-border bg-oa-card p-4">
                        <Bar className="h-4 w-24" />
                        <Bar className="mt-3 h-3 w-40 max-w-full" />
                        <Bar className="mt-5 h-3 w-full" />
                        <Bar className="mt-2 h-3 w-2/3" />
                      </div>
                    ))}
                  </div>
                </div>
                <PanelGhost rows={8} />
              </div>
            }
          >
            <InsidersTab insiderSummary={insiderSummary} insiderBuys={getInsiderBuys(200).catch(() => [])} />
          </Suspense>
        </>
      ) : (
        <Suspense
          key={tab}
          fallback={
            <div aria-busy="true">
              <TabBar current={tab} tabs={tabItems()} />
              <PanelGhost rows={14} />
            </div>
          }
        >
          <DirectoryTabBody tab={tab} sources={sources} followed={followed} meta={meta} />
        </Suspense>
      )}

      <div className="mt-6">
        <Suspense fallback={<div aria-busy="true"><PanelGhost rows={10} /></div>}>
          <LatestMoves activity={activity} followed={followed} />
        </Suspense>
      </div>
      <PageNote lede="Each record starts the day a filing went public, the first day anyone could act on it." />
    </AppPage>
  );
}
