"use client";

import { useEffect } from "react";

import { captureEvent } from "@/lib/posthog";

export type RadarViewState = "signed_out" | "empty" | "active";

export function RadarPageAnalytics({
  state,
  trackedCount,
  isSubscribed,
}: {
  state: RadarViewState;
  trackedCount: number;
  isSubscribed: boolean;
}) {
  useEffect(() => {
    captureEvent("radar_viewed", {
      state,
      signed_in: state !== "signed_out",
      tracked_count: trackedCount,
      subscribed: isSubscribed,
    });
  }, [isSubscribed, state, trackedCount]);

  return null;
}
