export type CreateAlertPayload = {
  instrument_id: string;
  ticker: string;
  kind?: "price_threshold" | "earnings_24h" | "brief_ready";
  condition?: "below" | "above";
  target_price?: number;
  directive_text?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type StoredAlert = {
  id: string;
  instrument_id?: string;
  kind?: string;
  condition?: string;
  target_price?: number;
  active?: boolean;
  /** Its stock was removed from the person's list: kept and listed, but it does not fire. */
  paused?: boolean;
};

export type CreateAlertResult =
  | { ok: true; alreadyExists?: boolean; alertId?: string }
  | { ok: false; error: string; unauthorized?: boolean; code?: string };

export type DeleteAlertResult = { ok: true } | { ok: false; error: string; unauthorized?: boolean };

export async function fetchStockAlerts(instrumentId?: string): Promise<StoredAlert[]> {
  const qs = instrumentId ? `?instrument_id=${encodeURIComponent(instrumentId)}` : "";
  const res = await fetch(`/api/alerts${qs}`);
  if (res.status === 401) return [];
  const data = (await res.json().catch(() => ({}))) as { alerts?: StoredAlert[] };
  if (!res.ok) return [];
  // The on/off switches (stock page, research-ready bell) treat a paused alert as off: switching it on resumes it
  // (lib/stock-alerts.ts createStockAlert). The Alerts tab on My stocks lists paused ones from the server instead.
  return (data.alerts ?? []).filter((alert) => !alert.paused);
}

export async function createStockAlert(payload: CreateAlertPayload): Promise<CreateAlertResult> {
  const res = await fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; alert_id?: string; code?: string };

  if (res.status === 401) {
    return { ok: false, error: "Sign in to get email alerts.", unauthorized: true };
  }
  // Only a duplicate is "already set". A 409 for the Free limit (say, turning a paused alert back on with every slot
  // taken) is an error the person needs to see, and the alert stays off.
  if (res.status === 409 && data.code === "alert_exists") {
    return { ok: true, alreadyExists: true };
  }
  if (res.status === 403 && data.error === "pro_required") {
    return { ok: false, error: data.message || "Pro is required to create stock alerts." };
  }
  if (!res.ok) {
    return { ok: false, error: data.error || "Could not set alert.", code: typeof data.code === "string" ? data.code : undefined };
  }
  return { ok: true, alertId: data.alert_id };
}

export async function deleteStockAlert(alertId: string): Promise<DeleteAlertResult> {
  const res = await fetch(`/api/alerts?id=${encodeURIComponent(alertId)}`, { method: "DELETE" });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    return { ok: false, error: "Sign in to manage alerts.", unauthorized: true };
  }
  if (!res.ok) {
    return { ok: false, error: data.error || "Could not remove alert." };
  }
  return { ok: true };
}

export function priceAlertKey(condition: string, price: number): string {
  return `price:${condition}:${price.toFixed(2)}`;
}

export function earningsAlertKey(): string {
  return "earnings";
}

export function briefReadyAlertKey(): string {
  return "brief_ready";
}
