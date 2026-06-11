"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase-client";
import {
  SUPPORT_EMAIL,
  syncReasonMessage,
  type SyncReason,
} from "@/lib/subscription-recovery-copy";
import { trackSubscriptionConverted } from "@/lib/product-analytics";

type SyncResult = {
  subscribed: boolean;
  reason?: SyncReason;
};

type Props = {
  subscriptionId?: string | null;
  status?: string | null;
  isSubscribed: boolean;
  /** Poll after checkout return until Pro is active. */
  autoActivate?: boolean;
  compact?: boolean;
};

async function callSync(subscriptionId?: string | null): Promise<SyncResult> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return { subscribed: false, reason: "no_subscription_id" };
  const idToken = await user.getIdToken();
  const res = await fetch("/api/subscription/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      subscriptionId: subscriptionId ?? undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as SyncResult;
  return {
    subscribed: Boolean(json.subscribed),
    reason: json.reason,
  };
}

export function SubscriptionActivator({
  subscriptionId,
  status,
  isSubscribed,
  autoActivate = false,
  compact = false,
}: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ranRef = useRef(false);

  const shouldTry =
    autoActivate &&
    !isSubscribed &&
    Boolean(subscriptionId) &&
    (status === "active" || status === "succeeded" || !status);

  useEffect(() => {
    if (!shouldTry || ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    let attempts = 0;

    const run = async () => {
      setSyncing(true);
      while (!cancelled && attempts < 8) {
        attempts += 1;
        const result = await callSync(subscriptionId).catch(() => ({
          subscribed: false,
          reason: "dodo_lookup_failed" as const,
        }));
        if (result.subscribed) {
          trackSubscriptionConverted({
            subscription_id: subscriptionId ?? null,
            source: "activator_sync",
          });
          router.refresh();
          return;
        }
        if (result.reason === "processing" || result.reason === "pending") {
          setMessage(syncReasonMessage(result.reason));
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) {
        setMessage(
          "Payment received. If Pro is not active yet, tap Refresh below or email support.",
        );
      }
      setSyncing(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [shouldTry, subscriptionId, status, router]);

  if (isSubscribed) return null;

  async function refresh() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await callSync(subscriptionId);
      if (result.subscribed) {
        trackSubscriptionConverted({
          subscription_id: subscriptionId ?? null,
          source: "activator_sync",
        });
        router.refresh();
      } else {
        setMessage(syncReasonMessage(result.reason));
      }
    } finally {
      setSyncing(false);
    }
  }

  const supportHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Pro subscription help")}`;

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void refresh()}
          className="self-start text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {syncing ? "Checking…" : "Refresh subscription status"}
        </button>
        {message && (
          <p className="text-[12px] text-on-surface-variant leading-snug">{message}</p>
        )}
        {message && (
          <Link
            href={supportHref}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            Email support
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {syncing && (
        <p className="text-[13px] text-[#6b7280]">Activating Pro on your account…</p>
      )}
      {message && (
        <p className="text-[13px] text-[#6b7280] text-center max-w-sm">{message}</p>
      )}
      <button
        type="button"
        disabled={syncing}
        onClick={() => void refresh()}
        className="text-[13px] font-semibold text-[#0052ff] hover:underline disabled:opacity-50"
      >
        Refresh subscription status
      </button>
      {message && (
        <Link
          href={supportHref}
          className="text-[13px] font-semibold text-[#0052ff] hover:underline"
        >
          Email support
        </Link>
      )}
    </div>
  );
}
