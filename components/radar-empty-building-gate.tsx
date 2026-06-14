"use client";

import { useEffect, useState } from "react";

import { RadarBuildingState } from "@/components/radar-building-state";
import {
  RADAR_TRACK_CHANGED_EVENT,
  type RadarTrackChangedDetail,
} from "@/lib/radar-track-events";

/**
 * Wraps empty Radar onboarding. When the user adds their first stock(s), swap
 * immediately to the building screen instead of waiting for router.refresh().
 */
export function RadarEmptyBuildingGate({
  trackedCount,
  children,
}: {
  trackedCount: number;
  children: React.ReactNode;
}) {
  const [buildingCount, setBuildingCount] = useState<number | null>(null);

  useEffect(() => {
    function onTrackChanged(event: Event) {
      const detail = (event as CustomEvent<RadarTrackChangedDetail>).detail;
      if (detail.action !== "add") return;
      const delta = detail.count ?? 1;
      setBuildingCount((current) => Math.max(1, (current ?? trackedCount) + delta));
    }

    window.addEventListener(RADAR_TRACK_CHANGED_EVENT, onTrackChanged);
    return () => window.removeEventListener(RADAR_TRACK_CHANGED_EVENT, onTrackChanged);
  }, [trackedCount]);

  if (buildingCount !== null) {
    return <RadarBuildingState trackedCount={buildingCount} />;
  }

  return <>{children}</>;
}
