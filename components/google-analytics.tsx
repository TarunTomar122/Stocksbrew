"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

type GtagFn = (...args: unknown[]) => void;

function getGtag() {
  if (typeof window === "undefined") return null;
  if (!MEASUREMENT_ID) return null;

  const win = window as Window & {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  };

  win.dataLayer = win.dataLayer || [];
  win.gtag =
    win.gtag ||
    function gtag(...args: unknown[]) {
      win.dataLayer?.push(args);
    };

  return win.gtag;
}

export function GoogleAnalyticsPageview() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!pathname) return;

    const gtag = getGtag();
    if (!gtag) return;

    const query = search?.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;

    gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}
