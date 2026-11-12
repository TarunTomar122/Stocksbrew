import { can, limitFor, lockCopy, type Plan } from "@/lib/entitlements";
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

/** `paused_reason` on an alert whose stock left the person's list (syncAlertPauses below). */
export const REMOVED_PAUSE_REASON = "removed";
/** `paused_reason` on a price alert that came back with its stock but found every Free price-alert slot taken. */
export const LIMIT_PAUSE_REASON = "plan_limit";
const RESUMABLE = new Set<unknown>([REMOVED_PAUSE_REASON, LIMIT_PAUSE_REASON]);

async function loadUserAlerts(uid: string) {
  const snap = await adminFirestore.collection("tm_alerts").where("uid", "==", uid).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as { id: string } & Record<string, unknown>);
}

/** True for an alert that stopped because its stock left the person's list; it does not fire until it is resumed. */
export function isPausedAlert(alert: Record<string, unknown>): boolean {
  return typeof alert.paused_reason === "string" && alert.paused_reason.length > 0;
}

/** A Free price-alert slot is taken by a live price alert; a paused one does not fire, so it does not count. */
function usesPriceSlot(alert: Record<string, unknown>): boolean {
  return alert.active !== false && !isPausedAlert(alert) && (alert.kind === "price_threshold" || alert.kind === undefined || alert.kind === "");
}

/**
 * The person's alerts that are not off. Each carries `paused: true` when its stock was removed (it is kept and listed
 * so it can be turned off, but it does not fire); readers that show an on/off switch treat a paused one as off.
 */
