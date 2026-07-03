"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useState } from "react";

import { ProCtaLink } from "@/components/pro-cta";

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative z-[60] flex items-center justify-center gap-3 bg-[#111111] px-10 py-2.5 text-white">
      <span className="text-[13px] font-medium leading-none whitespace-nowrap">
        Try stocksbrew Pro free for 3 days
        <span className="hidden sm:inline"> · then $12/mo or $99/yr</span>
      </span>
      <ProCtaLink href="/subscribe" size="sm" className="px-3 py-1 text-[12px]">
        Subscribe →
      </ProCtaLink>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white transition-colors"
      >
        <AnimatedIcon name="close" size={18} />
      </button>
    </div>
  );
}
