import type { BookCallHint } from "@/lib/radar-hub-data";
import type { WatchlistRow } from "@/lib/watchlist-view";

import type { RadarRowSignal } from "@/lib/radar-row-signals";

/** Higher = needs attention sooner. Urgent price zones beat calendar/RSI filler. */
export function bookRowAttentionScore(
  row: WatchlistRow,
  options: {
    call?: BookCallHint;
    radarSignal?: RadarRowSignal;
    preferRadar?: boolean;
  },
): number {
  if (options.call?.urgent) return 1000;
  if (options.preferRadar && options.radarSignal?.urgent) return 500;
  if (options.preferRadar && options.radarSignal) return 200;
  if (options.call) return 100;
  return 0;
}

export function compareBookRowsByAttention(
  a: WatchlistRow,
  b: WatchlistRow,
  options: {
    callHints: Map<string, BookCallHint>;
    radarSignals?: Record<string, RadarRowSignal>;
    preferRadar?: boolean;
  },
): number {
  const key = (row: WatchlistRow) => row.ticker.toUpperCase();
  const id = (row: WatchlistRow) => row.instrument_id.toUpperCase();
  const scoreA = bookRowAttentionScore(a, {
    call: options.callHints.get(key(a)),
    radarSignal: options.radarSignals?.[id(a)],
    preferRadar: options.preferRadar,
  });
  const scoreB = bookRowAttentionScore(b, {
    call: options.callHints.get(key(b)),
    radarSignal: options.radarSignals?.[id(b)],
    preferRadar: options.preferRadar,
  });
  if (scoreB !== scoreA) return scoreB - scoreA;
  return Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0);
}
