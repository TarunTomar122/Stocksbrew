import { PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the page's shape while the ideas load: the read, the trims, the losses. */
export function IdeasGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <PanelGhost rows={3} lines={2} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <PanelGhost rows={4} lines={3} />
        <PanelGhost rows={3} lines={2} />
      </div>
    </div>
  );
}
