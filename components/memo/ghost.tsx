import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the letter's shape while the week's facts load. */
export function MemoGhost() {
  return (
    <div aria-hidden="true" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-6">
        <Bar className="h-3 w-32" />
        <Bar className="mt-5 h-5 w-full max-w-[40rem]" />
        <Bar className="mt-2 h-5 w-3/4 max-w-[30rem]" />
        {[0, 1, 2].map((section) => (
          <div key={section} className="mt-7">
            <Bar className="h-3 w-24" />
            <Bar className="mt-4 h-4 w-full" />
            <Bar className="mt-2 h-4 w-5/6" />
            <Bar className="mt-5 h-4 w-full" />
            <Bar className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
      <PanelGhost rows={4} lines={2} className="hidden lg:block" />
    </div>
  );
}
