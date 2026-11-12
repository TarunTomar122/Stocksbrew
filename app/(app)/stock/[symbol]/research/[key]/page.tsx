import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
import { ResearchPoller } from "@/components/research/poller";
import { ResearchReportView, publicReport } from "@/components/research/report-view";
import { ShareControl } from "@/components/research/share-control";
import { getSessionUser } from "@/lib/auth-server";
import { day } from "@/lib/research/format";
import { researchStore } from "@/lib/research/store";
import { cleanTicker, isReportKey, isStale } from "@/lib/research/types";

/** One saved research report, for the person who ran it. A public copy lives at /stock/T/research/s/{share_id}. */

export const dynamic = "force-dynamic";

type Props = { params: { symbol: string; key: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticker = cleanTicker(params.symbol) ?? "Stock";
  return { title: `${ticker} long research report`, robots: { index: false, follow: false } };
}

export default async function ResearchReportPage({ params }: Props) {
  const ticker = cleanTicker(params.symbol);
  if (!ticker || !isReportKey(params.key)) notFound();
  const session = await getSessionUser();
  if (!session) {
    return (
      <AppPage width="read">
        <PageHead full crumb={<Link href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</Link>} title="Sign in to open this report" lede="Reports open only for the account that ran them, or through a shared link." />
      </AppPage>
    );
  }
  const report = await researchStore.get(session.uid, ticker, params.key).catch(() => null);
  if (!report) notFound();
  const hub = `/stock/${encodeURIComponent(ticker)}/research`;
  const crumb = (
    <>
      <Link href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</Link> / <Link href={hub}>Long research report</Link> / <span>{day(report.created_at)}</span>
    </>
  );

  if (report.status === "running" && !isStale(report)) {
    return (
      <AppPage width="read">
        <PageHead crumb={crumb} title={`${report.name}: the long research report`} note={false} />
        <ResearchPoller ticker={ticker} reportKey={report.key} steps={report.steps} startedAt={report.created_at} />
      </AppPage>
    );
  }

  if (report.status !== "ready" || !report.body) {
    return (
      <AppPage width="read">
        <PageHead crumb={crumb} title={`${report.name}: this report did not finish`} note={false} />
        <section className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
          <p className="text-[15px] leading-6 text-oa-fg">The run stopped before the report was saved, so it was not counted against your reports.</p>
          <Link href={hub} className="mt-2 inline-block text-[14px] font-medium text-oa-primary hover:underline">
            Start it again →
          </Link>
        </section>
      </AppPage>
    );
  }

  const checked = report.audit ? `${report.audit.checked} figures checked against their sources` : null;
  return (
    <AppPage width="read">
      <PageHead
        crumb={crumb}
        title={`${report.name}: the long research report`}
        meta={<SourceLine source={`${report.sources.length} sources`} asOf={day(report.finished_at ?? report.created_at)} note={checked} />}
        note={false}
      />
      <ResearchReportView report={publicReport(report)} actions={<ShareControl ticker={ticker} reportKey={report.key} shareId={report.share_id} />} />
      <p className="mt-4 px-2 text-[13px] leading-5 text-oa-muted-fg sm:px-0">
        Written {day(report.finished_at ?? report.created_at)} from what was on file that day. <Link href={hub} className="font-medium text-oa-primary hover:underline">Run a fresh one</Link> when things change.
      </p>
    </AppPage>
  );
}
