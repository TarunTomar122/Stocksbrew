"use client";

import { useEffect, useRef, useState } from "react";

import { AttributionSurvey } from "@/components/attribution-survey";
import { useUser } from "@/lib/auth-context";

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

    void (async () => {
      try {
        const res = await fetch("/api/user/profile", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as { attribution_submitted?: boolean };
        if (cancelled) return;
        if (payload.attribution_submitted) {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // best effort
          }
          return;
        }
        setShowSurvey(true);
      } catch {
        // Don't block the app if profile check fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!showSurvey) return null;

  return <AttributionSurvey onDone={() => setShowSurvey(false)} />;
}
