"use client";

import type * as React from "react";
import { usePathname } from "next/navigation";

import { isMarketingPath } from "@/components/oa/nav-items";

/**
 * Picks the chrome for the current route: the app's sidebar and phone top bar,
 * or the marketing top bar on the pages a visitor reads before using the
 * product. Both trees are built on the server once; this only chooses, so a
 * click from /docs to /briefing swaps the chrome without a reload.
 */
export function ChromeSwitch({ app, marketing }: { app: React.ReactNode; marketing: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  return <>{isMarketingPath(pathname) ? marketing : app}</>;
}
