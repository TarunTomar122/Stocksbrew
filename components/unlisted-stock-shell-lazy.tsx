"use client";

import dynamic from "next/dynamic";

/**
 * UnlistedStockShell, split into its own chunk. Its discovery modal pulls in every animated icon and the animation
 * library (about 55 kB gzipped), and it only shows for a ticker we do not cover, so the stock page loads that code only
 * when it actually renders. Still rendered on the server, so the page looks the same before the chunk arrives.
 */
export const UnlistedStockShellLazy = dynamic(() => import("./unlisted-stock-shell").then((mod) => mod.UnlistedStockShell));
