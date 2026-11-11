"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { trackAskAiClicked } from "@/lib/product-analytics";
import Link from "next/link";

/**
 * "Ask AI": opens our own copilot at /ask with a question about this stock,
 * or about the person's portfolio when no ticker is given. The question is
 * asked as soon as the page opens.
 */
export function WatchlistAiPromptButton({
  ticker,
  iconOnly = false,
  className = "",
}: {
  ticker?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const question = ticker
    ? `What should I know about ${ticker} right now?`
    : "What changed in my portfolio since yesterday?";
  const label = ticker ? `Ask about ${ticker}` : "Ask about your portfolio";
  return (
    <Link prefetch={false}
      href={`/ask?q=${encodeURIComponent(question)}`}
      onClick={(event) => {
        event.stopPropagation();
        trackAskAiClicked({ surface: ticker ? "stock" : "watchlist", ticker });
      }}
      aria-label={label}
      title={label}
      className={
        className ||
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--rn-line)] bg-[var(--rn-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--rn-ink)] shadow-sm transition-colors hover:border-[var(--rn-ink)]"
      }
    >
      <AnimatedIcon name="auto_awesome" size={14} />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}
