"use client";

import * as React from "react";

/**
 * A conversation opens at its newest part: on arrival the page scrolls to today's divider, unless the address asks
 * for a place of its own (#hash) or the browser is putting back an earlier scroll position.
 */
export function ScrollToToday() {
  React.useEffect(() => {
    if (window.location.hash || window.scrollY > 0) return;
    document.getElementById("thread-today")?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
