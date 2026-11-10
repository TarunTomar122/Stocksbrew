"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";
import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { RadarFreeLimitModal } from "@/components/radar-free-limit-modal";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";
import { trackLimitHit, trackStockTrackClicked } from "@/lib/product-analytics";

type Variant = "pill" | "compact" | "icon";
type PositionType = "watchlist" | "holding";

function RadarTrackIcon({ tracked, size = 18 }: { tracked: boolean; size?: number }) {
  if (tracked) {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="currentColor" />
        <path
          d="M6.5 10.5 9 13l4.5-5.5"
          stroke="white"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.5v7M6.5 10h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  ticker: string;
  instrumentId: string;
  isTracked: boolean;
  /** Optional - affects the button label only. When omitted we show a generic
   * "Add to Radar" label and let the API decide if the user can add this stock. */
  tier?: "ai_launch" | "ai_personal" | "free";
  isSubscribed?: boolean;
  /** When set with isSubscribed=false, block adds once the free tier is full. */
  trackedCount?: number;
  variant?: Variant;
  /** When tracked, render a static label instead of a button (no accidental remove). */
  trackedAsBadge?: boolean;
  /** Optional copy for a signed-in stock that is not tracked yet. */
  untrackedLabel?: string;
  /** Optional copy before sign-in, used when the click starts a specific flow. */
  signedOutLabel?: string;
  /** Render nothing once tracked, pair with a hideWhenUntracked instance elsewhere for the swap. */
  hideWhenTracked?: boolean;
  /** Render nothing until tracked, pair with a hideWhenTracked instance elsewhere for the swap. */
  hideWhenUntracked?: boolean;
  /** Use the primary brand color for the untracked fill button instead of the default black. */
  accent?: boolean;
};

// Single source of truth for the radar / sign-in / subscribe flow used by every
// "Add to Radar" surface. Server pages compute tier + subscribed + isTracked
// once and pass them through; this component handles the click-time state.
export function TrackButton({
  ticker,
  instrumentId,
  isSubscribed,
  isTracked,
  trackedCount,
  variant = "pill",
  trackedAsBadge = false,
  untrackedLabel,
  signedOutLabel,
  hideWhenTracked = false,
  hideWhenUntracked = false,
  accent = false,
}: Props) {
  const router = useRouter();
  const { user, loading } = useUser();
  const [pending, startTransition] = useTransition();
  const [pendingOp, setPendingOp] = useState<"add" | "remove" | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [localTracked, setLocalTracked] = useState(isTracked);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [positionType, setPositionType] = useState<PositionType>("watchlist");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");
  const [limitModalOpen, setLimitModalOpen] = useState(false);

  const freeLimit = FREE_RADAR_TRACK_LIMIT;
  const atFreeLimit =
    !isSubscribed &&
    !localTracked &&
    typeof trackedCount === "number" &&
    Number.isFinite(freeLimit) &&
    trackedCount >= freeLimit;

  function showFreeLimitModal() {
    setOpen(false);
    setLimitModalOpen(true);
    trackLimitHit({ feature: "tracked_stocks", plan: isSubscribed ? "pro" : "free", limit: freeLimit, code: "free_tier_limit_reached" });
  }

  async function triggerBackgroundRefresh(action: "add" | "remove", count = 1) {
    if (action === "add") {
      dispatchRadarTrackChanged({ action: "add", count });
    }
    await flushWatchlistRebuild(router, 0);
  }

  useEffect(() => {
    setLocalTracked(isTracked);
  }, [isTracked]);

  async function onPrimaryClick() {
    setError(null);

    if (!localTracked) {
      trackStockTrackClicked({
        ticker,
        signed_in: Boolean(user),
        surface: variant === "icon" ? "icon" : "button",
      });
    }

    // Sign in, sync the server session, then resume the exact add flow.
    if (!user) {
      if (signingIn) return;
      setSigningIn(true);
      try {
        await signInWithGoogle({ surface: "radar_track" });
        setPositionType("watchlist");
        setOpen(true);
      } catch (err) {
        console.error(err);
        setError("Could not sign in. Please try again.");
      } finally {
        setSigningIn(false);
      }
      return;
    }

    // Already in radar → toggle off without modal.
    if (localTracked) {
      setPendingOp("remove");
      setModalTitle(`Stopping tracking for ${ticker}`);
      setModalStatus("loading");
      setModalOpen(true);
      startTransition(async () => {
        try {
          const res = await fetch("/api/track", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instrument_id: instrumentId }),
          });
          if (!res.ok) {
            setError("Could not remove - try again.");
            setModalStatus("error");
            setTimeout(() => setModalOpen(false), 4000);
            return;
          }
          setLocalTracked(false);
          setModalStatus("success");
          await triggerBackgroundRefresh("remove");
        } finally {
          setPendingOp(null);
          setTimeout(() => setModalOpen(false), 900);
        }
      });
      return;
    }

    if (atFreeLimit) {
      showFreeLimitModal();
      return;
    }

    // Otherwise open the picker modal (Watching by default).
    setPositionType("watchlist");
    setOpen(true);
  }

  const handleModalCancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  function confirmTrack() {
    setError(null);
    setPendingOp("add");
    setModalTitle(
      positionType === "holding"
        ? `Adding ${ticker} to Holdings`
        : `Adding ${ticker} to Watching`,
    );
    setModalOpen(true);
    setModalStatus("loading");
    startTransition(async () => {
      try {
        const res = await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instrument_id: instrumentId,
            position_type: positionType,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            if (data?.error === "free_tier_limit_reached") {
              setModalOpen(false);
              showFreeLimitModal();
              return;
            }
            trackLimitHit({ feature: "covered_stocks", plan: isSubscribed ? "pro" : "free", code: typeof data?.error === "string" ? data.error : "conflict" });
            setError(
              data?.error === "swap_limit_reached" && typeof data?.reason === "string"
                ? data.reason
                : "You are following all the stocks your plan covers. Remove one, or go Pro to follow every stock you hold.",
            );
          } else {
            setError("Could not add - try again.");
          }
          setModalStatus("error");
          setTimeout(() => setModalOpen(false), 1200);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { first_stock?: boolean };
        setLocalTracked(true);
        setModalStatus("success");
        setOpen(false);
        await triggerBackgroundRefresh("add");
        if (data.first_stock) {
          // The first add is the activation moment. Show the user the Radar
          // they just created instead of leaving them on the acquisition page.
          window.location.assign("/watchlist");
        }
      } finally {
        setPendingOp(null);
        setTimeout(() => setModalOpen(false), 900);
      }
    });
  }

  if (loading) {
    if (variant === "icon") {
      return <span className="inline-block h-5 w-5" aria-hidden />;
    }
    return null;
  }

  if ((hideWhenTracked && localTracked) || (hideWhenUntracked && !localTracked)) {
    return null;
  }

  const trackedPillClass =
    variant === "compact"
      ? "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-on-surface bg-surface px-3 text-[11px] font-semibold tracking-tight text-on-surface"
      : "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-on-surface bg-surface px-4 text-[13px] font-semibold tracking-tight text-on-surface";

  if (trackedAsBadge && localTracked && user) {
    if (variant === "icon") {
      return (
        <span
          className="shrink-0 text-[#0052ff]"
          aria-label={`${ticker} is in your Watchlist`}
          title="In your Watchlist"
        >
          <RadarTrackIcon tracked />
        </span>
      );
    }
    return (
      <span className={trackedPillClass} aria-label={`${ticker} is in your Watchlist`}>
        In Watchlist ✓
      </span>
    );
  }

  const label = !user
    ? signingIn
      ? "Signing in..."
      : signedOutLabel ?? (variant === "compact" ? "Add to Watchlist" : "Sign in to add to Watchlist")
    : pendingOp === "remove"
        ? "Removing…"
        : pendingOp === "add"
          ? "Adding…"
          : localTracked
            ? "In Watchlist ✓"
            : untrackedLabel ?? (variant === "compact" ? "Add to Watchlist" : `Add ${ticker} to Watchlist`);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onMouseDown={(e) => {
            // Search dropdown listens on document mousedown and can unmount this
            // row before the modal interaction completes.
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={onPrimaryClick}
          disabled={pending || signingIn}
          aria-label={localTracked ? `Remove ${ticker} from Watchlist` : `Add ${ticker} to Watchlist`}
          className={`shrink-0 transition-colors disabled:opacity-50 ${
            localTracked
              ? "text-[#0052ff]"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          title={label}
        >
          <span className="t-icon-swap" data-state={localTracked ? "b" : "a"} aria-hidden>
            <span className="t-icon" data-icon="a">
              <svg width={18} height={18} viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="t-icon" data-icon="b">
              <svg width={18} height={18} viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="currentColor" />
                <path d="M6.5 10.5 9 13l4.5-5.5" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onPrimaryClick}
            disabled={pending || signingIn}
            className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-tight transition-transform disabled:opacity-60 ${
              variant === "compact" ? "h-8 px-3 text-[11px]" : "h-[40px] px-4 text-[13px]"
            } ${
              localTracked
                ? "bg-surface text-on-surface border border-on-surface hover:-translate-y-[1px] active:translate-y-0"
                : accent
                  ? "bg-primary text-on-primary hover:-translate-y-[1px] active:translate-y-0"
                  : "bg-on-surface text-surface hover:-translate-y-[1px] active:translate-y-0"
            }`}
          >
            {label}
          </button>
          {error && !open && (
            <span className="text-[11px] font-medium text-[#ef4444]">{error}</span>
          )}
        </div>
      )}

      {open && (
        <TrackModal
          ticker={ticker}
          positionType={positionType}
          onSelect={setPositionType}
          onCancel={handleModalCancel}
          onConfirm={confirmTrack}
          pending={pending}
          error={error}
        />
      )}
      <RadarAsyncModal
        open={modalOpen}
        title={modalTitle}
        subtitle="Saved. We’re refreshing its research now."
        status={modalStatus}
      />
      <RadarFreeLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} limit={freeLimit} />
    </>
  );
}

