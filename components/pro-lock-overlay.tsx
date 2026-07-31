"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { ProCtaButton } from "@/components/pro-cta";
import {
  type PaywallSurface,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";

type Props = {
  title?: string;
  description?: string;
  /** Up to 3 short, concrete value points shown as a checklist. */
  benefits?: string[];
  surface: PaywallSurface;
  ticker?: string;
};

/**
 * The persuasive Pro card. Use directly (normal flow) when the lock IS the
 * content so the container grows with it, or via ProLockOverlay to float it
 * over blurred content.
 */
export function ProLockCard({
  title = "This one needs Pro",
  description = "Get the read, not just the raw numbers.",
  benefits,
  surface,
  ticker,
}: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPaywallShown({
      surface,
      ticker,
      signedIn: Boolean(user),
    });
  }, [surface, ticker, user]);

  async function handleUnlock() {
    trackPaywallUnlockClicked({
      surface,
      ticker,
      signedIn: Boolean(user),
    });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return (
    <div className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-3xl border border-outline-variant bg-surface p-6 text-center shadow-[0_24px_70px_rgba(17,24,39,0.12)] sm:p-7">
      <span className="inline-flex items-center gap-1.5 rounded-full tint-warn px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#f59e0b]">
        <span aria-hidden>★</span> stocksbrew Pro
      </span>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-on-surface sm:text-[20px]">
          {title}
        </h3>
        <p className="text-[13px] leading-relaxed text-on-surface-variant">{description}</p>
      </div>

      {benefits && benefits.length > 0 && (
        <ul className="flex w-full flex-col gap-2 text-left">
          {benefits.slice(0, 3).map((b) => (
            <li key={b} className="flex items-start gap-2 text-[13px] text-on-surface">
              <AnimatedIcon name="check_circle" size={17} className="mt-0.5 text-[#10b981]" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <ProCtaButton type="button" disabled={busy} onClick={handleUnlock} fullWidth showStar>
        {busy ? "Signing you in…" : user ? "Choose Pro" : "Start your 3-day free trial"}
        {!busy && <span aria-hidden>→</span>}
      </ProCtaButton>
      <span className="text-[11px] font-medium text-on-surface-variant">
        3 days free on monthly or yearly. Cancel anytime.
      </span>
    </div>
  );
}

/**
 * Drop this inside any `relative` container that has its own height (real
 * content behind it). Floats the Pro card over blurred content. If the lock is
 * the whole content, render <ProLockCard /> directly so height stays dynamic.
 */
export function ProLockOverlay(props: Props) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto rounded-[inherit] bg-surface/75 px-4 py-6 backdrop-blur-[7px]">
      <ProLockCard {...props} />
    </div>
  );
}
