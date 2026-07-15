"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

import { AlertSetModal } from "@/components/alert-set-modal";
import { signInWithGoogle } from "@/lib/sign-in";
import {
  createStockAlert,
  deleteStockAlert,
  earningsAlertKey,
  fetchStockAlerts,
  priceAlertKey,
  type CreateAlertPayload,
  type StoredAlert,
} from "@/lib/create-alert";
import type { DirectiveSmartAlert } from "@/lib/directive-ui";
import { smartAlertToneColors } from "@/lib/directive-ui";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";

type EarningsAlert = {
  eventDate: string;
  dateLabel: string;
};

type ModalState = {
  open: boolean;
  status: "loading" | "success" | "error";
  title: string;
  subtitle?: string;
};

function alertRowKey(row: StoredAlert): string | null {
  if (row.kind === "price_threshold" && row.condition && typeof row.target_price === "number") {
    return priceAlertKey(row.condition, row.target_price);
  }
  if (row.kind === "earnings_24h") {
    return earningsAlertKey();
  }
  return null;
}

function indexAlerts(rows: StoredAlert[]): { keys: Set<string>; idsByKey: Record<string, string> } {
  const keys = new Set<string>();
  const idsByKey: Record<string, string> = {};
  for (const row of rows) {
    const key = alertRowKey(row);
    if (!key || !row.id) continue;
    keys.add(key);
    idsByKey[key] = row.id;
  }
  return { keys, idsByKey };
}

function ActionBadge({ active, busy, activeLabel, inactiveLabel }: {
  active: boolean;
  busy: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  if (busy) {
    return (
      <span className="shrink-0 font-mono text-[12px] font-semibold text-on-surface-variant">…</span>
    );
  }
  if (active) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold"
        style={{
          borderColor: "color-mix(in srgb, var(--signal-bullish) 35%, var(--outline-variant))",
          background: "color-mix(in srgb, var(--signal-bullish) 10%, var(--surface-container-low))",
          color: "var(--signal-bullish)",
        }}
      >
        <AnimatedIcon name="notifications_active" size={14} className="text-[14px] leading-none" aria-hidden />
        {activeLabel}
      </span>
    );
  }
  return (
    <span className="shrink-0 font-mono text-[12px] font-semibold" style={{ color: "var(--signal-bullish)" }}>
      {inactiveLabel}
    </span>
  );
}

