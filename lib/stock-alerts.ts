import { adminFirestore } from "@/lib/firebase-admin";

export const ALERT_KINDS = [
  "price_threshold",
  "anomaly",
  "rsi_extreme",
  "earnings_24h",
  "directive_change",
  "news_velocity",
  "brief_ready",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export type PriceCondition = "below" | "above";

export class StockAlertError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 400) {
    super(message);
    this.name = "StockAlertError";
  }
}

export function isAlertKind(value: string): value is AlertKind {
  return (ALERT_KINDS as readonly string[]).includes(value);
}

async function loadUserAlerts(uid: string) {
  const snap = await adminFirestore.collection("tm_alerts").where("uid", "==", uid).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as { id: string } & Record<string, unknown>);
}

export async function listStockAlerts(uid: string, input: { instrumentId?: string; kind?: string; limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 50)));
  return (await loadUserAlerts(uid))
    .filter((alert) => alert.active !== false)
    .filter((alert) => !input.instrumentId || alert.instrument_id === input.instrumentId)
    .filter((alert) => !input.kind || alert.kind === input.kind)
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
    .slice(0, limit);
}

export async function createStockAlert(input: {
  uid: string;
  email: string;
  instrumentId: string;
  ticker: string;
  kind: AlertKind;
  condition?: PriceCondition;
  targetPrice?: number;
  directiveText?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.instrumentId || !input.ticker) throw new StockAlertError("A stock is required.", "invalid_stock");
  if (input.kind === "price_threshold") {
    if (input.condition !== "below" && input.condition !== "above") {
      throw new StockAlertError("condition must be below or above.", "invalid_condition");
    }
    if (!Number.isFinite(input.targetPrice) || Number(input.targetPrice) <= 0) {
      throw new StockAlertError("A positive target price is required.", "invalid_target_price");
    }
  }
  const existing = (await loadUserAlerts(input.uid)).filter((row) => (
    row.active !== false && row.instrument_id === input.instrumentId && row.kind === input.kind
  ));
  const duplicate = existing.find((row) => {
    if (input.kind !== "price_threshold") return true;
    return row.condition === input.condition && Number(row.target_price) === Number(input.targetPrice);
  });
  if (duplicate) throw new StockAlertError("This alert already exists.", "alert_exists", 409);

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    uid: input.uid,
    email: input.email,
    instrument_id: input.instrumentId,
    ticker: input.ticker.toUpperCase(),
    kind: input.kind,
    note: input.note?.trim().slice(0, 240) || "",
    metadata: input.metadata || {},
    active: true,
    triggered: false,
    created_at: now,
    updated_at: now,
  };
  if (input.kind === "price_threshold") {
    payload.condition = input.condition;
    payload.target_price = input.targetPrice;
  }
  if (input.directiveText?.trim()) payload.directive_text = input.directiveText.trim().slice(0, 240);
  const doc = await adminFirestore.collection("tm_alerts").add(payload);
  return { alert_id: doc.id, kind: input.kind };
}

export async function deleteStockAlert(uid: string, alertId: string) {
  if (!alertId) throw new StockAlertError("An alert id is required.", "invalid_alert_id");
  const ref = adminFirestore.collection("tm_alerts").doc(alertId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.uid !== uid) throw new StockAlertError("Alert not found.", "alert_not_found", 404);
  await ref.update({ active: false, updated_at: new Date().toISOString() });
  return { alert_id: alertId, active: false };
}
