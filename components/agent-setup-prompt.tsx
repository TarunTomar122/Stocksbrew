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
    <div
      className={`rounded-[18px] border border-[color-mix(in_srgb,var(--oa-fg,#17181a)_12%,transparent)] bg-[color-mix(in_srgb,var(--oa-fg,#17181a)_3%,transparent)] p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-[var(--oa-fg,#17181a)]">Copy the setup prompt</p>
        <button
          type="button"
          onClick={() => void copyPrompt()}
          className="inline-flex h-8 shrink-0 items-center rounded-full bg-[var(--oa-fg,#17181a)] px-4 text-xs font-medium text-[var(--oa-card,#ffffff)] transition-all hover:opacity-85 active:translate-y-px active:scale-[0.98]"
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
      {compact ? (
        <p className="oa-mono mt-3 text-[11px] leading-relaxed text-[color-mix(in_srgb,var(--oa-fg,#17181a)_55%,transparent)]">
          Connect to stocksbrew.online/api/mcp with OAuth, then show my Watchlist and latest changes.
        </p>
      ) : (
        <pre className="oa-mono mt-4 whitespace-pre-wrap text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--oa-fg,#17181a)_70%,transparent)]">
          {AGENT_SETUP_PROMPT}
        </pre>
      )}
      {compact ? null : (
        <p className="mt-3 text-xs leading-relaxed text-[color-mix(in_srgb,var(--oa-fg,#17181a)_55%,transparent)]">
          Uses OAuth. Your access token stays out of the conversation.
        </p>
      )}
    </div>
  );
}
