import { PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the page's shape while the reports load: the read, the six weeks, then the stocks. */
export function SeasonGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <PanelGhost rows={3} lines={2} />
      <PanelGhost rows={2} lines={3} />
      <PanelGhost rows={4} lines={2} />
    </div>
  );
}
