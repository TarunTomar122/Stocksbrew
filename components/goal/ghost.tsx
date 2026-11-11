import { PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the page's shape while the prices load: the read, the chart and the plan. */
export function GoalGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <PanelGhost rows={3} lines={2} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <PanelGhost rows={6} />
        <PanelGhost rows={6} />
      </div>
    </div>
  );
}
