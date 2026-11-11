import type { Metadata } from "next";
import Link from "next/link";

import { RankTable, UnrankedList } from "@/components/copy-trades/parts";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, Empty, Panel, ShowMore } from "@/components/oa/kit";
import { COPY_BIASES, COPY_HUB_PATH, buildHubRead, copyHref, getCopyHub, rankRows, type CopyHub, type CopyHubRow } from "@/lib/copy-trades";
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
const SHOWN = 15;
/** The fold button sits inside a flush panel: give it the panel's gutter. */
const FOLD = "[&>button]:mx-4 [&>button]:mb-3 [&>button]:w-[calc(100%-2rem)]";
const TITLE = "Whose Moves Were Worth Copying? 13F Funds and Congress, Backtested";
const DESCRIPTION =
  "Every 13F fund and House member we follow, copied from the day each filing or trade report became public, ranked against the S&P 500. The rule, the period and the record for each.";

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

/** A group shown under the ranking but not in it, folded, with what it is in the button. */
function Group({ label, rows, scaleRows }: { label: string; rows: CopyHubRow[]; scaleRows: CopyHubRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="border-t border-oa-border">
      <ShowMore always label={label} className={FOLD}>
        <RankTable rows={rows} scaleRows={scaleRows} numbered={false} />
      </ShowMore>
    </div>
  );
}

function KindPanel({ hub, kind }: { hub: CopyHub; kind: "fund" | "congress" }) {
  const { ranked, ended, short, untested } = rankRows(hub.rows, kind);
  const label = kind === "fund" ? `13F funds, copied from ${hub.fund_start.slice(0, 4)}` : "House members, copied from their first reported buy";
  const rule = kind === "fund" ? hub.fund_rule : hub.congress_rule;
  const caveat = kind === "fund" ? hub.fund_caveat : hub.congress_caveat;
  const all = [...ranked, ...ended, ...short];
  return (
    <Panel label={label} right={<span>{ranked.length} ranked</span>} flush>
      <div className="border-b border-oa-border px-4 py-3 text-[14px] leading-[21px]">
        <p className="text-pretty text-oa-fg">
          <span className="font-medium">The rule: </span>
          {rule}
        </p>
        <p className="mt-1 text-pretty text-oa-muted-fg">{caveat}</p>
        <p className="mt-1 text-pretty text-oa-muted-fg">{COPY_BIASES[kind]}</p>
      </div>
      {ranked.length > 0 ? (
        <RankTable rows={ranked.slice(0, SHOWN)} scaleRows={all} />
      ) : (
        <Empty title="Nobody to rank yet">None has two years of record we could copy.</Empty>
      )}
      {ranked.length > SHOWN ? (
        <div className="border-t border-oa-border">
          <ShowMore always label={`Show the other ${ranked.length - SHOWN} ranked`} className={FOLD}>
            <RankTable rows={ranked.slice(SHOWN)} offset={SHOWN} scaleRows={all} head={false} />
          </ShowMore>
        </div>
      ) : null}
      <Group label={`Record ended: show the ${ended.length === 1 ? "one" : ended.length} that stopped more than three months ago`} rows={ended} scaleRows={all} />
      <Group label={`Too short to rank: show the ${short.length === 1 ? "one" : short.length} with less than two years of record`} rows={short} scaleRows={all} />
      {untested.length > 0 ? (
        <div className="border-t border-oa-border">
          <ShowMore always label={`Not tested: show the ${untested.length === 1 ? "one" : untested.length} with too little to copy, and why`} className={FOLD}>
            <UnrankedList rows={untested} />
          </ShowMore>
        </div>
      ) : null}
    </Panel>
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
  const read = buildHubRead(hub);
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
          <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">
            $10,000 copied from the day each move became public, against the S&amp;P 500 over the same days. Only records with two years behind them that are still running are ranked. Closes to {fmtDate(hub.price_as_of)}. No promise about what comes next.
          </p>
        ) : null}
      </header>

      {hub ? (
        <>
          <TheRead read={read} fold="phone" />
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
