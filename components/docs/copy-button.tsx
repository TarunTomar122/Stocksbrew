"use client";

import * as React from "react";

/** A small "Copy" control for code and prompts. Says so when the copy fails instead of pretending. */
export function CopyButton({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`oa-mono inline-flex h-6 shrink-0 cursor-pointer items-center rounded border border-oa-border bg-oa-card px-2 text-[11px] uppercase tracking-[0.06em] text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${className}`}
    >
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select to copy" : label}</span>
    </button>
  );
}

/** A labelled code block with a copy control. Scrolls sideways instead of wrapping. */
export function CodeBlock({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  return (
    <div className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-bg ${className}`}>
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-oa-border px-3 py-1.5">
        <span className="oa-caption min-w-0 truncate">{label ?? "Code"}</span>
        <CopyButton value={code} />
      </div>
      <pre className="oa-mono overflow-x-auto whitespace-pre-wrap p-3.5 text-[13px] leading-[1.6] text-oa-fg [overflow-wrap:anywhere]" tabIndex={0}>
        {code}
      </pre>
    </div>
  );
}