function TrackModal({
  ticker,
  positionType,
  onSelect,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  ticker: string;
  positionType: PositionType;
  onSelect: (p: PositionType) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  // ESC to dismiss. Lock scroll without breaking `position: sticky` - plain
  // `overflow: hidden` on body removes the scrollbar and confuses sticky tabs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);

    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [onCancel]);

  const modal = (
    <div
      data-track-modal-root="true"
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm"
      />
      <div className="relative z-[1] w-full max-w-[420px] rounded-3xl bg-surface p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">
            Your watchlist
          </span>
          <h2 id="track-modal-title" className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">
            Add {ticker} to Watchlist
          </h2>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">
            Tell stocksbrew how to monitor this stock. You can move it later.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <PositionOption
            label="Watching"
            sublabel="Watching for entry"
            icon="visibility"
            active={positionType === "watchlist"}
            onClick={() => onSelect("watchlist")}
          />
          <PositionOption
            label="Holding"
            sublabel="Money on the line"
            icon="account_balance_wallet"
            active={positionType === "holding"}
            onClick={() => onSelect("holding")}
          />
        </div>

        {error && (
          <p className="mt-4 text-[12px] font-medium text-[#ef4444]">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center justify-center h-[40px] px-4 rounded-full border border-outline-variant bg-surface text-[13px] font-semibold text-on-surface hover:border-on-surface disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-on-surface text-surface text-[13px] font-semibold disabled:opacity-60 transition-transform hover:-translate-y-[1px] active:translate-y-0"
          >
            {pending ? "Adding…" : "Add to Watchlist"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function PositionOption({
  label,
  sublabel,
  icon,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all ${
        active
          ? "border-on-surface bg-surface-container-low"
          : "border-outline-variant bg-surface hover:border-outline"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          active ? "bg-on-surface text-surface" : "bg-surface-container text-on-surface-variant"
        }`}
      >
        <AnimatedIcon name={icon} size={18} />
      </span>
      <span className="flex flex-col">
        <span className="text-[14px] font-semibold text-on-surface">{label}</span>
        <span className="text-[11px] text-on-surface-variant">{sublabel}</span>
      </span>
    </button>
  );
}
