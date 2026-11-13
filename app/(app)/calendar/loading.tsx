import { Bar, ChipRowGhost, PageHeadGhost, SkeletonFrame } from "@/components/oa/kit/skeleton";

/** The week view's shape: title row with the view switch, one row of type chips, then the day columns with today wide in the middle. */
export default function CalendarLoading() {
  return (
    <SkeletonFrame label="Loading the calendar">
      <PageHeadGhost lede={0} />
      <ChipRowGhost count={5} className="mb-3 !flex-nowrap overflow-hidden" />
      <Bar className="mb-3 h-[52px] w-full rounded-md lg:hidden" />
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        <div className="grid lg:grid-cols-[1fr_1fr_1.7fr_1fr_1fr]">
          {Array.from({ length: 5 }, (_, day) => (
            <div key={day} className={`border-b border-oa-border last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${day > 1 ? "max-lg:hidden" : ""}`}>
              <div className="flex h-10 items-center justify-between border-b border-oa-border bg-oa-bg px-3">
                <Bar className="h-3.5 w-20" />
                <Bar className="h-3 w-14" />
              </div>
              <div className="px-3 pb-3 pt-4">
                <Bar className="h-2.5 w-24" />
                {Array.from({ length: 8 }, (_, row) => (
                  <div key={row} className="mt-4 flex items-center justify-between gap-3">
                    <Bar className="h-3.5 w-16" />
                    <Bar className="h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonFrame>
  );
}
