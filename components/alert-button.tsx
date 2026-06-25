"use client";

import { useCallback, useState } from "react";

import { AlertSetModal } from "@/components/alert-set-modal";
import { signInWithGoogle } from "@/lib/sign-in";
import { createStockAlert } from "@/lib/create-alert";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";

type Props = {
  ticker: string;
  instrumentId: string;
  condition: "below" | "above";
  targetPrice: number;
  directiveText: string;
  variant?: "default" | "zone" | "link";
  linkLabel?: string;
  initialDone?: boolean;
};

function DoneBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-semibold ${
        compact ? "shrink-0 rounded-md border px-2 py-0.5 text-[11px]" : "rounded-lg border px-2.5 py-1 text-[11px] font-medium tracking-normal normal-case"
      }`}
      style={{
        borderColor: "color-mix(in srgb, var(--signal-bullish) 35%, var(--outline-variant))",
        background: "color-mix(in srgb, var(--signal-bullish) 10%, var(--surface-container-low))",
        color: "var(--signal-bullish)",
      }}
    >
      <span
        className="material-symbols-outlined text-[13px] leading-none"
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
      >
        notifications_active
      </span>
      {compact ? "Active" : "Alert set"}
    </span>
  );
}

export function AlertButton({
  ticker,
  instrumentId,
  condition,
  targetPrice,
  directiveText,
  variant = "default",
  linkLabel = "Create",
  initialDone = false,
}: Props) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [modal, setModal] = useState<{
    open: boolean;
    status: "loading" | "success" | "error";
    title: string;
    subtitle?: string;
  }>({ open: false, status: "loading", title: "" });

  const closeModal = useCallback(() => {
    setModal((m) => ({ ...m, open: false }));
  }, []);

  const label = condition === "below" ? "below" : "above";
  const price = `$${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function handleCreate() {
    if (!user) {
      setModal({ open: true, status: "loading", title: "Signing you in…" });
      try {
        await signInWithGoogle({ surface: "stock_alert" });
        setModal({ open: false, status: "loading", title: "" });
      } catch {
        setModal({
          open: true,
          status: "error",
          title: "Sign in required",
          subtitle: "Sign in with Google to get email alerts.",
        });
        return;
      }
    }

    if (done) {
      setModal({
        open: true,
        status: "success",
        title: "Already on your list",
        subtitle: user?.email ? `We'll email ${user.email} when this triggers.` : undefined,
      });
      return;
    }

    setBusy(true);
    setModal({
      open: true,
      status: "loading",
      title: "Setting alert…",
      subtitle: user?.email ? `Saving to ${user.email}` : undefined,
    });

    const result = await createStockAlert({
      instrument_id: instrumentId,
      ticker,
      kind: "price_threshold",
      condition,
      target_price: targetPrice,
      directive_text: directiveText,
    });

    setBusy(false);

    if (!result.ok) {
      setModal({
        open: true,
        status: "error",
        title: "Could not set alert",
        subtitle: result.error,
      });
      return;
    }

    setDone(true);
    captureEvent("alert_set_clicked", {
      instrument_id: instrumentId,
      ticker,
      condition,
      target_price: targetPrice,
    });

    setModal({
      open: true,
      status: "success",
      title: result.alreadyExists ? "Already on your list" : "Alert set",
      subtitle: user?.email
        ? `We'll email ${user.email} when ${ticker} goes ${label} ${price}.`
        : `We'll email you when ${ticker} goes ${label} ${price}.`,
    });
  }

  if (done && variant === "link") {
    return (
      <>
        <DoneBadge compact />
        <AlertSetModal open={modal.open} status={modal.status} title={modal.title} subtitle={modal.subtitle} onClose={closeModal} />
      </>
    );
  }

  if (done) {
    return (
      <>
        <DoneBadge />
        <AlertSetModal open={modal.open} status={modal.status} title={modal.title} subtitle={modal.subtitle} onClose={closeModal} />
      </>
    );
  }

  const modalEl = (
    <AlertSetModal open={modal.open} status={modal.status} title={modal.title} subtitle={modal.subtitle} onClose={closeModal} />
  );

  if (variant === "zone") {
    return (
      <>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--signal-bullish)" }}
        >
          <span aria-hidden>🔔</span>
          {busy ? "Setting…" : "alert me at the zone"}
        </button>
        {modalEl}
      </>
    );
  }

  if (variant === "link") {
    return (
      <>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy}
          className="shrink-0 font-mono text-[12px] font-semibold disabled:opacity-50"
          style={{ color: "var(--signal-bullish)" }}
        >
          {busy ? "…" : linkLabel}
        </button>
        {modalEl}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium tracking-normal normal-case transition-colors hover:bg-surface-container disabled:opacity-50"
        style={{
          borderColor: "var(--outline-variant)",
          background: "var(--surface-container-low)",
          color: "var(--on-surface-variant)",
        }}
      >
        <span
          className="material-symbols-outlined flex items-center justify-center text-[13px] leading-none text-accent-terminal"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
        >
          notifications
        </span>
        {busy ? (
          "Setting…"
        ) : (
          <>
            Alert{" "}
            <span className="font-semibold tabular-nums text-on-surface">
              {label} {price}
            </span>
          </>
        )}
      </button>
      {modalEl}
    </>
  );
}
