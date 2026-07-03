"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useState } from "react";

type Props = {
  ticker: string;
  headline?: string;
  /** Full-width stacked buttons for mobile footer */
  variant?: "inline" | "stacked";
};

export function EarningsIntelShare({ ticker, headline, variant = "inline" }: Props) {
  const stacked = variant === "stacked";
  const [linkCopied, setLinkCopied] = useState(false);

  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://www.stocksbrew.online/earnings-intel/${encodeURIComponent(ticker)}`;

  const tweetLead = headline?.trim()
    ? headline.trim().slice(0, 200)
    : `Post-earnings intel on ${ticker}`;
  const tweetText = encodeURIComponent(`${tweetLead} via stocksbrew`);
  const tweetHref = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(pageUrl)}`;

  function handleCopyLink() {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  const actionClass = stacked
    ? "flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors"
    : "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors";

  return (
    <div
      className={stacked ? "flex w-full flex-col gap-2" : "flex flex-wrap items-center gap-2"}
      data-screenshot-exclude
    >
      <button
        type="button"
        onClick={handleCopyLink}
        className={`${actionClass} border border-[#e5e7eb] bg-white text-[#111111] hover:border-[#111111]`}
      >
        {linkCopied ? (
          <>
            <AnimatedIcon name="check" size={18} className="text-[#10b981]" />
            Copied
          </>
        ) : (
          <>
            <AnimatedIcon name="link" size={18} className="text-[#6b7280]" />
            Copy link
          </>
        )}
      </button>

      <a
        href={tweetHref}
        target="_blank"
        rel="noopener noreferrer"
        className={`${actionClass} bg-[#111111] text-white hover:bg-[#1f1f1f]`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M12.6 1h2.4L9.72 6.62 16 15h-4.44l-3.78-4.94L3.48 15H1.06l5.64-6.01L0 1h4.56l3.42 4.47L12.6 1zm-.84 12.6h1.32L4.26 2.36H2.84l8.92 11.24z" />
        </svg>
        Share on X
      </a>
    </div>
  );
}
