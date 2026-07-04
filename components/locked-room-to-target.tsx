"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";

const RAIL_KICKER = "font-mono text-[11px] uppercase tracking-[0.13em] text-on-surface-variant";

function RedactedLine({ width = "72%" }: { width?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[0.92em] max-w-full rounded-md align-[-0.08em]"
      style={{
        width,
        background: "color-mix(in srgb, var(--on-surface) 14%, var(--surface-container-high))",
      }}
    />
  );
}

export function LockedRoomToTarget({
  ticker,
  currentPriceLabel,
  analystCount,
  ratingTotal,
}: {
  ticker: string;
  currentPriceLabel: string;
  analystCount?: number | null;
  ratingTotal: number;
}) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    trackPaywallShown({ surface: "locked_room_to_target", ticker, signedIn: Boolean(user) });
  }, [loading, user, ticker]);

  if (loading) return null;

  const signedIn = Boolean(user);
  const count = analystCount ?? ratingTotal;
  const teaser = signedIn
    ? count > 0
      ? `${count} analyst${count === 1 ? "" : "s"} cover ${ticker} — Pro unlocks consensus target and upside.`
      : `Pro unlocks analyst target and upside on ${ticker}.`
    : count > 0
      ? `${count} analyst${count === 1 ? "" : "s"} cover ${ticker} — sign in to see consensus target and upside.`
      : `Sign in to see analyst target and upside on ${ticker}.`;

  const cta = !signedIn
    ? {
        label: "Sign in free",
        onClick: async () => {
          trackPaywallUnlockClicked({ surface: "locked_room_to_target", ticker, signedIn: false });
          try {
            await signInWithGoogle({ surface: "locked_room_to_target" });
            router.refresh();
          } catch {
            setError("Sign-in cancelled or failed.");
          }
        },
      }
    : {
        label: "Get Pro",
        onClick: () => {
          trackPaywallUnlockClicked({ surface: "locked_room_to_target", ticker, signedIn: true });
          router.push("/subscribe");
        },
      };

  return (
    <>
      <p className={`${RAIL_KICKER} mb-2`}>room to target</p>
      {count > 0 && (
        <p className="text-[13px] text-on-surface-variant">
          {count} analysts · <RedactedLine width="4.5rem" />
        </p>
      )}

      <div className="mt-2 flex items-end gap-2">
        <div>
          <p className="font-mono text-[10px] text-on-surface-variant">now</p>
          <p className="text-[18px] font-extrabold tabular-nums text-on-surface">{currentPriceLabel}</p>
        </div>
        <div className="flex-1 pb-1">
          <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" aria-hidden>
            <span
              className="block h-full w-[58%] rounded-full opacity-45"
              style={{
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--signal-bullish) 20%, transparent), color-mix(in srgb, var(--signal-bullish) 45%, transparent))",
              }}
            />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] text-on-surface-variant">target</p>
          <p className="text-[18px] font-extrabold tabular-nums">
            <RedactedLine width="5.5rem" />
          </p>
        </div>
      </div>

      <p className="mt-1.5 text-center text-[13px] font-semibold" aria-hidden>
        <RedactedLine width="6rem" />
      </p>

      <div
        className="mt-3 rounded-lg border px-3 py-2.5"
        style={{
          borderColor: "color-mix(in srgb, var(--accent-terminal) 18%, var(--outline-variant))",
          background: "color-mix(in srgb, var(--accent-terminal) 5%, var(--surface))",
        }}
      >
        <p className="text-[12px] leading-relaxed text-on-surface">{teaser}</p>
        <button
          type="button"
          onClick={() => cta.onClick()}
          className="mt-2 font-mono text-[12px] font-bold text-accent-terminal underline-offset-2 hover:underline"
        >
          {cta.label} →
        </button>
        {error ? <p className="mt-1.5 text-[11px] font-medium text-[#ef4444]">{error}</p> : null}
      </div>
    </>
  );
}
