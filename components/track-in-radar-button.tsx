"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { flushWatchlistRebuild, scheduleWatchlistRebuild } from "@/lib/radar-client-refresh";
import { captureEvent } from "@/lib/posthog";

type Props = {
  /** instrument_ids like ["US_NVDA", "US_META"] */
  instrumentIds: string[];
  /** Whether to add as a holding (portfolio) or watchlist entry. Defaults to "watchlist". */
  positionType?: "holding" | "watchlist";
  /** Label override */
  label?: string;
  className?: string;
};

type Result = {
  added: string[];
  skipped: string[];
  limitReached: boolean;
  limitAt: number;
};

async function syncServerSession(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  if (!u) return;
  const idToken = await u.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

async function trackAll(ids: string[], positionType: "holding" | "watchlist"): Promise<Result> {
  // Fire all track requests in parallel — each skips its own rebuild.
  const settlements = await Promise.allSettled(
    ids.map((instrumentId) =>
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_id: instrumentId,
          position_type: positionType,
          skip_refresh: true,
        }),
      }),
    ),
  );

  const added: string[] = [];
  const skipped: string[] = [];
  let limitReached = false;
  let limitAt = 3;

  for (let i = 0; i < ids.length; i++) {
    const settlement = settlements[i];
    const instrumentId = ids[i];
    if (settlement.status === "rejected") {
      skipped.push(instrumentId);
      continue;
    }
    const res = settlement.value;
    if (res.ok) {
      added.push(instrumentId);
    } else {
      const data = await res.json().catch(() => ({}));
      if (data?.error === "free_tier_limit_reached") {
        limitReached = true;
        limitAt = data?.limit ?? 3;
      }
      skipped.push(instrumentId);
    }
  }

  // Trigger a single rebuild after all writes are done.
  if (added.length > 0) {
    scheduleWatchlistRebuild(0);
  }

  return { added, skipped, limitReached, limitAt };
}

export function TrackInRadarButton({ instrumentIds, positionType = "watchlist", label, className = "" }: Props) {
  const { user, initialAuthed } = useUser();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "partial">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");

  const isLoading = !initialAuthed; // still checking auth

  async function handleClick() {
    if (state === "done") {
      router.push("/watchlist");
      return;
    }

    captureEvent("radar_bulk_add_clicked", {
      count: instrumentIds.length,
      position_type: positionType,
      authenticated: Boolean(user),
    });
    setState("busy");
    setModalStatus("loading");
    setModalOpen(true);

    // Not signed in — sign in first, then track
    if (!user) {
      try {
        await signInWithGoogle({ surface: "radar_bulk" });
        captureEvent("radar_bulk_signin_succeeded", {
          count: instrumentIds.length,
          position_type: positionType,
        });
        await syncServerSession();
        // Small delay to let the session settle
        await new Promise((r) => setTimeout(r, 800));
      } catch (err) {
        captureEvent("radar_bulk_signin_failed", {
          count: instrumentIds.length,
          position_type: positionType,
          error: err instanceof Error ? err.message : "unknown",
        });
        setState("idle");
        setModalStatus("error");
        setTimeout(() => setModalOpen(false), 1200);
        return;
      }
    }

    const r = await trackAll(instrumentIds, positionType);
    setResult(r);
    setState(r.limitReached ? "partial" : "done");
    setModalStatus(r.added.length > 0 ? "success" : "error");
    captureEvent(r.added.length > 0 ? "radar_bulk_add_succeeded" : "radar_bulk_add_failed", {
      count: instrumentIds.length,
      added: r.added.length,
      skipped: r.skipped.length,
      limit_reached: r.limitReached,
      limit_at: r.limitAt,
      position_type: positionType,
      authenticated: Boolean(user),
    });
    if (r.limitReached) {
      captureEvent("radar_bulk_limit_reached", {
        count: instrumentIds.length,
        added: r.added.length,
        skipped: r.skipped.length,
        limit_at: r.limitAt,
        position_type: positionType,
      });
    }
    setTimeout(() => setModalOpen(false), 900);
    if (!r.limitReached) {
      // Hard redirect after short delay
      setTimeout(() => {
        flushWatchlistRebuild(router, 0);
        router.push("/watchlist");
      }, 1200);
    }
  }

  if (isLoading) return null;

  // ── Done — all added ──
  if (state === "done") {
    return (
      <>
        <button
          onClick={handleClick}
          className={`inline-flex items-center gap-2 h-11 rounded-full bg-[#10b981] px-6 text-[13px] font-semibold text-white transition-colors ${className}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7l3 3 6-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Added to Radar. Open it →
        </button>
        <RadarAsyncModal open={modalOpen} title="Adding stocks to Radar" subtitle="Saved. Radar analysis is refreshing in the background..." status={modalStatus} />
      </>
    );
  }

  // ── Partial — hit free tier limit ──
  if (state === "partial" && result) {
    const addedCount = result.added.length;
    return (
      <>
        <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 flex items-start gap-2.5">
          <span className="text-[15px] mt-0.5">⚡</span>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-semibold text-[#92400e]">
              {addedCount} stock{addedCount !== 1 ? "s" : ""} added to Radar
            </p>
            <p className="text-[12px] text-[#b45309] leading-relaxed">
              Free Radar tracks up to {result.limitAt} stocks. Upgrade to Pro to add your full portfolio. {result.skipped.length} more waiting.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <a
                href="/subscribe"
                className="inline-flex items-center h-8 rounded-full bg-[#111111] px-4 text-[12px] font-semibold text-white hover:bg-black transition-colors"
              >
                Upgrade to Pro
              </a>
              <button
                onClick={() => router.push("/watchlist")}
                className="text-[12px] font-medium text-[#6b7280] hover:text-[#111111] transition-colors"
              >
                Open Radar →
              </button>
            </div>
          </div>
        </div>
        </div>
        <RadarAsyncModal open={modalOpen} title="Adding stocks to Radar" subtitle="Saved. Radar analysis is refreshing in the background..." status={modalStatus} />
      </>
    );
  }

  const buttonLabel = (() => {
    if (state === "busy") return "Adding to Radar…";
    if (!user) return label ?? `Sign in & track ${instrumentIds.length} stock${instrumentIds.length !== 1 ? "s" : ""} in Radar`;
    return label ?? `Track ${instrumentIds.length} stock${instrumentIds.length !== 1 ? "s" : ""} in your Radar`;
  })();

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "busy"}
        className={`inline-flex items-center justify-center gap-2 h-11 rounded-full bg-[#111111] px-6 text-[13px] font-semibold text-white hover:bg-black active:scale-[0.98] transition-all disabled:opacity-60 ${className}`}
      >
        {state === "busy" ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.4"/>
            <path d="M7 4.5v5M4.5 7h5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        )}
        {buttonLabel}
      </button>
      <RadarAsyncModal open={modalOpen} title="Adding stocks to Radar" subtitle="Saved. Radar analysis is refreshing in the background..." status={modalStatus} />
    </>
  );
}
