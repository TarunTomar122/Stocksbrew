"use client";

import { useEffect, useRef, useState } from "react";

import { AttributionSurvey } from "@/components/attribution-survey";
import { useUser } from "@/lib/auth-context";
import { RADAR_TRACK_CHANGED_EVENT, type RadarTrackChangedDetail } from "@/lib/radar-track-events";

const STORAGE_KEY = "tikrr_attribution_done";

function hasLocalAttributionFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AttributionTrigger() {
  const { user } = useUser();
  const checkedUid = useRef<string | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);

  useEffect(() => {
    if (!user) {
      checkedUid.current = null;
      setShowSurvey(false);
      return;
    }

    if (checkedUid.current === user.uid) return;
    checkedUid.current = user.uid;

    if (hasLocalAttributionFlag()) return;

    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | null = null;

    async function checkAfterActivation() {
      try {
        const res = await fetch("/api/user/profile", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as {
          attribution_submitted?: boolean;
          tracked_count?: number;
        };
        if (cancelled) return;
        if (payload.attribution_submitted) {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // best effort
          }
          return;
        }
        if ((payload.tracked_count ?? 0) < 1 || showTimer) return;
        showTimer = setTimeout(() => {
          if (!cancelled) setShowSurvey(true);
        }, 30_000);
      } catch {
        // Don't block the app if profile check fails.
      }
    }

    function onTrackChanged(event: Event) {
      const detail = (event as CustomEvent<RadarTrackChangedDetail>).detail;
      if (detail?.action === "add") void checkAfterActivation();
    }

    void checkAfterActivation();
    window.addEventListener(RADAR_TRACK_CHANGED_EVENT, onTrackChanged);

    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      window.removeEventListener(RADAR_TRACK_CHANGED_EVENT, onTrackChanged);
    };
  }, [user]);

  if (!showSurvey) return null;

  return <AttributionSurvey onDone={() => setShowSurvey(false)} />;
}
