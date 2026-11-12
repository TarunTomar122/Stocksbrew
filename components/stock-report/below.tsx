import { todayET } from "@/lib/calendar-shared";
import { saysSameDevelopment, weekChange } from "@/lib/stock-timeline";

import { ChangedTimeline } from "./changed-timeline";
import { briefLeadOf, daysBetween, fmtDate, relativeDays } from "./format";
import { NUM, Panel, SECTION_LABELS, type SectionId } from "./primitives";
import { ReportSections } from "./report-sections";
import { NO_EXTRAS, toSectionData } from "./section-data";
import { sectionAvailability } from "./sections";
import type { ReportData, ReportExtras } from "./types";
import type { StockSignals } from "@/lib/stock-signals";

/** At most this many entries go to the browser, all in the list's inner scroll (changed-timeline.tsx). */
const TIMELINE_MAX = 40;

/** "From Yahoo Finance, Benzinga and Finviz": the headlines' publishers, most used first, three named at most. */
export function publishers(items: Array<{ kind: string; source?: string | null }>): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const source = item.kind === "news" ? (item.source ?? "").trim() : "";
    if (source) counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
  if (names.length === 0) return null;
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  const list = more > 0 ? `${shown.join(", ")} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  return `From ${list}`;
}

/**
 * The lower half of the stock report: what changed, then the deeper report
 * as tabs. It streams in under the call, the price and the read, once the
 * reads only it needs (news, rivals, ownership, technicals) are in.
 */
export function StockReportBelow({ data, extras, signals = null }: { data: ReportData; extras: ReportExtras; signals?: StockSignals | null }) {
  const { stock, nowIso } = data;
  const today = todayET(Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now());
  const sectionData = toSectionData(data, extras);
  const available = sectionAvailability(sectionData);
  // The same test report.tsx uses for the phone's "Report" chip. Without the chip, the tabs join the "Our view" part.
  const reportChip = Object.values(sectionAvailability(toSectionData(data, NO_EXTRAS))).some(Boolean);
  const railSections = (Object.keys(SECTION_LABELS) as SectionId[])
    .filter((id) => available[id])
    .map((id) => ({
      id,
      label: SECTION_LABELS[id],
      count: id === "news" ? sectionData.news.length : id === "peers" ? sectionData.peers.length : null,
      // One quiet dot per tab from the shared signals (lib/stock-signals.ts); Overview has none of its own.
      tone: id !== "overview" && signals ? signals.tabs[id] : null,
    }));
  // Only what the tabs draw goes to the browser: each signal by id and the per-tab counts, not the tally's inputs.
  const tabSignals = signals ? { byId: signals.byId, tabs: signals.tabs } : null;

  // A headline's row shows no summary (timeline-row.tsx), so the summary is not sent either.
  // One line on what actually changed for the stock this week, from the same rows (lib/stock-timeline.ts), so the
  // panel opens on a read and the headlines sit under it as evidence. No model call: the rows are grouped by subject.
  const nowDate = new Date(Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now());
  const weekLine = weekChange(extras.timeline.items, { ticker: stock.ticker, companyName: stock.name, now: nowDate });
  // The brief above already leads with the development, so the list does not say it again (owner rules 1 and 7).
  const briefLead = data.readState === "ready" ? briefLeadOf(data.read).lead : "";
  const changeLine = saysSameDevelopment(weekLine, briefLead, { ticker: stock.ticker, companyName: stock.name }) ? null : weekLine;
  // Each headline's publisher, named once in the section head instead of on every row (owner rule 1), most used first.
  const sources = publishers(extras.timeline.items.slice(0, TIMELINE_MAX));
  const timelineItems = extras.timeline.items.slice(0, TIMELINE_MAX).map((item) => (item.kind === "news" && item.detail ? { ...item, detail: undefined } : item));

  return (
    <>
      <div data-phone-section="view" className="order-1 min-w-0">
        <Panel
          id="changed"
          label="What changed"
          className="scroll-mt-16 lg:scroll-mt-4"
          meta={sources ? <span className="font-sans text-[12px]">{sources}</span> : undefined}
        >
          {changeLine ? <p className="text-pretty border-b border-oa-border px-3.5 py-2.5 text-[15px] font-medium leading-[22px] text-oa-fg sm:px-4">{changeLine}</p> : null}
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
          <ChangedTimeline items={timelineItems} nowIso={nowIso} ticker={stock.ticker} />
        </Panel>
      </div>

      {/* The deeper report as tabs, in the order of SECTION_LABELS. */}
      {railSections.length ? (
        <div data-phone-section={reportChip ? "report" : "view"} className="order-3 min-w-0">
          <ReportSections sections={railSections} data={sectionData} signals={tabSignals} />
        </div>
      ) : null}
    </>
  );
}
