"use client";

import { useState } from "react";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";

type Props = {
  ticker: string;
  instrumentId: string;
  condition: "below" | "above";
  targetPrice: number;
  directiveText: string;
};

export function AlertButton({ ticker, instrumentId, condition, targetPrice, directiveText }: Props) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const label = condition === "below" ? "below" : "above";
  const price = `$${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!user) return null;

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_id: instrumentId,
          ticker,
          condition,
          target_price: targetPrice,
          directive_text: directiveText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDone(true);
      captureEvent("alert_set_clicked", {
        instrument_id: instrumentId,
        ticker,
        condition,
        target_price: targetPrice,
      });
    } catch {
      setDone(false);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium tracking-normal normal-case"
        style={{
          borderColor: "color-mix(in srgb, var(--signal-bullish) 35%, var(--outline-variant))",
          background: "color-mix(in srgb, var(--signal-bullish) 10%, var(--surface-container-low))",
          color: "var(--signal-bullish)",
        }}
      >
        <span
          className="material-symbols-outlined flex items-center justify-center text-[13px] leading-none"
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
        >
          check_circle
        </span>
        Alert set
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
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
  );
}
