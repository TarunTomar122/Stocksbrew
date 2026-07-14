import type { RadarAttentionItem, RadarStockStateDoc, RadarUserView } from "@/lib/watchlist-view";

export type RadarRowSignal = {
  headline: string;
  kind: string;
  tone: "positive" | "negative" | "neutral";
  urgent?: boolean;
};

export type BookPositionType = "holding" | "watchlist";

const EVENT_LABELS: Record<string, string> = {
  rsi_oversold_cross: "Technical",
  rsi_overbought_cross: "Technical",
  rsi_return_to_neutral: "Technical",
  analyst_rating_change: "Analyst revision",
  analyst_target_revision: "Target change",
  earnings_upcoming: "Earnings soon",
  earnings_results: "Earnings reported",
  earnings_guidance_change: "Guidance",
  filing_catalyst: "SEC filing",
  abnormal_price_move: "Unusual move",
};

function directionTone(direction: RadarAttentionItem["direction"]): RadarRowSignal["tone"] {
  if (direction === "positive") return "positive";
  if (direction === "negative") return "negative";
  return "neutral";
}

function daysUntil(iso: string): number | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rsiHeadline(
  rsi: number,
  rsiState: string,
  positionType: BookPositionType,
): RadarRowSignal | null {
  const oversold = rsiState === "oversold" || rsi <= 35;
  const overbought = rsiState === "overbought" || rsi >= 70;
  const nearBuyZone = !oversold && rsi > 35 && rsi <= 40;
  const label = rsi.toFixed(0);

  if (positionType === "holding") {
    if (oversold) {
      return {
        kind: "rsi_oversold_cross",
        tone: "negative",
        headline: `RSI ${label} — sold down hard on a holding`,
      };
    }
    if (overbought) {
      return {
        kind: "rsi_overbought_cross",
        tone: "neutral",
        headline: `RSI ${label} — extended on a holding`,
      };
    }
    if (nearBuyZone) {
      return {
        kind: "rsi_oversold_cross",
        tone: "negative",
        headline: `RSI ${label} — weak stretch on a holding`,
      };
    }
    return null;
  }

  if (oversold || nearBuyZone) {
    return {
      kind: "rsi_oversold_cross",
      tone: "positive",
      headline: `RSI ${label} — near a buy zone`,
    };
  }
  if (overbought) {
    return null;
  }
  return null;
}

function signalFromState(
  state: RadarStockStateDoc,
  positionType: BookPositionType,
  upcomingAt?: string,
): RadarRowSignal | null {
  const pct = typeof state.day_change_pct === "number" ? state.day_change_pct : null;
  if (pct !== null && Math.abs(pct) >= 5) {
    const up = pct >= 0;
    return {
      kind: "abnormal_price_move",
      tone: up ? "positive" : "negative",
      headline: `${up ? "Up" : "Down"} ${Math.abs(pct).toFixed(1)}% today — larger than usual`,
      urgent: Math.abs(pct) >= 8,
    };
  }

  const rsi = typeof state.rsi_14 === "number" ? state.rsi_14 : null;
  const rsiState = String(state.rsi_state || "").toLowerCase();
  if (rsi !== null) {
    const rsiSignal = rsiHeadline(rsi, rsiState, positionType);
    if (rsiSignal) return rsiSignal;
  }

  if (state.last_filing_kind) {
    return {
      kind: "filing_catalyst",
      tone: "neutral",
      headline: `New ${state.last_filing_kind} filing`,
    };
  }

  const guidance = String(state.guidance_direction || "").toLowerCase();
  if (guidance === "raised" || guidance === "lowered") {
    return {
      kind: "earnings_guidance_change",
      tone: guidance === "raised" ? "positive" : "negative",
      headline: `Guidance ${guidance}`,
    };
  }

  if (upcomingAt) {
    const delta = daysUntil(upcomingAt);
    if (delta !== null && delta >= 0 && delta <= 14) {
      const dateLabel = formatShortDate(upcomingAt);
      return {
        kind: "earnings_upcoming",
        tone: "neutral",
        headline:
          delta <= 3
            ? `Earnings ${delta === 0 ? "today" : delta === 1 ? "tomorrow" : `in ${delta} days`}`
            : `Earnings ${dateLabel}`,
        urgent: delta <= 3,
      };
    }
  }

  if (state.earnings_status === "upcoming" && state.earnings_date) {
    const delta = daysUntil(`${state.earnings_date}T00:00:00Z`);
    if (delta !== null && delta >= 0 && delta <= 14) {
      return {
        kind: "earnings_upcoming",
        tone: "neutral",
        headline:
          delta <= 3
            ? `Earnings ${delta === 0 ? "today" : delta === 1 ? "tomorrow" : `in ${delta} days`}`
            : `Earnings ${formatShortDate(state.earnings_date)}`,
        urgent: delta <= 3,
      };
    }
  }

  return null;
}

/** Per-ticker signal lines for the book table, backed by Radar state + attention items. */
export function buildRadarRowSignals(
  instrumentIds: string[],
  states: Record<string, RadarStockStateDoc>,
  view: RadarUserView | null,
  positionByInstrumentId: Record<string, BookPositionType> = {},
): Record<string, RadarRowSignal> {
  const attentionById = new Map(
    (view?.attention_items ?? []).map((item) => [item.instrument_id.toUpperCase(), item]),
  );
  const upcomingById = new Map(
    (view?.upcoming_events ?? []).map((event) => [event.instrument_id.toUpperCase(), event.expected_at]),
  );

  const out: Record<string, RadarRowSignal> = {};
  for (const rawId of instrumentIds) {
    const instrumentId = rawId.toUpperCase();
    const positionType = positionByInstrumentId[instrumentId] ?? "watchlist";
    const attention = attentionById.get(instrumentId);
    if (attention) {
      const label = EVENT_LABELS[attention.event_type] ?? "Signal";
      out[instrumentId] = {
        kind: attention.event_type,
        tone: directionTone(attention.direction),
        urgent: true,
        headline:
          attention.event_type === "earnings_upcoming"
            ? attention.what_changed.replace(/\s*\([^)]*\)\s*$/, "").slice(0, 120)
            : `${label}: ${attention.what_changed}`.slice(0, 140),
      };
      continue;
    }

    const state = states[instrumentId];
    if (!state) continue;
    const derived = signalFromState(state, positionType, upcomingById.get(instrumentId));
    if (derived) out[instrumentId] = derived;
  }
  return out;
}

export function radarAttentionRank(
  instrumentId: string,
  signals: Record<string, RadarRowSignal>,
): number {
  const signal = signals[instrumentId.toUpperCase()];
  if (!signal) return 0;
  if (signal.urgent) return 100;
  return 40;
}
