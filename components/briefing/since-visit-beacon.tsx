"use client";

import * as React from "react";

/**
 * Records one briefing visit (POST /api/briefing/visit) once the page has really been seen: on mount when the tab is
 * visible, else when it first becomes visible. Once per mounted page, so a re-render or React's double effect in
 * development does not post twice; the server also ignores a post within half an hour of the last one.
 */
export function VisitBeacon() {
  const sent = React.useRef(false);
  React.useEffect(() => {
    const send = () => {
      if (sent.current || document.visibilityState !== "visible") return;
      sent.current = true;
      fetch("/api/briefing/visit", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {
        // Not recorded this time; the next view records it.
      });
    };
    send();
    if (sent.current) return;
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, []);
  return null;
}
