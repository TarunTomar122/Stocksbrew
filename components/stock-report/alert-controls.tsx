"use client";

import { useCallback, useEffect, useState } from "react";

import { useUser } from "@/lib/auth-context";
import {
  createStockAlert,
  deleteStockAlert,
  earningsAlertKey,
  fetchStockAlerts,
  priceAlertKey,
  type CreateAlertPayload,
  type StoredAlert,
} from "@/lib/create-alert";
import { captureEvent } from "@/lib/posthog";
import { signInWithGoogle } from "@/lib/sign-in";
import { limitFor } from "@/lib/entitlements";

/**
 * Alerts for one stock: the levels from our call, the next earnings date, and
 * any price the reader types in. Uses the same `/api/alerts` endpoints as the
 * rest of the app; alerts are sent by email.
 */

export type SuggestedAlert = {
  id: string;
  label: string;
  condition: "above" | "below";
  price: number;
  /** Why this level, stored with the alert so the email can repeat it. */
  note: string;
};

type Status = { tone: "ok" | "error"; text: string } | null;

function rowKey(row: StoredAlert): string | null {
  if (row.kind === "price_threshold" && row.condition && typeof row.target_price === "number") {
    return priceAlertKey(row.condition, row.target_price);
  }
  if (row.kind === "earnings_24h") return earningsAlertKey();
  return null;
}

