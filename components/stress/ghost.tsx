import { PanelGhost } from "@/components/oa/kit/skeleton";

/** Holds the page's shape while the episodes load: the read, then one row per episode. */
export function StressGhost() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <PanelGhost rows={3} lines={2} />
      <PanelGhost rows={8} lines={2} />
    </div>
  );
}
