"use client";

import { useState } from "react";

import { AGENT_SETUP_PROMPT } from "@/lib/agent-setup-prompt";
import { trackAgentAccessAction } from "@/lib/product-analytics";

export function AgentSetupPrompt({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AGENT_SETUP_PROMPT);
      setCopied(true);
      trackAgentAccessAction({ action: "config_copied" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`border-y border-outline-variant py-4 sm:py-5 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-landing-brand">
            Connect Stocksbrew
          </p>
          <p className="mt-1 text-[14px] font-bold text-on-surface">Copy this into your agent</p>
        </div>
        <button
          type="button"
          onClick={() => void copyPrompt()}
          className="shrink-0 rounded-full bg-on-surface px-4 py-2 text-[11px] font-bold text-surface transition-opacity hover:opacity-80"
        >
          {copied ? "Copied ✓" : "Copy prompt"}
        </button>
      </div>
      {compact ? (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-on-surface-variant">
          Connect to stocksbrew.online/api/mcp with OAuth, then show my Watchlist and latest changes.
        </p>
      ) : (
        <pre className="mt-4 whitespace-pre-wrap font-mono text-[11px] leading-[1.75] text-on-surface-variant">
          {AGENT_SETUP_PROMPT}
        </pre>
      )}
      {compact ? null : (
        <p className="mt-3 text-[10px] leading-relaxed text-on-surface-variant">
          Uses OAuth. Your access token stays out of the conversation.
        </p>
      )}
    </div>
  );
}
