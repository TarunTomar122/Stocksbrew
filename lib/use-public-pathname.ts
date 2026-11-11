"use client";

import { usePathname } from "next/navigation";

import { publicPathname } from "@/lib/anon-view";

/**
 * `usePathname()` as the visitor sees it. The cached logged-out pages are
 * built at an internal address (/anon/1/stock/NVDA for /stock/NVDA, see
 * lib/anon-view.ts), and while the server draws them `usePathname()` returns
 * that address; the browser then hydrates with the real one. Anything that
 * draws from the path (the active nav item, which chrome to show) must use
 * this hook, or the cached HTML would differ from the page the browser draws.
 */
export function usePublicPathname(): string | null {
  const pathname = usePathname();
  return pathname ? publicPathname(pathname) : pathname;
}