function Bell({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function AlertControls({
  ticker,
  instrumentId,
  currency,
  currentPrice,
  suggested,
  earnings,
}: {
  ticker: string;
  instrumentId: string;
  currency: string;
  currentPrice: number;
  suggested: SuggestedAlert[];
  earnings: { eventDate: string; label: string; shortLabel: string } | null;
}) {
  const { user, loading, initialAuthed } = useUser();
  const [ids, setIds] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Array<{ key: string; condition: string; price: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [draft, setDraft] = useState("");

  const money = (value: number) =>
    `${currency}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sync = useCallback(async () => {
    const rows = await fetchStockAlerts(instrumentId);
    const next: Record<string, string> = {};
    const prices: Array<{ key: string; condition: string; price: number }> = [];
    for (const row of rows) {
      const key = rowKey(row);
      if (!key || !row.id) continue;
      next[key] = row.id;
      if (row.kind === "price_threshold" && row.condition && typeof row.target_price === "number") {
        prices.push({ key, condition: row.condition, price: row.target_price });
      }
    }
    setIds(next);
    setCustom(prices);
    return next;
  }, [instrumentId]);

  useEffect(() => {
    if (loading || (!user && !initialAuthed)) return;
    void sync().catch(() => undefined);
  }, [loading, user, initialAuthed, sync]);

  async function ensureSignedIn(): Promise<boolean> {
    if (user) return true;
    try {
      await signInWithGoogle({ surface: "stock_smart_alert" });
      return true;
    } catch {
      setStatus({ tone: "error", text: "Sign in with Google to get alerts by email." });
      return false;
    }
  }

  async function toggle(key: string, payload: CreateAlertPayload, onText: string, offText: string) {
    if (busy) return;
    setStatus(null);
    if (!(await ensureSignedIn())) return;
    setBusy(key);
    try {
      const existing = ids[key] ?? (await sync())[key];
      if (existing) {
        const result = await deleteStockAlert(existing);
        if (!result.ok) {
          setStatus({ tone: "error", text: result.error });
          return;
        }
        captureEvent("alert_removed", { instrument_id: instrumentId, ticker, key });
        setStatus({ tone: "ok", text: offText });
      } else {
        const result = await createStockAlert(payload);
        if (!result.ok) {
          setStatus({ tone: "error", text: result.error });
          return;
        }
        captureEvent("alert_set_clicked", { instrument_id: instrumentId, ticker, kind: payload.kind ?? "price_threshold" });
        setStatus({ tone: "ok", text: onText });
      }
      await sync();
    } catch {
      setStatus({ tone: "error", text: "That did not go through. Try again." });
    } finally {
      setBusy(null);
    }
  }

  function togglePrice(condition: "above" | "below", price: number, note: string) {
    const key = priceAlertKey(condition, price);
    return toggle(
      key,
      { instrument_id: instrumentId, ticker, kind: "price_threshold", condition, target_price: price, directive_text: note },
      `We will email you when ${ticker} goes ${condition} ${money(price)}.`,
      `Alert for ${condition} ${money(price)} is off.`,
    );
  }

  function submitCustom(event: React.FormEvent) {
    event.preventDefault();
    const price = Number(draft.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(price) || price <= 0) {
      setStatus({ tone: "error", text: "Enter a price above zero." });
      return;
    }
    if (Math.abs(price - currentPrice) < 0.005) {
      setStatus({ tone: "error", text: `${ticker} is at that price now. Pick a level above or below it.` });
      return;
    }
    const rounded = Math.round(price * 100) / 100;
    const condition = rounded > currentPrice ? "above" : "below";
    if (ids[priceAlertKey(condition, rounded)]) {
      setStatus({ tone: "ok", text: `You already have an alert for ${condition} ${money(rounded)}.` });
      return;
    }
    setDraft("");
    void togglePrice(condition, rounded, `Price alert you set on ${ticker}`);
  }

  const suggestedKeys = new Set(suggested.map((item) => priceAlertKey(item.condition, item.price)));
  const extra = custom.filter((item) => !suggestedKeys.has(item.key));
  const earningsOn = Boolean(ids[earningsAlertKey()]);
  const draftPrice = Number(draft.replace(/[^0-9.]/g, ""));
  const draftSide = Number.isFinite(draftPrice) && draftPrice > 0 && draft ? (draftPrice > currentPrice ? "above" : "below") : null;

  const rowClass =
    "flex min-h-10 w-full items-center justify-between gap-3 border-b border-oa-border px-3.5 py-1.5 text-left text-[14px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent disabled:opacity-60 sm:min-h-9 sm:px-4";

  return (
    <div>
      {suggested.map((item) => {
        const key = priceAlertKey(item.condition, item.price);
        const on = Boolean(ids[key]);
        return (
          <button
            key={item.id}
            type="button"
            className={rowClass}
            aria-pressed={on}
            disabled={busy === key}
            onClick={() => void togglePrice(item.condition, item.price, item.note)}
          >
            <span className="min-w-0 text-oa-muted-fg">
              {item.label}{" "}
              <span className="oa-mono tabular-nums text-oa-fg">
                {item.condition} {money(item.price)}
              </span>
            </span>
            <span className={`flex shrink-0 items-center gap-1.5 text-[12px] ${on ? "text-oa-primary" : "text-oa-muted-fg"}`}>
              {on ? "On" : "Alert me"}
              <Bell on={on} />
            </span>
          </button>
        );
      })}

      {earnings ? (
        <button
          type="button"
          className={rowClass}
          aria-pressed={earningsOn}
          disabled={busy === earningsAlertKey()}
          onClick={() =>
            void toggle(
              earningsAlertKey(),
              {
                instrument_id: instrumentId,
                ticker,
                kind: "earnings_24h",
                note: `Earnings reminder · ${earnings.label}`,
                metadata: { event_date: earnings.eventDate },
              },
              `We will email you the day before ${ticker} reports (${earnings.label}).`,
              "Earnings reminder is off.",
            )
          }
        >
          <span className="min-w-0 text-oa-muted-fg">
            Earnings <span className="oa-mono tabular-nums text-oa-fg">{earnings.shortLabel}</span>
          </span>
          <span className={`flex shrink-0 items-center gap-1.5 text-[12px] ${earningsOn ? "text-oa-primary" : "text-oa-muted-fg"}`}>
            {earningsOn ? "On" : "Remind day before"}
            <Bell on={earningsOn} />
          </span>
        </button>
      ) : null}

      {extra.map((item) => (
        <button
          key={item.key}
          type="button"
          className={rowClass}
          aria-pressed="true"
          disabled={busy === item.key}
          onClick={() => void togglePrice(item.condition === "above" ? "above" : "below", item.price, "")}
        >
          <span className="min-w-0 text-oa-muted-fg">
            Your alert{" "}
            <span className="oa-mono tabular-nums text-oa-fg">
              {item.condition} {money(item.price)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-oa-primary">
            On
            <Bell on />
          </span>
        </button>
      ))}

      <form onSubmit={submitCustom} className="flex items-center gap-2 px-3.5 py-2.5 sm:px-4">
        <label className="flex h-10 min-w-0 flex-1 sm:h-8 items-center gap-1 rounded-lg border border-oa-border bg-oa-bg px-2 focus-within:border-oa-primary">
          <span className="oa-mono text-[13px] text-oa-muted-fg">{currency}</span>
          <input
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Any price"
            aria-label={`Price for a ${ticker} alert`}
            className="oa-mono h-full w-full min-w-0 bg-transparent text-[13px] text-oa-fg outline-none placeholder:text-oa-muted-fg/70"
          />
          {draftSide ? <span className="oa-mono shrink-0 text-[11px] text-oa-muted-fg">{draftSide}</span> : null}
        </label>
        <button
          type="submit"
          disabled={Boolean(busy)}
          className="h-10 shrink-0 rounded-lg bg-oa-secondary px-3 sm:h-8 text-[13px] font-medium text-oa-fg outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--oa-secondary)_92%,var(--oa-fg))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] disabled:opacity-60"
        >
          Set alert
        </button>
      </form>

      <p
        role="status"
        className={`px-3.5 pb-2.5 text-[12px] leading-4 sm:px-4 ${status?.tone === "error" ? "text-signal-bearish" : "text-oa-muted-fg"}`}
      >
        {status?.text ?? `Alerts arrive by email. Free keeps ${limitFor("price_alerts", "free")} price alerts; earnings and call-change alerts are part of Pro.`}
      </p>
    </div>
  );
}