export async function listStockAlerts(uid: string, input: { instrumentId?: string; kind?: string; limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 50)));
  return (await loadUserAlerts(uid))
    .map((alert): { id: string; paused: boolean } & Record<string, unknown> => ({ ...alert, paused: isPausedAlert(alert) }))
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
  /**
   * The account's plan. Price alerts are counted against `price_alerts` and
   * every other kind (earnings, call change, zones, moves) needs `zone_alerts`
   * (lib/entitlements.ts). Omitted only by callers that already checked.
   */
  plan?: Plan;
}) {
  if (!input.instrumentId || !input.ticker) throw new StockAlertError("A stock is required.", "invalid_stock");
  if (input.plan && input.kind !== "price_threshold" && !can("zone_alerts", input.plan)) {
    throw new StockAlertError(
      "Earnings, call-change and zone alerts are part of Pro. Free keeps price alerts, and the same events show up in your briefing.",
      "pro_required",
      403,
    );
  }
  if (input.kind === "price_threshold") {
    if (input.condition !== "below" && input.condition !== "above") {
      throw new StockAlertError("condition must be below or above.", "invalid_condition");
    }
    if (!Number.isFinite(input.targetPrice) || Number(input.targetPrice) <= 0) {
      throw new StockAlertError("A positive target price is required.", "invalid_target_price");
    }
  }
  const all = await loadUserAlerts(input.uid);
  const existing = all.filter((row) => (
    row.active !== false && row.instrument_id === input.instrumentId && row.kind === input.kind
  ));
  const duplicate = existing.find((row) => {
    if (input.kind !== "price_threshold") return true;
    return row.condition === input.condition && Number(row.target_price) === Number(input.targetPrice);
  });
  // Setting an alert that was paused when its stock was removed turns that one back on (below, after the plan
  // check) instead of saying it exists: the stock page shows a paused alert as off.
  const resuming = duplicate && RESUMABLE.has(duplicate.paused_reason) ? duplicate : null;
  if (duplicate && !resuming) throw new StockAlertError("This alert already exists.", "alert_exists", 409);
  if (input.plan && input.kind === "price_threshold") {
    const limit = limitFor("price_alerts", input.plan);
    if (limit <= 0) throw new StockAlertError(lockCopy("price_alerts").body, "pro_required", 403);
    const active = all.filter(usesPriceSlot).length;
    if (active >= limit) {
      throw new StockAlertError(
        `Free keeps ${limit} price alerts and all ${limit} are set. Remove one you no longer need, or wait for one to fire: a fired alert frees its slot. Pro keeps as many as you like.`,
        "plan_limit",
        409,
      );
    }
  }

  if (resuming) {
    const at = new Date().toISOString();
    await adminFirestore.collection("tm_alerts").doc(resuming.id).update({ paused_reason: null, resumed_at: at, updated_at: at });
    return { alert_id: resuming.id, kind: input.kind };
  }

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

/**
 * Removing a stock from the book pauses its alerts; adding it back resumes them. Additive only: the alert keeps
 * `active`, its target and its history, and gets `paused_reason: "removed"` (cleared to null on resume). The
 * evaluators skip an alert with a paused_reason (backend/mail/alerts.py, backend/price_alerts.py), and the Alerts
 * tab shows it as paused, so it can still be turned off. An alert set on a stock the person never followed is
 * never touched here: the stock page offers alerts on any stock.
 */
function isLiveAlert(alert: Record<string, unknown>): boolean {
  return alert.active !== false && alert.triggered !== true;
}

/**
 * Pause the live alerts on `pause` and resume the removed-paused ones on `resume`, from one read of the person's
 * alerts. A stock in both lists is resumed (it is tracked). Returns how many alerts were paused and resumed.
 *
 * The pause runs outside the write that removed the stock, from a read that can be a moment old, so the person's
 * list is read again right before it and a stock that is tracked by then is left alone (a quick re-add). With
 * `createdBefore`, only alerts set before that time are paused: an alert set later on a stock that is not followed
 * was set on purpose (the stock page offers alerts on any stock).
 */
export async function syncAlertPauses(
  uid: string,
  input: { pause?: readonly string[]; resume?: readonly string[]; createdBefore?: string; plan?: Plan },
): Promise<{ paused: number; resumed: number }> {
  const resume = new Set((input.resume ?? []).filter(Boolean));
  const pause = new Set((input.pause ?? []).filter((id) => id && !resume.has(id)));
  if (pause.size > 0) {
    const userSnap = await adminFirestore.collection("users").doc(uid).get();
    const trackedNow = userSnap.exists ? (userSnap.data()?.tracked_stocks as unknown) : null;
    if (Array.isArray(trackedNow)) for (const id of trackedNow) pause.delete(String(id));
  }
  if (pause.size === 0 && resume.size === 0) return { paused: 0, resumed: 0 };
  const alerts = await loadUserAlerts(uid);
  const now = new Date().toISOString();
  const before = input.createdBefore;
  const toPause = alerts.filter(
    (alert) =>
      isLiveAlert(alert) &&
      !alert.paused_reason &&
      pause.has(String(alert.instrument_id ?? "")) &&
      (!before || (typeof alert.created_at === "string" && alert.created_at < before)),
  );
  const candidates = alerts
    .filter((alert) => alert.active !== false && RESUMABLE.has(alert.paused_reason) && resume.has(String(alert.instrument_id ?? "")))
    .sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")));
  // Coming back must not get round the Free price-alert limit: price alerts resume oldest first while slots are free,
  // and the rest stay paused for the limit (they resume on a later rebuild once a slot frees up, or when switched on).
  let freeSlots = input.plan ? limitFor("price_alerts", input.plan) - alerts.filter(usesPriceSlot).length : Number.POSITIVE_INFINITY;
  const toResume: typeof alerts = [];
  const overLimit: typeof alerts = [];
  for (const alert of candidates) {
    const price = alert.kind === "price_threshold" || alert.kind === undefined || alert.kind === "";
    if (!price) toResume.push(alert);
    else if (freeSlots > 0) {
      toResume.push(alert);
      freeSlots -= 1;
    } else if (alert.paused_reason !== LIMIT_PAUSE_REASON) overLimit.push(alert);
  }
  const collection = adminFirestore.collection("tm_alerts");
  await Promise.all([
    ...toPause.map((alert) =>
      collection.doc(alert.id).update({ paused_reason: REMOVED_PAUSE_REASON, paused_at: now, updated_at: now }),
    ),
    ...toResume.map((alert) => collection.doc(alert.id).update({ paused_reason: null, resumed_at: now, updated_at: now })),
    ...overLimit.map((alert) => collection.doc(alert.id).update({ paused_reason: LIMIT_PAUSE_REASON, updated_at: now })),
  ]);
  return { paused: toPause.length, resumed: toResume.length };
}
