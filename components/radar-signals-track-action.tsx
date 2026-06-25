"use client";

import { TrackButton } from "@/components/track-button";

export function RadarSignalsTrackAction({
  ticker,
  market,
  trackedIds,
  isSubscribed,
}: {
  ticker: string;
  market: "US" | "IN";
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  const instrumentId = `${market}_${String(ticker || "").trim().toUpperCase()}`;
  const isTracked = trackedIds.includes(instrumentId);

  if (isTracked) return null;

  return (
    <TrackButton
      ticker={ticker}
      instrumentId={instrumentId}
      isTracked={false}
      isSubscribed={isSubscribed}
      trackedCount={trackedIds.length}
      variant="icon"
    />
  );
}
