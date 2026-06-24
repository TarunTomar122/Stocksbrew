"use client";

import { useRadarChat } from "@/components/radar-chat-context";

export function RadarAskButton({
  ticker,
  className = "",
}: {
  ticker: string;
  className?: string;
}) {
  const { askAbout } = useRadarChat();

  return (
    <button
      type="button"
      aria-label={`Ask AI about ${ticker}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        askAbout(ticker);
      }}
      className={
        className ||
        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface-variant shadow-sm transition-colors hover:border-on-surface hover:text-on-surface"
      }
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        chat
      </span>
    </button>
  );
}
