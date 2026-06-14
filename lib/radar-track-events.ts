export const RADAR_TRACK_CHANGED_EVENT = "radar-track-changed";

export type RadarTrackChangedDetail = {
  action: "add" | "remove";
  /** How many stocks were added/removed in this mutation (default 1). */
  count?: number;
};

export function dispatchRadarTrackChanged(detail: RadarTrackChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RadarTrackChangedDetail>(RADAR_TRACK_CHANGED_EVENT, { detail }));
}
