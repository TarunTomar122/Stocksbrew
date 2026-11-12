import { PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the page's shape while the ideas load: the two charts side by side, then a row of stock cards. */
export function IdeasGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PanelGhost rows={6} lines={1} />
        <PanelGhost rows={6} lines={1} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <PanelGhost rows={2} lines={2} />
        <PanelGhost rows={2} lines={2} />
        <PanelGhost rows={2} lines={2} />
      </div>
    </div>
  );
}
