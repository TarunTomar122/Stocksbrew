"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
  toggleWatchlist,
} from "@/lib/watchlist-store";

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>(getWatchlist);

  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<string[]>).detail;
      setTickers(detail);
    }
    window.addEventListener("tikrr:watchlist-changed", onChanged);
    return () => window.removeEventListener("tikrr:watchlist-changed", onChanged);
  }, []);

  const add = useCallback((ticker: string) => {
    const next = addToWatchlist(ticker);
    setTickers(next);
  }, []);

  const remove = useCallback((ticker: string) => {
    const next = removeFromWatchlist(ticker);
    setTickers(next);
  }, []);

  const toggle = useCallback((ticker: string) => {
    const result = toggleWatchlist(ticker);
    setTickers(result.watchlist);
    return result.added;
  }, []);

  const has = useCallback((ticker: string) => isInWatchlist(ticker), [tickers]); // eslint-disable-line react-hooks/exhaustive-deps

  return { tickers, add, remove, toggle, has };
}
