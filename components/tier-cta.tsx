"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

type Props = {
  tier: "ai_launch" | "ai_personal" | "free";
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked: boolean;
};

export function TierCTA({
  tier,
  ticker,
  instrumentId,
  isSubscribed,
  isTracked,
}: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localTracked, setLocalTracked] = useState(isTracked);

  if (loading) return null;

  if (tier === "ai_launch") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-3">
        <span className="text-[13px] font-medium text-[#065f46]">
          Covered by the free AI tier — full news-backed brief refreshes twice daily.
        </span>
        {user && isSubscribed && (
          <button
            type="button"
            disabled={pending}
            className="shrink-0 inline-flex items-center justify-center h-[32px] rounded-full border border-[#10b981] px-3 text-[12px] font-semibold text-[#065f46] hover:bg-white disabled:opacity-50 transition-colors"
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const method = localTracked ? "DELETE" : "POST";
                const res = await fetch("/api/track", {
                  method,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ instrument_id: instrumentId }),
                });
                if (!res.ok) {
                  setError(localTracked ? "Could not untrack — try again." : "Could not add — try again.");
                  return;
                }
                setLocalTracked(!localTracked);
                router.refresh();
              });
            }}
          >
            {pending
              ? localTracked
                ? "Removing…"
                : "Adding…"
              : localTracked
                ? "In your watchlist ✓"
                : "Add to watchlist"}
          </button>
        )}
      </div>
    );
  }

  if (tier === "ai_personal") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
        <span className="text-[13px] font-medium text-[#1e3a8a]">
          Tracked in your personal AI tier — refreshes with the twice-daily run.
        </span>
        <button
          type="button"
          disabled={pending}
          className="shrink-0 inline-flex items-center justify-center h-[32px] rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] font-semibold text-[#111111] hover:border-[#111111] transition-colors"
          onClick={() => {
            startTransition(async () => {
              setError(null);
              const res = await fetch("/api/track", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instrument_id: instrumentId }),
              });
              if (!res.ok) {
                setError("Could not untrack — try again.");
                return;
              }
              setLocalTracked(false);
              router.refresh();
            });
          }}
        >
          {pending ? "Untracking…" : "Untrack"}
        </button>
      </div>
    );
  }

  // Free tier — bigger CTA card
  if (!user) {
    return (
      <CtaCard
        title={`Want the full read on ${ticker}?`}
        body="Sign in to unlock the free AI tier — news-backed briefs on a curated set of launch stocks, refreshed twice daily. Subscribers can track any other stock in a personal AI tier."
        primary={{
          label: "Sign in with Google",
          onClick: async () => {
            try {
              const auth = getFirebaseAuth();
              const provider = new GoogleAuthProvider();
              provider.setCustomParameters({ prompt: "select_account" });
              await signInWithPopup(auth, provider);
              router.refresh();
            } catch {
              setError("Sign-in cancelled or failed.");
            }
          },
        }}
        error={error}
      />
    );
  }

  if (!isSubscribed) {
    return (
      <CtaCard
        title={`${ticker} is not on the free AI tier`}
        body="The free tier covers 15 launch stocks in each market. Subscribing lets you add this stock to your personal AI tier — we'll fetch its news, enrich it, and run a dedicated brief on every refresh. It's paid because each tracked stock costs real LLM spend per run."
        primary={{
          label: "Subscribe to track this stock",
          onClick: () => router.push("/subscribe"),
        }}
        error={error}
      />
    );
  }

  if (localTracked) {
    return (
      <CtaCard
        title={`${ticker} is in your personal AI tier`}
        body="The next twice-daily refresh will include a news-backed brief for this stock. Untrack to free up a slot in your personal tier."
        primary={{
          label: pending ? "Untracking…" : "Untrack",
          onClick: () => {
            startTransition(async () => {
              setError(null);
              const res = await fetch("/api/track", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instrument_id: instrumentId }),
              });
              if (!res.ok) {
                setError("Could not untrack — try again.");
                return;
              }
              setLocalTracked(false);
              router.refresh();
            });
          },
        }}
        error={error}
      />
    );
  }

  return (
    <CtaCard
      title={`Track ${ticker} in your personal AI tier`}
      body="We'll fetch its news, enrich each article, and run a dedicated LLM brief every refresh — alongside the rest of your tracked stocks. Your next watchlist synthesis will pick this up automatically."
      primary={{
        label: pending ? "Adding…" : "Track this stock",
        onClick: () => {
          startTransition(async () => {
            setError(null);
            const res = await fetch("/api/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ instrument_id: instrumentId }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              if (res.status === 409) {
                setError("You've hit the personal tier limit — untrack one first.");
              } else if (res.status === 403) {
                setError(data?.reason || "Subscription required.");
              } else {
                setError("Could not track — try again.");
              }
              return;
            }
            setLocalTracked(true);
            router.refresh();
          });
        },
      }}
      error={error}
    />
  );
}

type CtaCardProps = {
  title: string;
  body: string;
  primary: { label: string; onClick: () => void | Promise<void> };
  error?: string | null;
};

function CtaCard({ title, body, primary, error }: CtaCardProps) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em]">{title}</h3>
          <p className="mt-1 text-[13px] text-[#6b7280] leading-relaxed">{body}</p>
        </div>
        <button
          type="button"
          onClick={() => primary.onClick()}
          className="shrink-0 inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
        >
          {primary.label}
        </button>
      </div>
      {error && <p className="mt-3 text-[12px] font-medium text-[#ef4444]">{error}</p>}
    </div>
  );
}
