"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useMemo, useState } from "react";
import { trackCheckoutReturned } from "@/lib/product-analytics";
import { ProWelcomePanel } from "@/components/pro-welcome-panel";

type Props = {
  open: boolean;
  subscriptionId?: string;
};

export function SubscriptionSuccessModal({ open, subscriptionId }: Props) {
  const [visible, setVisible] = useState(false);
  const storageKey = useMemo(
    () => `tikrr_subscribe_success_seen:${subscriptionId ?? "latest"}`,
    [subscriptionId],
  );

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Session storage may be unavailable; still show the modal once.
    }
    trackCheckoutReturned({
      subscription_id: subscriptionId ?? null,
      source: "success_modal",
    });
    setVisible(true);
  }, [open, storageKey, subscriptionId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-8 overflow-y-auto">
      <div className="relative my-auto w-full max-w-[680px] rounded-3xl border border-[var(--oa-border)] bg-oa-card p-6 md:p-7 shadow-[0_30px_90px_rgba(17,24,39,0.30)]">
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--oa-border)] text-[var(--oa-muted-fg)] hover:bg-[#f8f9fa]"
          aria-label="Close welcome modal"
        >
          <AnimatedIcon name="close" size={18} className="text-[18px]" />
        </button>
        <ProWelcomePanel variant="modal" onDismiss={() => setVisible(false)} />
      </div>
    </div>
  );
}