export function StockSmartAlertsRail({
  ticker,
  instrumentId,
  alerts,
  earningsAlert,
  isSubscribed,
}: {
  ticker: string;
  instrumentId: string;
  alerts: DirectiveSmartAlert[];
  earningsAlert: EarningsAlert | null;
  isSubscribed: boolean;
}) {
  const { user, loading: authLoading, initialAuthed } = useUser();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [alertIdsByKey, setAlertIdsByKey] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    status: "loading",
    title: "Setting alert…",
  });

  const closeModal = useCallback(() => {
    setModal((m) => ({ ...m, open: false }));
  }, []);

  const syncFromServer = useCallback(async () => {
    const rows = await fetchStockAlerts(instrumentId);
    const { keys, idsByKey } = indexAlerts(rows);
    setActiveKeys(keys);
    setAlertIdsByKey(idsByKey);
    return { keys, idsByKey };
  }, [instrumentId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user && !initialAuthed) return;
    let cancelled = false;
    (async () => {
      const rows = await fetchStockAlerts(instrumentId);
      if (cancelled) return;
      const { keys, idsByKey } = indexAlerts(rows);
      setActiveKeys(keys);
      setAlertIdsByKey(idsByKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, initialAuthed, instrumentId]);

  async function ensureSignedIn(): Promise<boolean> {
    if (user) return true;
    setModal({
      open: true,
      status: "loading",
      title: "Signing you in…",
      subtitle: "Alerts go to your Google email.",
    });
    try {
      await signInWithGoogle({ surface: "stock_smart_alert" });
      setModal({ open: false, status: "loading", title: "" });
      return true;
    } catch {
      setModal({
        open: true,
        status: "error",
        title: "Sign-in required",
        subtitle: "Sign in with Google to get email alerts on this stock.",
      });
      return false;
    }
  }

  async function resolveAlertId(key: string): Promise<string | null> {
    if (alertIdsByKey[key]) return alertIdsByKey[key];
    const { idsByKey } = await syncFromServer();
    return idsByKey[key] ?? null;
  }

  async function runDelete(key: string, successCopy: { title: string; subtitle: string }) {
    if (!(await ensureSignedIn())) return;

    setBusyKey(key);
    setModal({ open: true, status: "loading", title: "Turning off alert…" });

    const alertId = await resolveAlertId(key);
    if (!alertId) {
      setBusyKey(null);
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setModal({
        open: true,
        status: "success",
        title: "Already off",
        subtitle: "This alert is no longer active.",
      });
      return;
    }

    const result = await deleteStockAlert(alertId);
    setBusyKey(null);

    if (!result.ok) {
      setModal({
        open: true,
        status: "error",
        title: "Could not turn off alert",
        subtitle: result.error,
      });
      return;
    }

    setActiveKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setAlertIdsByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    captureEvent("alert_removed", { instrument_id: instrumentId, ticker, key });

    setModal({
      open: true,
      status: "success",
      title: successCopy.title,
      subtitle: successCopy.subtitle,
    });
  }

  async function runCreate(key: string, payload: CreateAlertPayload, successCopy: { title: string; subtitle: string }) {
    if (!(await ensureSignedIn())) return;

    setBusyKey(key);
    setModal({
      open: true,
      status: "loading",
      title: "Setting alert…",
      subtitle: `Saving to ${user?.email ?? "your email"}.`,
    });

    const result = await createStockAlert(payload);
    setBusyKey(null);

    if (!result.ok) {
      setModal({
        open: true,
        status: "error",
        title: "Could not set alert",
        subtitle: result.error,
      });
      return;
    }

    let alertId = result.alertId;
    if (!alertId || result.alreadyExists) {
      const { idsByKey } = await syncFromServer();
      alertId = idsByKey[key];
    }

    setActiveKeys((prev) => new Set(prev).add(key));
    if (alertId) {
      setAlertIdsByKey((prev) => ({ ...prev, [key]: alertId }));
    }

    captureEvent("alert_set_clicked", {
      instrument_id: instrumentId,
      ticker,
      kind: payload.kind ?? "price_threshold",
    });

    setModal({
      open: true,
      status: "success",
      title: result.alreadyExists ? "Already on your list" : successCopy.title,
      subtitle: result.alreadyExists
        ? `We'll email ${user?.email ?? "you"} when this triggers. Tap again to turn off.`
        : `${successCopy.subtitle} Tap again to turn off.`,
    });
  }

  function handlePriceAlert(alert: DirectiveSmartAlert) {
    if (!alert.alertable || alert.price == null || !alert.condition) return;
    const key = priceAlertKey(alert.condition, alert.price);
    const priceLabel = alert.detail ?? `${alert.condition} $${alert.price}`;

    if (activeKeys.has(key)) {
      void runDelete(key, {
        title: "Alert turned off",
        subtitle: `We won't email you about ${ticker} ${priceLabel} anymore.`,
      });
      return;
    }

    void runCreate(
      key,
      {
        instrument_id: instrumentId,
        ticker,
        kind: "price_threshold",
        condition: alert.condition,
        target_price: alert.price,
        directive_text: alert.directiveText,
      },
      {
        title: "Alert set",
        subtitle: `We'll email ${user?.email ?? "you"} when ${ticker} goes ${priceLabel}.`,
      },
    );
  }

  function handleEarningsAlert() {
    if (!earningsAlert) return;
    const key = earningsAlertKey();

    if (activeKeys.has(key)) {
      void runDelete(key, {
        title: "Reminder turned off",
        subtitle: `We won't email you before ${ticker} reports (${earningsAlert.dateLabel}).`,
      });
      return;
    }

    void runCreate(
      key,
      {
        instrument_id: instrumentId,
        ticker,
        kind: "earnings_24h",
        note: `Earnings reminder · ${earningsAlert.dateLabel}`,
        metadata: { event_date: earningsAlert.eventDate },
      },
      {
        title: "Reminder set",
        subtitle: `We'll email ${user?.email ?? "you"} before ${ticker} reports (${earningsAlert.dateLabel}).`,
      },
    );
  }

  if (alerts.length === 0 && !earningsAlert) return null;

  if (!isSubscribed) {
    return (
      <section className="rounded-2xl border border-outline-variant bg-surface p-4 sm:p-5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-on-surface-variant">
          Pro alerts
        </p>
        <h3 className="mt-2 text-[14px] font-bold text-on-surface">Let the setup bring you back</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-on-surface-variant">
          Pro watches earnings, buy zones, and trim zones automatically. You can also set a manual price alert.
        </p>
        <Link
          href="/subscribe"
          className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-on-surface px-4 text-[12px] font-semibold text-surface no-underline"
        >
          Unlock Pro alerts
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-outline-variant bg-surface p-4 sm:p-5">
        <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-on-surface-variant">
          smart alerts
        </p>
        <div className="space-y-1">
          {alerts.map((alert) => {
            const colors = smartAlertToneColors(alert.tone);
            const key =
              alert.alertable && alert.price != null && alert.condition
                ? priceAlertKey(alert.condition, alert.price)
                : alert.id;
            const isActive = alert.alertable && alert.price != null && alert.condition ? activeKeys.has(key) : false;
            const isBusy = busyKey === key;
            const interactive = alert.alertable && alert.price != null && alert.condition;

            return (
              <button
                key={alert.id}
                type="button"
                disabled={!interactive || isBusy}
                onClick={() => handlePriceAlert(alert)}
                aria-pressed={isActive}
                aria-label={
                  isActive
                    ? `Turn off price alert for ${alert.title}`
                    : `Set price alert for ${alert.title}`
                }
                className={`flex w-full items-start gap-2.5 rounded-lg px-1 py-2.5 text-left transition-colors disabled:cursor-default ${
                  interactive ? "hover:bg-surface-container-low active:bg-surface-container" : ""
                }`}
              >
                <span aria-hidden className="mt-0.5 shrink-0 text-[13px] leading-none">
                  🔔
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold leading-snug" style={{ color: colors.title }}>
                    {alert.title}
                  </p>
                  {alert.detail ? (
                    <p className="mt-0.5 font-mono text-[11.5px] leading-snug tabular-nums text-on-surface-variant">
                      {alert.detail}
                    </p>
                  ) : null}
                </div>
                {interactive ? (
                  <ActionBadge
                    active={isActive}
                    busy={isBusy}
                    activeLabel="Active"
                    inactiveLabel="Create"
                  />
                ) : null}
              </button>
            );
          })}

          {earningsAlert ? (
            <button
              type="button"
              disabled={busyKey === earningsAlertKey()}
              onClick={handleEarningsAlert}
              aria-pressed={activeKeys.has(earningsAlertKey())}
              aria-label={
                activeKeys.has(earningsAlertKey())
                  ? "Turn off earnings reminder"
                  : "Set earnings reminder"
              }
              className="flex w-full items-start gap-2.5 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-surface-container-low active:bg-surface-container"
            >
              <span aria-hidden className="mt-0.5 shrink-0 text-[13px] leading-none">
                🔔
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold leading-snug text-on-surface">Earnings</p>
                <p className="mt-0.5 font-mono text-[11.5px] leading-snug text-on-surface-variant">
                  {earningsAlert.dateLabel}
                </p>
              </div>
              <ActionBadge
                active={activeKeys.has(earningsAlertKey())}
                busy={busyKey === earningsAlertKey()}
                activeLabel="Reminder on"
                inactiveLabel="Remind"
              />
            </button>
          ) : null}
        </div>
      </section>

      <AlertSetModal
        open={modal.open}
        status={modal.status}
        title={modal.title}
        subtitle={modal.subtitle}
        onClose={closeModal}
      />
    </>
  );
}
