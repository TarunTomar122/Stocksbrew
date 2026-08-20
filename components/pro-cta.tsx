"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { useState } from "react";

import { useUser } from "@/lib/auth-context";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackCheckoutClicked, trackCheckoutStarted } from "@/lib/product-analytics";

export type ProCtaSize = "sm" | "md" | "lg";

const SIZE_CLASSES: Record<ProCtaSize, string> = {
  sm: "px-3.5 py-2 text-[13px]",
  md: "px-5 py-3 text-[14px]",
  lg: "h-[48px] px-6 text-[14px]",
};

const PRO_CTA_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold tracking-tight transition-all hover:-translate-y-[1px] active:translate-y-0 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0";

const PRO_CTA_FILL =
  "bg-gradient-to-r from-[#6d35dc] to-[#7c3aed] text-white border border-[#6d35dc] shadow-[0_1px_2px_rgba(76,29,149,0.14),0_6px_18px_rgba(109,53,220,0.24)] hover:shadow-[0_2px_4px_rgba(76,29,149,0.18),0_10px_22px_rgba(109,53,220,0.3)]";

const PRO_CTA_OUTLINE =
  "bg-[#f7f5ff] text-[#6330c9] border-2 border-[#c4b5fd] hover:bg-[#ede9fe] shadow-none hover:shadow-[0_4px_14px_rgba(109,53,220,0.16)]";

export function proCtaClassName({
  size = "md",
  fullWidth = false,
  variant = "fill",
  className = "",
}: {
  size?: ProCtaSize;
  fullWidth?: boolean;
  variant?: "fill" | "outline";
  className?: string;
} = {}): string {
  return [
    PRO_CTA_BASE,
    variant === "outline" ? PRO_CTA_OUTLINE : PRO_CTA_FILL,
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ProCtaStar({ className = "" }: { className?: string }) {
  return (
    <svg width="9" height="11" viewBox="0 0 7 9" fill="none" aria-hidden className={className}>
      <path
        d="M3.5 0L4.6 3.2H8L5.2 5.1L6.3 8.3L3.5 6.4L0.7 8.3L1.8 5.1L-1 3.2H2.4L3.5 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

type SharedProps = {
  size?: ProCtaSize;
  fullWidth?: boolean;
  variant?: "fill" | "outline";
  showStar?: boolean;
  children: ReactNode;
  className?: string;
};

export function ProCtaLink({
  href = "/subscribe",
  size,
  fullWidth,
  variant,
  showStar = false,
  children,
  className = "",
  ...props
}: SharedProps & Omit<ComponentProps<typeof Link>, "href" | "className" | "children"> & { href?: string }) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (href === "/subscribe") {
    async function openCheckout() {
      if (busy) return;
      setBusy(true);
      setError(false);
      trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
      try {
        if (!user) await signInWithGoogle({ surface: "paywall" });
        const checkoutUrl = await startDodoCheckout();
        trackCheckoutStarted({ period: "monthly", market: "US" });
        window.location.assign(checkoutUrl);
      } catch (err) {
        console.error("direct checkout failed", err);
        setError(true);
      } finally {
        setBusy(false);
      }
    }

    return (
      <button
        type="button"
        className={proCtaClassName({ size, fullWidth, variant, className })}
        onClick={() => void openCheckout()}
        disabled={busy}
        aria-busy={busy}
        {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {showStar ? <ProCtaStar className="text-white" /> : null}
        {busy ? "Opening checkout…" : error ? "Try again" : children}
      </button>
    );
  }

  return (
    <Link href={href} className={proCtaClassName({ size, fullWidth, variant, className })} {...props}>
      {showStar ? <ProCtaStar className="text-white" /> : null}
      {children}
    </Link>
  );
}

export function ProCtaButton({
  size,
  fullWidth,
  variant,
  showStar = false,
  children,
  className = "",
  type = "button",
  ...props
}: SharedProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={proCtaClassName({ size, fullWidth, variant, className })}
      {...props}
    >
      {showStar ? <ProCtaStar className="text-white" /> : null}
      {children}
    </button>
  );
}
