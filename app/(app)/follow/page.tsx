import type * as React from "react";
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  FollowDirectory,
  type DirectoryTab,
} from "@/components/follow/follow-directory";
import { AppPage, PageHead, PageNote, ShowMore, TabBar, type TabItem } from "@/components/oa/kit";
import { InsightRow } from "@/components/oa/insight";
import { TallyBars } from "@/components/follow/stock-tally";
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
import { shortCompanyName } from "@/lib/plain-copy";
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
import Link from "next/link";

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
          <Link prefetch={false}
            href="/insiders"
            className="font-medium text-oa-fg hover:text-oa-primary"
          >
            All insider trades →
          </Link>
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
  const panel = (
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
  // Nothing to fold when there is nothing yet: the empty panel says so.
  if (stream.length === 0) return panel;
  return <ShowMore label={`Show the latest ${stream.length} ${stream.length === 1 ? "filing" : "filings"}`}>{panel}</ShowMore>;
}

/** A stock's name for a sentence: the short company name, else the ticker. */
const nameOf = (row: { ticker: string; name: string | null }) => shortCompanyName(row.name) || row.ticker;

/** The tab's one picture: a headline that says what stands out, then a bar per stock. */
function Focal({ label, title, note, children }: { label: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="oa-surface min-w-0 border border-oa-border bg-oa-card px-4 pb-3 pt-4 sm:px-5">
      <p className="oa-label">{label}</p>
      <h2 className="mt-1.5 text-balance text-[19px] font-semibold leading-[26px] tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-[29px]">{title}</h2>
      {note ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{note}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * The top of each tab: one focal card (what this group bought, as bars, with
 * what they sold one tap away), and beside it the other two groups in a line
 * each, so the page answers "what stands out" before the directory starts.
 */
async function ReadBlock({ read, tab }: { read: Promise<FollowRead | null>; tab: DirectoryTab }) {
  const data = await read;
  if (!data) return null;
  const quarter = data.fundPeriod ? quarterLabel(data.fundPeriod) : "";
  let focal: React.ReactNode = null;
  let ownIds: (id: string) => boolean = () => false;
  if (tab === "funds") {
    const bought = mostBought(data.fundTallies, 6);
    const sold = mostSold(data.fundTallies, 6);
    ownIds = (id) => id === "fund-crowd";
    focal = (
      <Focal
        label={quarter ? `${quarter} reports from ${data.fundsInPeriod} funds` : "Latest fund reports"}
        title={data.fundLead || (quarter ? `What funds bought in ${quarter}` : "What funds bought")}
        note="A fund counts once for a stock if it bought it for the first time or added to it."
      >
        <TallyBars rows={bought} side="buy" unit="fund" total={data.fundsInPeriod} empty="No fund reports to count yet." />
        {sold.length > 0 ? (
          <ShowMore always label="See what funds sold most" less="Hide what funds sold" className="mb-1">
            <p className="mt-3 text-[14px] font-medium text-oa-fg">Sold some or all in {quarter}</p>
            <TallyBars rows={sold} side="sell" unit="fund" total={data.fundsInPeriod} empty="No sales to count yet." />
          </ShowMore>
        ) : null}
      </Focal>
    );
  } else if (tab === "congress") {
    const bought = mostBought(data.congressTallies, 6);
    const sold = mostSold(data.congressTallies, 6);
    const top = bought[0];
    // Only name a leader when it is strictly ahead and more than one member bought it.
    const leads = top && top.buyers.length >= 2 && (bought[1]?.buyers.length ?? 0) < top.buyers.length;
    ownIds = (id) => id === "congress";
    focal = (
      <Focal
        label="Reported in the last 30 days"
        title={leads ? `More members of Congress reported buying ${nameOf(top)} than any other stock.` : "What members of Congress bought in the last 30 days"}
      >
        <TallyBars rows={bought} side="buy" unit="member" empty="No buys reported in the last 30 days." />
        {sold.length > 0 ? (
          <ShowMore always label="See what Congress sold most" less="Hide what Congress sold" className="mb-1">
            <p className="mt-3 text-[14px] font-medium text-oa-fg">Sold, last 30 days</p>
            <TallyBars rows={sold} side="sell" unit="member" empty="No sales reported in the last 30 days." />
          </ShowMore>
        ) : null}
      </Focal>
    );
  } else {
    const bought = data.insiderTallies.slice(0, 6);
    const top = bought[0];
    const leads = top && top.buyers.length >= 2 && (bought[1]?.buyers.length ?? 0) < top.buyers.length;
    ownIds = (id) => id.startsWith("insider");
    focal = (
      <Focal
        label="Insiders buying with their own money, last two weeks"
        title={
          leads && top
            ? `${nameOf(top)} had the most insiders buying: ${top.buyers.length} of them, ${fmtUsd(top.value ?? 0)} in all.`
            : "What company insiders bought in the last two weeks"
        }
      >
        <TallyBars rows={bought} side="buy" unit="insider" empty="No open-market insider buys in the last two weeks." />
      </Focal>
    );
  }
  const others = data.insights.filter((insight) => !ownIds(insight.id));
  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {focal}
      {others.length > 0 ? (
        <section className="oa-surface min-w-0 self-start border border-oa-border bg-oa-card px-4 pt-3 sm:px-5">
          <h2 className="oa-label">Also worth knowing</h2>
          {/* A narrow column: the link always sits under its sentence, as it does on a phone. */}
          <ul className="mt-1 divide-y divide-oa-border [&>li>a]:!col-start-2 [&>li>a]:!row-start-auto [&>li>a]:!mt-1.5 [&>li>a]:!justify-self-start [&>li]:!grid-cols-[12px_minmax(0,1fr)] [&>li]:!gap-x-3 [&>li_div]:!text-[14.5px]">
            {others.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
          {data.source ? <p className="border-t border-oa-border py-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg">{data.source}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

const TAB_HEAD: Record<DirectoryTab, { title: string; lede: string }> = {
  funds: {
    title: "What big funds bought and sold",
    lede: "Big funds report what they own once a quarter, about six weeks after the quarter ends, so these moves are weeks old by the time anyone sees them.",
  },
  congress: {
    title: "What members of Congress bought and sold",
    lede: "Members of Congress report their trades within about six weeks, as a range of dollar amounts rather than exact figures.",
  },
  insiders: {
    title: "What company insiders bought",
    lede: "Executives and directors report buying their own company's stock within two business days, so this is the freshest of the three.",
  },
};

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
      {/* One story per tab: the title says which of the three you are looking at. */}
      <PageHead
        title={TAB_HEAD[tab].title}
        lede={TAB_HEAD[tab].lede}
        full
        actions={
          tab === "insiders" ? undefined : (
            <Link prefetch={false}
              href="/follow/copy"
              className="inline-flex min-h-10 items-center whitespace-nowrap text-[14px] font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg sm:min-h-0"
            >
              Whose moves were worth copying? →
            </Link>
          )
        }
      />
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
