import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
import { ResearchReportView, publicReport } from "@/components/research/report-view";
import { WatchAgents } from "@/components/research/watch-agents";
import { dayWords } from "@/lib/day-words";
import { getViewer } from "@/lib/entitlements-server";
import { day } from "@/lib/research/format";
import { researchStore } from "@/lib/research/store";
import { watchAgentChips } from "@/lib/research/watch-agents-server";
import { cleanTicker, isShareId } from "@/lib/research/types";

/**
 * A research report someone chose to share. Anyone with the link can read it;
 * nothing about the person who ran it is on the page. Kept out of search:
 * a shared report is a snapshot of one day, not a page we maintain.
 */

export const dynamic = "force-dynamic";

type Props = { params: { symbol: string; shareId: string } };

const load = cache(async (shareId: string) => (isShareId(shareId) ? researchStore.getShared(shareId).catch(() => null) : null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await load(params.shareId);
  if (!report) return { title: "Report not found", robots: { index: false, follow: false } };
  const description = report.body?.summary.slice(0, 2).map((line) => line.replace(/\[S\d+\]/g, "").trim()).join(" ").slice(0, 300);
  return {
    title: `${report.name} (${report.ticker}): long research report, ${day(report.finished_at ?? report.created_at)}`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: `${report.name}: the long research report`, description },
  };
}

export default async function SharedResearchPage({ params }: Props) {
  const report = await load(params.shareId);
  const ticker = cleanTicker(params.symbol);
  if (!report || !ticker || report.ticker !== ticker || !report.body) notFound();
  const stock = `/stock/${encodeURIComponent(ticker)}`;
  const viewer = await getViewer();
  const chips = await watchAgentChips(report, { uid: viewer.uid, plan: viewer.plan }).catch(() => []);
  const written = dayWords(report.finished_at ?? report.created_at);
  return (
    <AppPage width="read">
      <PageHead
        crumb={
          <>
            <Link href={stock}>{ticker}</Link> / <span>Long research report</span>
          </>
        }
        title={`${report.name}: the long research report`}
        meta={<SourceLine source={`${report.sources.length} sources`} asOf={written} />}
        note={false}
      />
      <ResearchReportView report={publicReport(report)} afterReport={chips.length > 0 ? <WatchAgents chips={chips} plan={viewer.plan} /> : null} />
      <section className="oa-surface mt-4 flex flex-col gap-3 border border-oa-border bg-oa-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
          Written {written} by stocksbrew from filings, earnings, peers and news on file then. Run a fresh one on any US stock.
        </p>
        <Link href={`${stock}/research`} className="shrink-0 text-[14px] font-medium text-oa-primary hover:underline" data-track="research_shared_cta" data-track-ticker={ticker}>
          Get your own report →
        </Link>
      </section>
    </AppPage>
  );
}
