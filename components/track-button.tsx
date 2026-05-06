"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { posthog } from "@/lib/posthog";

type Variant = "pill" | "icon";
type PositionType = "watchlist" | "holding";

type Props = {
  ticker: string;
  instrumentId: string;
  isTracked: boolean;
  /** Optional — affects the button label only. When omitted we show a generic
   * "Add to Radar" label and let the API decide if the user can add this stock. */
  tier?: "ai_launch" | "ai_personal" | "free";
  isSubscribed?: boolean;
  variant?: Variant;
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
  variant = "pill",
}: Props) {
  const router = useRouter();
  const { user, loading } = useUser();
  const [pending, startTransition] = useTransition();
  const [pendingOp, setPendingOp] = useState<"add" | "remove" | null>(null);
  const [localTracked, setLocalTracked] = useState(isTracked);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [positionType, setPositionType] = useState<PositionType>("watchlist");

  useEffect(() => {
    setLocalTracked(isTracked);
  }, [isTracked]);

  function onPrimaryClick() {
    setError(null);

    // Not signed in → open Google sign-in popup.
    if (!user) {
      signInWithGoogle().catch(console.error);
      return;
    }

    // Already in radar → toggle off without modal.
    if (localTracked) {
      setPendingOp("remove");
      startTransition(async () => {
        try {
          const res = await fetch("/api/track", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instrument_id: instrumentId }),
          });
          if (!res.ok) {
            setError("Could not remove — try again.");
            return;
          }
          setLocalTracked(false);
          posthog.capture("radar_remove_clicked", { instrument_id: instrumentId, ticker });
          router.refresh();
        } finally {
          setPendingOp(null);
        }
      });
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
          if (res.status === 403) {
            setOpen(false);
            router.push("/subscribe");
            return;
          }
          if (res.status === 409) {
            setError("Personal radar is full — remove one first.");
          } else {
            setError("Could not add — try again.");
          }
          return;
        }
        setLocalTracked(true);
        posthog.capture("radar_add_clicked", {
          instrument_id: instrumentId,
          ticker,
          position_type: positionType,
        });
        setOpen(false);
        router.refresh();
      } finally {
        setPendingOp(null);
      }
    });
  }

  const canTrackOrUntrack =
    !!user && (tier === "ai_launch" || tier === "ai_personal" || isSubscribed);

  if (loading) {
    if (variant === "icon") {
      return <span className="inline-block h-5 w-5" aria-hidden />;
    }
    return null;
  }

  const label = !user
    ? "Sign in to add"
    : !canTrackOrUntrack
      ? "Subscribe to add"
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
          onClick={onPrimaryClick}
          disabled={pending}
          aria-label={localTracked ? `Remove ${ticker} from Radar` : `Add ${ticker} to Radar`}
          className={`shrink-0 transition-colors disabled:opacity-50 ${
            localTracked
              ? "text-[#0052ff]"
              : "text-[#9ca3af] hover:text-[#111111]"
          }`}
          title={label}
        >
          <svg
            width="18"
            height="20"
            viewBox="0 0 16 18"
            fill={localTracked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2 1.5h12v15l-6-4-6 4v-15z" />
          </svg>
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onPrimaryClick}
            disabled={pending}
            className={`inline-flex items-center justify-center h-[40px] px-4 rounded-full text-[13px] font-semibold tracking-tight transition-transform disabled:opacity-60 ${
              localTracked
                ? "bg-white text-[#111111] border border-[#111111] hover:-translate-y-[1px] active:translate-y-0"
                : "bg-[#111111] text-white hover:-translate-y-[1px] active:translate-y-0"
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
  // ESC to dismiss. Lock scroll without breaking `position: sticky` — plain
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
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-[#111111]/50 backdrop-blur-sm"
      />
      <div className="relative z-[1] w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
            Personal radar
          </span>
          <h2 id="track-modal-title" className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">
            Add {ticker} to Radar
          </h2>
          <p className="text-[13px] text-[#6b7280] leading-relaxed">
            Tell Tikrr how to monitor this stock. You can move it later.
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
            className="inline-flex items-center justify-center h-[40px] px-4 rounded-full border border-[#e5e7eb] bg-white text-[13px] font-semibold text-[#111111] hover:border-[#111111] disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold disabled:opacity-60 transition-transform hover:-translate-y-[1px] active:translate-y-0"
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
          ? "border-[#111111] bg-[#fafafa]"
          : "border-[#e5e7eb] bg-white hover:border-[#9ca3af]"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          active ? "bg-[#111111] text-white" : "bg-[#f3f4f6] text-[#6b7280]"
        }`}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 18, fontVariationSettings: "'wght' 600" }}
        >
          {icon}
        </span>
      </span>
      <span className="flex flex-col">
        <span className="text-[14px] font-semibold text-[#111111]">{label}</span>
        <span className="text-[11px] text-[#6b7280]">{sublabel}</span>
      </span>
    </button>
  );
}
