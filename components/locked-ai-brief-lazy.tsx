"use client";

import dynamic from "next/dynamic";

/**
 * LockedAiBrief, split into its own chunk. It (and the animation library it
 * pulls in) only shows on a stock with no brief yet, so the stock page loads
 * its code only when it actually renders. Still rendered on the server, so
 * the page looks the same before the chunk arrives.
 */
export const LockedAiBriefLazy = dynamic(() => import("./locked-ai-brief").then((mod) => mod.LockedAiBrief));
