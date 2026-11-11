"use client";

import { useEffect } from "react";

/**
 * Opens the <details> row a link points at (#report-NVDA from the timeline),
 * so the jump lands on the stock's past reports instead of a closed row.
 */
export function OpenOnHash({ prefix }: { prefix: string }) {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith(prefix)) return;
      const details = document.getElementById(id)?.querySelector("details");
      if (details && !details.open) details.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [prefix]);
  return null;
}
