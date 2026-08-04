import type { BookCallHint } from "@/lib/radar-hub-data";
import type { WatchlistRow } from "@/lib/watchlist-view";

export type RadarLedgerCell =
  | { mode: "action"; call: BookCallHint }
  | { mode: "insight"; headline: string };

const SETUP_PHRASE =
  /\b(buy more below|enter below|trim above|trim below|add below|add above|accumulate now|buy below|trim into)\b/i;

function isSetupPhrase(text: string): boolean {
  return SETUP_PHRASE.test(text);
}

function isCalmReason(text: string): boolean {
  return /\bis calm\b/i.test(text) || /no major price/i.test(text) || /nothing material has changed/i.test(text);
}

/** Day move is already in the Change column. */
function isMoveCopy(text: string): boolean {
  return (
    /\bmoved\b/i.test(text) ||
    /\blarge move\b/i.test(text) ||
    /%\s*today\b/i.test(text) ||
    /\b1m\b/i.test(text) ||
    /over 1m/i.test(text)
  );
}

/** Analyst runway is already in the Runway column. */
function isRunwayCopy(text: string): boolean {
  return /analyst target runway|target runway/i.test(text);
}

function isRsiCopy(text: string): boolean {
  return /\brsi\b/i.test(text);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function tickerShowsRsi(row: WatchlistRow): boolean {
  const tech = row.technicals as Record<string, unknown> | undefined;
  const rsiBlock = (tech?.rsi_14 as Record<string, unknown> | undefined) ?? {};
  const rsi = num(rsiBlock.value);
  const state = String(rsiBlock.state ?? "").toLowerCase().trim();
  if (state === "overbought" || (rsi !== null && rsi >= 70)) return true;
  if (state === "oversold" || (rsi !== null && rsi <= 30)) return true;
  return false;
}

function shouldSkipInsight(row: WatchlistRow, kind: string | undefined, text: string): boolean {
  if (kind === "move" || kind === "price_move" || kind === "return_profile") return true;
  if (isMoveCopy(text)) return true;
  if (isRunwayCopy(text) && num(row.target_upside_pct) !== null) return true;
  if ((kind === "technical_state" || kind === "alert" || isRsiCopy(text)) && tickerShowsRsi(row)) {
    return true;
  }
  return false;
}

function insightHeadline(text: string): RadarLedgerCell {
  return { mode: "insight", headline: text.slice(0, 140) };
}

function alertInsight(row: WatchlistRow): RadarLedgerCell | null {
  const alert = row.alerts?.[0] as Record<string, unknown> | undefined;
  const message = String(alert?.message || alert?.label || "").trim();
  const kind = String(alert?.type || alert?.kind || "alert");
  if (!message || isSetupPhrase(message) || shouldSkipInsight(row, kind, message)) return null;
  return insightHeadline(message);
}

function attentionInsight(row: WatchlistRow): RadarLedgerCell | null {
  const kind = row.attention_kind;
  const reason = String(row.attention_reason || "").trim();
  if (
    !reason ||
    kind === "calm" ||
    isCalmReason(reason) ||
    isSetupPhrase(reason) ||
    shouldSkipInsight(row, kind, reason)
  ) {
    return null;
  }
  return insightHeadline(reason);
}

function briefInsight(row: WatchlistRow): RadarLedgerCell | null {
  const micro = String(row.brief_tile?.micro || "").trim();
  if (
    !micro ||
    /syncing|price and analysis/i.test(micro) ||
    isSetupPhrase(micro) ||
    shouldSkipInsight(row, undefined, micro)
  ) {
    return null;
  }
  return insightHeadline(micro);
}

function premiumInsight(row: WatchlistRow): RadarLedgerCell | null {
  const signals = (row.premium_signals ?? []) as Array<Record<string, unknown>>;

  for (const sig of signals) {
    const kind = String(sig.kind || "");
    const sentence = String(sig.sentence || "").trim();
    if (!sentence || isSetupPhrase(sentence) || shouldSkipInsight(row, kind, sentence)) continue;
    return insightHeadline(sentence);
  }

  return null;
}

function metricInsight(row: WatchlistRow): RadarLedgerCell | null {
  const summary = row.top_metric_summaries?.[0];
  if (!summary || isSetupPhrase(summary)) return null;
  return insightHeadline(summary);
}

/** Book table signal column: urgent price-zone calls, otherwise event-backed or legacy context. */
export function resolveRadarLedgerCell(
  row: WatchlistRow,
  call?: BookCallHint,
  options?: {
    preferRadar?: boolean;
    radarSignal?: { headline: string; urgent?: boolean };
  },
): RadarLedgerCell | null {
  if (call?.urgent) return { mode: "action", call };

  if (options?.preferRadar) {
    if (options.radarSignal) {
      return insightHeadline(options.radarSignal.headline);
    }
    return null;
  }

  return (
    briefInsight(row) ||
    attentionInsight(row) ||
    alertInsight(row) ||
    premiumInsight(row) ||
    metricInsight(row) ||
    null
  );
}
