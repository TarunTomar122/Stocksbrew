import type { Metadata } from "next";
import Link from "next/link";

import { BestCard, HubAnswer, PlainRankTable, kindTally } from "@/components/copy-trades/hub";
import { UnrankedList } from "@/components/copy-trades/parts";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, CardGrid, Empty, ShowMore } from "@/components/oa/kit";
import { COPY_HUB_PATH, copyHref, getCopyHub, rankRows, type CopyHub, type CopyHubRow } from "@/lib/copy-trades";
import { fmtDate } from "@/lib/follow-shared";
import { ogImage } from "@/lib/og/url";

/**
 * The ranked hub: every fund and House member we follow, copied with one
 * stated rule from the public disclosure dates, ranked by how far ahead of
 * (or behind) the S&P 500 the copy ran each year. Free for everyone.
 */

export const revalidate = 3600;

const BASE = "https://www.stocksbrew.online";
/** Rows of each ranking shown before "show the other N"; the rest are in the page, folded. */
const SHOWN = 10;
/** The fold button sits inside a flush panel: give it the panel's gutter. */
const FOLD = "[&>button]:mx-4 [&>button]:mb-3 [&>button]:w-[calc(100%-2rem)]";
const TITLE = "Whose Moves Were Worth Copying? 13F Funds and Congress, Backtested";
const DESCRIPTION =
  "Every 13F fund and House member we follow, copied at the close of the first trading day after each filing or trade report became public, ranked against the S&P 500. The rule, the period and the record for each.";

