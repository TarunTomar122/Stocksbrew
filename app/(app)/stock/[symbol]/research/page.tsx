import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppPage, NUM, PageHead, fmtStampETDate } from "@/components/oa/kit";
import { ResearchLauncher } from "@/components/research/launcher";
import { getViewer, peekMeter } from "@/lib/entitlements-server";
import { limitFor, ruleFor } from "@/lib/entitlements";
import { researchStore } from "@/lib/research/store";
import { cleanTicker, isStale, reportHref, type ResearchIndexItem } from "@/lib/research/types";
import { getStockSummary } from "@/lib/stock";

/**
 * /stock/NVDA/research: start a full research report on one stock, and the
 * reports this person already ran on it. The reports themselves live at
 * /stock/NVDA/research/{key}.
 */

export const dynamic = "force-dynamic";

type Props = { params: { symbol: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticker = cleanTicker(params.symbol) ?? params.symbol.toUpperCase().slice(0, 12);
  return {
    title: `${ticker} long research report`,
    description: `A long, sourced research report on ${ticker}: the business, the bull and bear case, valuation against peers, the numbers, who is buying and selling, and what to watch.`,
    alternates: { canonical: `/stock/${encodeURIComponent(ticker)}/research` },
    // Personal: what this page shows depends on who is signed in.
    robots: { index: false, follow: true },
  };
}

const INSIDE = [
  "Five lines on what matters most right now",
  "The business, in two paragraphs",
  "What is driving the stock now",
  "The bull case and the bear case, with evidence",
  "Valuation against its own history and its peers",
  "Growth, margins, cash and debt, with charts",
  "Who is buying and selling: funds, insiders, Congress",
  "The risks from the latest 10-K and 10-Q",
  "What would change the picture",
  "What to watch next, with dates",
];

function statusLine(item: ResearchIndexItem): string {
  if (item.status === "ready") return item.headline ?? "Report";
  if (item.status === "running" && !isStale({ status: "running", updated_at: item.created_at })) return "Still being written";
  return "Stopped before it finished. Nothing was counted.";
}

export default async function ResearchHubPage({ params }: Props) {
  const ticker = cleanTicker(params.symbol);
  if (!ticker) notFound();
  const summary =
    (await getStockSummary(ticker, "US").catch(() => null)) ?? (ticker.includes(".") ? await getStockSummary(ticker.replace(/\./g, "-"), "US").catch(() => null) : null);
  if (!summary) notFound();
  const name = summary.name || ticker;
  const viewer = await getViewer();
  const [meter, items] = viewer.uid
    ? await Promise.all([peekMeter("deep_research", viewer.plan, viewer.uid).catch(() => null), researchStore.list(viewer.uid).catch(() => [] as ResearchIndexItem[])])
    : [null, [] as ResearchIndexItem[]];
  const mine = items.filter((item) => item.ticker === ticker);
  const rule = ruleFor("deep_research", viewer.plan);
  const allowance = meter
    ? { used: meter.used, limit: meter.limit, per: meter.per }
    : rule.kind === "meter" && viewer.uid
      ? { used: 0, limit: limitFor("deep_research", viewer.plan), per: rule.per }
      : null;

  return (
    <AppPage width="read">
      <PageHead
        crumb={
          <>
            <Link href={`/stock/${encodeURIComponent(ticker)}`}>{ticker}</Link> / <span>Long research report</span>
          </>
        }
        title={`${name}: the long research report`}
        note={false}
      />
      <div className="flex flex-col gap-3">
        <ResearchLauncher
          ticker={ticker}
          name={name}
          plan={viewer.plan}
          allowance={allowance}
          trialEligible={viewer.trialEligible}
          again={mine.some((item) => item.status === "ready")}
        />
        {mine.length === 0 ? (
          <section aria-label="What the report covers" className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
            <p className="oa-label">What the report covers</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {INSIDE.map((line) => (
                <li key={line} className="flex gap-2 text-[14px] leading-5 text-oa-fg">
                  <span aria-hidden="true" className="mt-[7px] block size-1.5 shrink-0 rounded-full bg-oa-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {mine.length > 0 ? (
          <section aria-label="Your reports" className="oa-surface border border-oa-border bg-oa-card">
            <div className="flex min-h-11 items-center border-b border-oa-border px-4 py-2 sm:px-5">
              <h2 className="oa-label">Your reports on {ticker}</h2>
            </div>
            {/* About eight rows tall, then it scrolls inside. */}
            <ul className="max-h-[30rem] overflow-y-auto">
              {mine.map((item) => (
                <li key={item.key} className="border-b border-oa-border last:border-b-0">
                  <Link
                    href={reportHref(ticker, item.key)}
                    className="group flex items-start gap-3 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:px-5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <span className={`${NUM} shrink-0 pt-0.5 text-[12.5px] text-oa-muted-fg sm:w-[9.5rem]`}>{fmtStampETDate(item.created_at)}</span>
                      <span className={`min-w-0 flex-1 text-pretty text-[14.5px] leading-[21px] ${item.status === "ready" ? "text-oa-fg" : "text-oa-muted-fg"}`}>{statusLine(item)}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-oa-muted-fg group-hover:text-oa-primary">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}
