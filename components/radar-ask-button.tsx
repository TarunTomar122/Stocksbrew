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
        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] shadow-sm transition-colors hover:border-[#111111] hover:text-[#111111]"
      }
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        chat
      </span>
    </button>
  );
}
