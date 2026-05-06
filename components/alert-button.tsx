"use client";

import { useState } from "react";
import { useUser } from "@/lib/auth-context";
import { posthog } from "@/lib/posthog";

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
  const price = `$${targetPrice.toFixed(2)}`;

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
      posthog.capture("alert_set_clicked", {
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
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#10b981]">
        <span className="material-symbols-outlined text-[14px] leading-none flex items-center justify-center" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>check_circle</span>
        Alert set
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0052ff] hover:text-[#003dcc] disabled:opacity-50 transition-colors"
    >
      <span className="material-symbols-outlined text-[16px] leading-none flex items-center justify-center" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>notifications</span>
      {busy ? "Setting…" : `Set alert ${label} ${price}`}
    </button>
  );
}
