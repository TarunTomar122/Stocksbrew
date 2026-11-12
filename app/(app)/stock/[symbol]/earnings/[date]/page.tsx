import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { EarningsDayReportView } from "@/components/earnings-day/report-view";
import { AppPage, PageHead, SourceLine, fmtDay, fmtStampETDate } from "@/components/oa/kit";
import { getEarningsDayReportCached } from "@/lib/earnings-day";
import { cleanReportTicker, earningsDayHref, isIndexable, isReportDay, reportDescription } from "@/lib/earnings-day-shared";
import { ogImage } from "@/lib/og/url";

/**
 * One company's earnings report (/stock/QLYS/earnings/2026-11-09), written by
 * backend/agentdata/earnings_day.py from the 8-K the company filed. Free to read
 * on every plan: it is built once from public filings and carries no price
 * levels (lib/earnings-day-shared.ts). Indexable once the release is read and
 * there is a verdict to report; a report still waiting for its filing is noindex.
 */

export const revalidate = 120;

type Props = { params: { symbol: string; date: string } };

const BASE = "https://www.stocksbrew.online";

async function resolve(params: Props["params"]) {
  const ticker = cleanReportTicker(params.symbol);
  if (!ticker || !isReportDay(params.date)) return null;
  const report = await getEarningsDayReportCached(ticker, params.date).catch(() => null);
  return report ? { ticker, report } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return { title: "Earnings report not found", robots: { index: false, follow: true } };
  const { ticker, report } = found;
  const path = earningsDayHref(ticker, report.event_date);
  const title = report.read?.title ?? `${report.company} earnings`;
  const description = reportDescription(report);
  const shareImage = ogImage(["stock", ticker], title, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: isIndexable(report), follow: true },
    openGraph: { type: "article", title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function EarningsReportPage({ params }: Props) {
  const ticker = cleanReportTicker(params.symbol);
  if (!ticker || !isReportDay(params.date)) notFound();
  if (params.symbol !== ticker) permanentRedirect(earningsDayHref(ticker, params.date));
  const found = await resolve(params);
  if (!found) notFound();
  const { report } = found;
  const path = earningsDayHref(ticker, report.event_date);
  const title = report.read?.title ?? `${report.company} earnings`;
  const published = report.filing?.filed_at ?? report.generated_at ?? `${report.event_date}T21:00:00Z`;

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: reportDescription(report),
    datePublished: report.generated_at ?? published,
    dateModified: report.updated_at ?? report.generated_at ?? published,
    url: `${BASE}${path}`,
    mainEntityOfPage: `${BASE}${path}`,
    author: { "@type": "Organization", name: "stocksbrew", url: BASE },
    publisher: { "@type": "Organization", name: "stocksbrew", url: BASE },
    about: { "@type": "Corporation", name: report.company, tickerSymbol: ticker, url: `${BASE}/stock/${encodeURIComponent(ticker)}` },
    citation: (report.sources ?? []).map((source) => ({ "@type": "CreativeWork", name: source.label, url: source.url })),
  };

  return (
    <AppPage>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: ticker, path: `/stock/${encodeURIComponent(ticker)}` },
            { name: "Earnings", path: `/calendar/earnings/${encodeURIComponent(ticker)}` },
            { name: title, path },
          ]),
          article,
        ]}
      />
      <PageHead
        crumb={
          <>
            <a href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</a> / <a href={`/calendar/earnings/${encodeURIComponent(ticker)}`}>Earnings</a> / <span>{fmtDay(report.event_date, true)}</span>
          </>
        }
        title={title}
        meta={<SourceLine source={report.filing ? "SEC EDGAR filing" : "Earnings calendar"} href={report.filing?.url} asOf={report.filing ? fmtStampETDate(report.filing.filed_at) : undefined} />}
        note={false}
      />
      <EarningsDayReportView report={report} />
    </AppPage>
  );
}
