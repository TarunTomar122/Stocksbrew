import { todayET } from "@/lib/calendar-shared";

import { ChangedTimeline } from "./changed-timeline";
import { daysBetween, fmtDate, relativeDays } from "./format";
import { NUM, Panel, SECTION_LABELS, type SectionId } from "./primitives";
import { ReportSections } from "./report-sections";
import { NO_EXTRAS, toSectionData } from "./section-data";
import { sectionAvailability } from "./sections";
import type { ReportData, ReportExtras } from "./types";

/** At most this many entries go to the browser: 7 shown, the rest folded (changed-timeline.tsx). */
const TIMELINE_MAX = 40;

/**
 * The lower half of the stock report: what changed, then the deeper report
 * as tabs. It streams in under the call, the price and the read, once the
 * reads only it needs (news, rivals, ownership, technicals) are in.
 */
export function StockReportBelow({ data, extras }: { data: ReportData; extras: ReportExtras }) {
  const { stock, nowIso } = data;
  const today = todayET(Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now());
  const sectionData = toSectionData(data, extras);
  const available = sectionAvailability(sectionData);
  // The same test report.tsx uses for the phone's "Report" chip. Without the chip, the tabs join the "Changes" part.
  const reportChip = Object.values(sectionAvailability(toSectionData(data, NO_EXTRAS))).some(Boolean);
  const railSections = (Object.keys(SECTION_LABELS) as SectionId[])
    .filter((id) => available[id])
    .map((id) => ({
      id,
      label: SECTION_LABELS[id],
      count: id === "news" ? sectionData.news.length : id === "peers" ? sectionData.peers.length : null,
    }));

  return (
    <>
      <div data-phone-section="changed" className="min-w-0">
        <Panel id="changed" label="What changed" className="scroll-mt-16 lg:scroll-mt-4">
          {extras.timeline.upcoming.length ? (
            <div className="border-b border-oa-border bg-oa-bg">
              {extras.timeline.upcoming.map((item) => {
                const days = daysBetween(today, item.date);
                return (
                  <div key={item.id} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-oa-border px-3.5 py-2 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:px-4">
                    <div>
                      <p className={`${NUM} text-[12px] leading-4 text-oa-fg`}>{fmtDate(item.date, false)}</p>
                      <p className="oa-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-oa-label">{days != null ? relativeDays(days) : "next"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium leading-5 text-oa-fg">{item.title}</p>
                      {item.detail ? <p className="text-[13px] leading-5 text-oa-muted-fg">{item.detail}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <ChangedTimeline items={extras.timeline.items.slice(0, TIMELINE_MAX)} nowIso={nowIso} ticker={stock.ticker} />
        </Panel>
      </div>

      {/* The deeper report, one part at a time: the order matches SECTION_LABELS. */}
      {railSections.length ? (
        <div data-phone-section={reportChip ? "report" : "changed"} className="min-w-0">
          <ReportSections sections={railSections} data={sectionData} />
        </div>
      ) : null}
    </>
  );
}
