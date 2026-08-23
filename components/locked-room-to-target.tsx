"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackCheckoutClicked, trackCheckoutStarted, trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";

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
  const teaser =
    count > 0
      ? `${count} analyst${count === 1 ? "" : "s"} cover ${ticker}`
      : `Analyst coverage for ${ticker}`;

  const cta = !signedIn
    ? {
        label: "Start your 3-day free trial",
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
        onClick: async () => {
          trackPaywallUnlockClicked({ surface: "locked_room_to_target", ticker, signedIn: true });
          trackCheckoutClicked({ period: "monthly", market: "US", signedIn: true });
          try {
            const checkoutUrl = await startDodoCheckout();
            trackCheckoutStarted({ period: "monthly", market: "US" });
            window.location.assign(checkoutUrl);
          } catch (err) {
            console.error("direct checkout failed", err);
            setError("Could not open checkout. Please try again.");
          }
        },
      };

  return (
    <>
      <p className={`${RAIL_KICKER} mb-2`}>room to target</p>
      <div className="relative min-h-[190px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low/35">
        <div className="pointer-events-none p-5 opacity-80 blur-[4px]" aria-hidden>
          {count > 0 && (
            <p className="text-[13px] text-on-surface-variant">
              {count} analysts · <RedactedLine width="4.5rem" />
            </p>
          )}
          <div className="mt-4 flex items-end gap-2">
            <div>
              <p className="font-mono text-[10px] text-on-surface-variant">now</p>
              <p className="text-[18px] font-extrabold tabular-nums text-on-surface">{currentPriceLabel}</p>
            </div>
            <div className="flex-1 pb-1">
              <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
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
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--surface)_86%,transparent)_0%,color-mix(in_srgb,var(--surface)_66%,transparent)_68%,transparent_100%)] p-5 text-center">
          <p className="text-[15px] font-extrabold tracking-[-0.01em] text-on-surface">
            Analyst target and upside
          </p>
          <p className="mt-1 text-[11px] text-on-surface-variant">{teaser}</p>
          <button
            type="button"
            onClick={() => cta.onClick()}
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-[12px] font-bold leading-none text-on-primary transition-opacity hover:opacity-90"
          >
            {cta.label}
          </button>
          {error ? <p className="mt-1.5 text-[11px] font-medium text-[#ef4444]">{error}</p> : null}
        </div>
      </div>
    </>
  );
}
