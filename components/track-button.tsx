"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { captureEvent } from "@/lib/posthog";
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";
import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { RadarFreeLimitModal } from "@/components/radar-free-limit-modal";
import { FREE_RADAR_TRACK_LIMIT } from "@/lib/pro-features";

type Variant = "pill" | "icon";
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
};

// Single source of truth for the radar / sign-in / subscribe flow used by every
// "Add to Radar" surface. Server pages compute tier + subscribed + isTracked
// once and pass them through; this component handles the click-time state.
export function TrackButton({
  ticker,
  instrumentId,
  tier,
  isSubscribed,
  isTracked,
  trackedCount,
  variant = "pill",
  trackedAsBadge = false,
}: Props) {
  const router = useRouter();
  const { user, loading } = useUser();
  const [pending, startTransition] = useTransition();
  const [pendingOp, setPendingOp] = useState<"add" | "remove" | null>(null);
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
    trackedCount >= freeLimit;

  function showFreeLimitModal() {
    setOpen(false);
    setLimitModalOpen(true);
    captureEvent("radar_free_limit_blocked", {
      ticker,
      instrument_id: instrumentId,
      tracked_count: trackedCount ?? null,
      limit: freeLimit,
    });
  }

  function triggerBackgroundRefresh(action: "add" | "remove", count = 1) {
    if (action === "add") {
      dispatchRadarTrackChanged({ action: "add", count });
    }
    flushWatchlistRebuild(router, 0);
  }

  useEffect(() => {
    setLocalTracked(isTracked);
  }, [isTracked]);

  function onPrimaryClick() {
    setError(null);

    // Not signed in → open Google sign-in popup.
    if (!user) {
      signInWithGoogle({ surface: "radar_track" })
        .then(() => {
          captureEvent("radar_signin_succeeded", {
            ticker,
            instrument_id: instrumentId,
            tier: tier ?? null,
            subscribed: Boolean(isSubscribed),
          });
        })
        .catch((err) => {
          console.error(err);
          captureEvent("radar_signin_failed", {
            ticker,
            instrument_id: instrumentId,
            tier: tier ?? null,
            subscribed: Boolean(isSubscribed),
            error: err instanceof Error ? err.message : "unknown",
          });
        });
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
            setTimeout(() => setModalOpen(false), 1200);
            return;
          }
          setLocalTracked(false);
          setModalStatus("success");
          captureEvent("radar_remove_clicked", { instrument_id: instrumentId, ticker });
          triggerBackgroundRefresh("remove");
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
            setError("Your Radar is full. Remove one, or go Pro to track every stock you hold.");
          } else {
            setError("Could not add - try again.");
          }
          setModalStatus("error");
          setTimeout(() => setModalOpen(false), 1200);
          return;
        }
        setLocalTracked(true);
        setModalStatus("success");
        captureEvent("radar_add_clicked", {
          instrument_id: instrumentId,
          ticker,
          position_type: positionType,
        });
        setOpen(false);
        triggerBackgroundRefresh("add");
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

  const trackedPillClass =
    "inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-on-surface bg-surface px-4 text-[13px] font-semibold tracking-tight text-on-surface";

  if (trackedAsBadge && localTracked && user) {
    if (variant === "icon") {
      return (
        <span
          className="shrink-0 text-[#0052ff]"
          aria-label={`${ticker} is on your Radar`}
          title="On your Radar"
        >
          <RadarTrackIcon tracked />
        </span>
      );
    }
    return (
      <span className={trackedPillClass} aria-label={`${ticker} is on your Radar`}>
        In Radar ✓
      </span>
    );
  }

  const label = !user
    ? "Sign in to add"
    : pendingOp === "remove"
        ? "Removing…"
        : pendingOp === "add"
          ? "Adding…"
          : localTracked
            ? "In Radar ✓"
            : `Add ${ticker} to Radar`;

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
          disabled={pending}
          aria-label={localTracked ? `Remove ${ticker} from Radar` : `Add ${ticker} to Radar`}
          className={`shrink-0 transition-colors disabled:opacity-50 ${
            localTracked
              ? "text-[#0052ff]"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          title={label}
        >
          <RadarTrackIcon tracked={localTracked} />
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onPrimaryClick}
            disabled={pending}
            className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap h-[40px] px-4 rounded-full text-[13px] font-semibold tracking-tight transition-transform disabled:opacity-60 ${
              localTracked
                ? "bg-surface text-on-surface border border-on-surface hover:-translate-y-[1px] active:translate-y-0"
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
        subtitle="Saved. Radar analysis is refreshing in the background..."
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
            Personal radar
          </span>
          <h2 id="track-modal-title" className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">
            Add {ticker} to Radar
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
            {pending ? "Adding…" : "OK"}
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
