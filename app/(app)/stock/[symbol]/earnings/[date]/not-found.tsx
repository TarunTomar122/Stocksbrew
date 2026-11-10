import { AppPage, PageHead, Panel } from "@/components/oa/kit";

const PLACES: Array<{ href: string; label: string; what: string }> = [
  { href: "/calendar?type=earnings", label: "Earnings calendar", what: "Who reports this week and next, with what analysts expect" },
  { href: "/briefing", label: "Briefing", what: "What moved today and why, with every report from your stocks" },
  { href: "/screener", label: "Screener", what: "Every US stock we cover" },
];

/** A report page exists once a covered company has reported and we read its release. */
export default function EarningsReportNotFound() {
  return (
    <AppPage width="read">
      <PageHead full crumb={<a href="/calendar">Calendar</a>} title="No earnings report at this address" lede="We write a report once a company we cover has reported and its release is on SEC EDGAR." />
      <Panel flush>
        <ul>
          {PLACES.map((place) => (
            <li key={place.href} className="border-b border-oa-border last:border-b-0">
              <a href={place.href} className="group flex items-center justify-between gap-4 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium leading-[22px] text-oa-fg">{place.label}</span>
                  <span className="mt-0.5 block text-pretty text-[14px] leading-[20px] text-oa-muted-fg">{place.what}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-[15px] text-oa-muted-fg group-hover:text-oa-primary">→</span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </AppPage>
  );
}
