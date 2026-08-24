"use client";

import { useEffect, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { buildWatchlistAiPrompt } from "@/lib/watchlist-ai-prompt";
import { trackAskAiClicked } from "@/lib/product-analytics";
import { useModalBackClose } from "@/lib/use-modal-back-close";

export function WatchlistAiPromptButton({
  ticker,
  iconOnly = false,
  className = "",
}: {
  ticker?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!showHelp) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowHelp(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showHelp]);

  useModalBackClose(showHelp, () => setShowHelp(false));

  async function copyPrompt() {
    trackAskAiClicked({ surface: ticker ? "stock" : "watchlist", ticker });
    try {
      await navigator.clipboard.writeText(buildWatchlistAiPrompt(ticker));
      setState("copied");
      setShowHelp(true);
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("error");
    }
  }

  const label = ticker ? `Copy an AI prompt about ${ticker}` : "Copy an AI prompt about your Watchlist";
  const text = state === "copied" ? "Copied" : state === "error" ? "Try again" : "Ask AI";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void copyPrompt();
        }}
        aria-label={label}
        title={label}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--rn-line)] bg-[var(--rn-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--rn-ink)] shadow-sm transition-colors hover:border-[var(--rn-ink)]"
        }
      >
        <AnimatedIcon name={state === "copied" ? "check" : "auto_awesome"} size={14} />
        {iconOnly ? <span className="sr-only">{text}</span> : text}
      </button>

      {showHelp ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-ai-prompt-title"
            className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-5 shadow-[var(--shadow-modal)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#D97757]">
                  Prompt copied
                </p>
                <h2 id="ask-ai-prompt-title" className="mt-2 text-xl font-semibold text-on-surface">
                  Take it to your AI
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                aria-label="Close Ask AI instructions"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                <AnimatedIcon name="close" size={18} />
              </button>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant">
              Paste it into Codex or Claude Code for direct setup. ChatGPT and Claude mobile need Stocksbrew connected from their web settings first.
            </p>
            <p className="mt-3 rounded-xl bg-surface-container-low px-3.5 py-3 text-[13px] leading-relaxed text-on-surface">
              It asks for a clear, plain-English read on {ticker ? `${ticker} using current Stocksbrew evidence` : "your Watchlist using current Stocksbrew evidence"}.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <a
                href="/agents"
                className="rounded-full border border-outline-variant px-4 py-2 text-[12px] font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
              >
                How to connect
              </a>
              <button
                type="button"
                autoFocus
                onClick={() => setShowHelp(false)}
                className="rounded-full bg-on-surface px-4 py-2 text-[12px] font-semibold text-surface transition-opacity hover:opacity-80"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