export async function generateMetadata(): Promise<Metadata> {
  const shareImage = ogImage(["page", "follow"], "Whose moves were worth copying? Funds and Congress against the S&P 500", { daily: true });
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: COPY_HUB_PATH },
    openGraph: { title: `${TITLE} · stocksbrew`, description: DESCRIPTION, url: `${BASE}${COPY_HUB_PATH}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description: DESCRIPTION, images: [shareImage] },
  };
}

/** One group shown under the ranking but not in it: records that ended, or are too short. */
function NotRanked({ title, rows, scaleRows, who }: { title: string; rows: CopyHubRow[]; scaleRows: CopyHubRow[]; who: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-oa-border">
      <p className="px-4 pb-2 pt-3 text-[14px] font-medium text-oa-fg">{title}</p>
      <PlainRankTable rows={rows} scaleRows={scaleRows} numbered={false} who={who} />
    </div>
  );
}

function KindPanel({ hub, kind }: { hub: CopyHub; kind: "fund" | "congress" }) {
  const { ranked, ended, short, untested } = rankRows(hub.rows, kind);
  const { label } = kindTally(hub, kind);
  const who = kind === "fund" ? "Fund" : "Member";
  const all = [...ranked, ...ended, ...short];
  return (
    <section className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex items-start justify-between gap-3 border-b border-oa-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-pretty text-[16px] font-semibold leading-[22px] text-oa-fg">{label}</h2>
          <p className="mt-0.5 text-pretty text-[13px] leading-[19px] text-oa-muted-fg">
            Best first, by how much more the copy made each year than the S&amp;P 500 over the same dates. Tap a {kind === "fund" ? "fund" : "member"} for the full results.
          </p>
        </div>
        <span className={`oa-mono shrink-0 pt-0.5 text-[12.5px] text-oa-muted-fg`}>{ranked.length} ranked</span>
      </div>
      {ranked.length > 0 ? (
        <PlainRankTable rows={ranked.slice(0, SHOWN)} scaleRows={all} who={who} />
      ) : (
        <Empty title="Nobody to rank yet">None has two years of record we could copy.</Empty>
      )}
      {ranked.length > SHOWN ? (
        <div className="border-t border-oa-border">
          <ShowMore always label={`Show the other ${ranked.length - SHOWN} ${kind === "fund" ? "funds" : "members"}`} className={FOLD}>
            <PlainRankTable rows={ranked.slice(SHOWN)} offset={SHOWN} scaleRows={all} head={false} who={who} />
          </ShowMore>
        </div>
      ) : null}
      {ended.length + short.length + untested.length > 0 ? (
        <div className="border-t border-oa-border">
          <ShowMore
            always
            label={`Who isn't ranked, and why (${[
              ended.length ? `${ended.length} ended` : "",
              short.length ? `${short.length} too short` : "",
              untested.length ? `${untested.length} not tested` : "",
            ]
              .filter(Boolean)
              .join(", ")})`}
            less="Hide who isn't ranked"
            className={FOLD}
          >
            <NotRanked title="Record ended more than three months ago" rows={ended} scaleRows={all} who={who} />
            <NotRanked title="Less than two years of record" rows={short} scaleRows={all} who={who} />
            {untested.length > 0 ? (
              <div className="border-t border-oa-border">
                <p className="px-4 pb-1 pt-3 text-[14px] font-medium text-oa-fg">Too little to copy</p>
                <UnrankedList rows={untested} />
              </div>
            ) : null}
          </ShowMore>
        </div>
      ) : null}
    </section>
  );
}

/** One ItemList per ranking: funds and members are ranked separately, so each keeps its own positions. */
function rankingLd(name: string, rows: CopyHubRow[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: rows.length,
    itemListElement: rows.slice(0, 50).map((row, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: row.name,
      url: `${BASE}${copyHref(row.slug)}`,
    })),
  };
}

export default async function CopyHubPage() {
  const hub = await getCopyHub().catch(() => null);
  const tallies = hub ? [kindTally(hub, "fund"), kindTally(hub, "congress")] : [];
  const bestFund = tallies[0]?.ranked[0] ?? null;
  const bestMember = tallies[1]?.ranked[0] ?? null;
  const fundRanking = hub ? rankRows(hub.rows, "fund").ranked : [];
  const memberRanking = hub ? rankRows(hub.rows, "congress").ranked : [];
  return (
    <AppPage>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Follow", path: "/follow" },
            { name: "Whose moves were worth copying?", path: COPY_HUB_PATH },
          ]),
          ...(fundRanking.length ? [rankingLd("13F funds whose moves were worth copying", fundRanking)] : []),
          ...(memberRanking.length ? [rankingLd("House members whose trades were worth copying", memberRanking)] : []),
        ]}
      />
      <header className="mb-3 px-2 sm:mb-4 sm:px-0">
        <nav aria-label="You are here" className="mb-1 text-[13px] leading-5 text-oa-muted-fg [&_a:hover]:text-oa-fg [&_a]:underline [&_a]:decoration-oa-border [&_a]:underline-offset-2">
          <Link href="/follow" prefetch={false}>Follow</Link>
        </nav>
        <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">Whose moves were worth copying?</h1>
        {hub ? (
          <>
            <p className="mt-1 max-w-3xl text-pretty text-[15px] leading-[22px] text-oa-fg">
              We pretended to buy what each fund and member of Congress bought, at the close of the first trading day after it became public, and compared that with simply owning the S&amp;P 500.
            </p>
            <p className="mt-1 text-pretty text-[13px] leading-5 text-oa-muted-fg">
              Pretend money, before costs and taxes. Prices to {fmtDate(hub.price_as_of)}. Past results don&apos;t repeat.
            </p>
          </>
        ) : null}
      </header>

      {hub ? (
        <>
          <HubAnswer hub={hub} tallies={tallies} />
          {bestFund || bestMember ? (
            <CardGrid cols={2} className="mt-3">
              {bestFund ? <BestCard title="The fund that did best" row={bestFund} /> : null}
              {bestMember ? <BestCard title="The member of Congress who did best" row={bestMember} /> : null}
            </CardGrid>
          ) : null}
          {bestFund && bestMember ? (
            <p className="mt-2 px-2 text-pretty text-[13px] leading-5 text-oa-muted-fg sm:px-0">
              Members&apos; records are shorter than the funds&apos;, and a short record&apos;s yearly figure swings more, so compare each with the S&amp;P 500 rather than with each other.
            </p>
          ) : null}
          <div className="mt-3 space-y-3">
            <KindPanel hub={hub} kind="fund" />
            <KindPanel hub={hub} kind="congress" />
          </div>
        </>
      ) : (
        <div className="oa-surface border border-oa-border bg-oa-card">
          <Empty title="The copy tests are not ready">We have not run them yet. The funds and members are on the Follow page.</Empty>
        </div>
      )}
    </AppPage>
  );
}
