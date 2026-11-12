/**
 * One browser signal for "the person's list of stocks changed": every writer fires it after a save that went through
 * (the edit sheet, the Follow button, the row menu, basket and theme buttons, onboarding, landing picks, Ask's add).
 * Listeners: the reasons store reloads (components/thesis/store.ts), and the post-activation survey reacts to adds.
 */
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";

export const RADAR_TRACK_CHANGED_EVENT = "radar-track-changed";

export type RadarTrackChangedDetail = {
  /** "edit" is a save that changed kinds or numbers without adding or removing. */
  action: "add" | "remove" | "edit";
  /** How many stocks were added/removed in this mutation (default 1). */
  count?: number;
};

export function dispatchRadarTrackChanged(detail: RadarTrackChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RadarTrackChangedDetail>(RADAR_TRACK_CHANGED_EVENT, { detail }));
}

/**
 * Fire the signal, then refresh the current page now and again once the person's view is rebuilt
 * (flushWatchlistRebuild: the refresh route joins the rebuild the save already queued on the server), so pages kept in
 * the router cache don't show the old list and the briefing rows are there on the second refresh.
 */
export async function announceBookChanged(
  detail: RadarTrackChangedDetail,
  router?: Parameters<typeof flushWatchlistRebuild>[0] | null,
): Promise<void> {
  dispatchRadarTrackChanged(detail);
  await flushWatchlistRebuild(router ?? undefined);
}
