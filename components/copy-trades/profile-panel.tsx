import * as React from "react";
import Link from "next/link";

import { CopyChart } from "@/components/copy-trades/copy-chart";
import { Panel } from "@/components/follow/panel";
import { NUM } from "@/components/oa/kit";
import { buildCopyRead, copyHref, fmtDollars, fmtPointsWord, getCopyRecord, isFullRecord } from "@/lib/copy-trades";
import { fmtDate, fmtFrac } from "@/lib/follow-shared";

/**
 * The record panel on a follow profile, read from the copy test
 * (tm_copy_trades) so the profile and its copy page quote one number. When
 * there is no copy record it renders `fallback` (the profile's own panel),
 * and never links to a copy page that does not exist.
 */
export async function ProfileCopyPanel({ slug, title, fallback }: { slug: string; title: string; fallback: React.ReactNode }) {
  const record = await getCopyRecord(slug).catch(() => null);
  if (!isFullRecord(record)) return <>{fallback}</>;
  const read = buildCopyRead(record);
  const gap = record.excess_per_year;
  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "$10,000 copied", value: fmtDollars(record.copy.end_value) },
    { label: "In the S&P 500", value: fmtDollars(record.spy.end_value) },
    { label: "Worst fall", value: fmtFrac(record.copy.max_drawdown) },
  ];
  if (gap != null) {
    cells.push({
      label: "A year vs the S&P 500",
      value: `${gap >= 0 ? "+" : "−"}${fmtPointsWord(gap)}`,
      tone: gap >= 0 ? "text-signal-bullish" : "text-signal-bearish",
    });
  }
  return (
    <Panel title={title} right={<span>Closes to {fmtDate(record.end_date)}</span>}>
      {read ? <p className="px-4 pt-3 text-pretty text-[15px] leading-[22px] text-oa-fg">{read.headline}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pt-3 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label}>
            <dt className="oa-caption">{cell.label}</dt>
            <dd className={`${NUM} mt-0.5 text-[16px] font-medium ${cell.tone ?? "text-oa-fg"}`}>{cell.value}</dd>
          </div>
        ))}
      </dl>
      <div className="px-4 py-4">
        <CopyChart curve={record.curve} name={record.name} holdLabel={record.hold ? record.hold_label : null} />
      </div>
      <p className="border-t border-oa-border px-4 py-3 text-pretty text-[13px] leading-5 text-oa-muted-fg">
        A test before costs and taxes, not a real account. Companies that were later delisted or bought out are skipped, which flatters it.{" "}
        <Link href={copyHref(record.slug)} prefetch={false} className="font-medium text-oa-primary hover:underline">
          See the full copy test, year by year →
        </Link>
      </p>
    </Panel>
  );
}
