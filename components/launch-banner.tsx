"use client";

import Link from "next/link";
import { useState } from "react";

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative z-[60] flex items-center justify-center gap-3 bg-[#111111] px-10 py-2.5 text-white">
      <span className="text-[13px] font-medium leading-none whitespace-nowrap">
        Try stocksbrew Pro free for 3 days
        <span className="hidden sm:inline"> · then $12/mo or $99/yr</span>
      </span>
      <Link
        href="/subscribe"
        className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-bold text-[#111111] hover:bg-[#f3f4f6] transition-colors"
      >
        Subscribe →
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  );
}
