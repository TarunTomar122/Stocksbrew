"use client";

import * as React from "react";

import { CONTROL, CONTROL_ACTIVE } from "@/components/screener/controls";

/** A button that opens a small panel under it. Closes on outside click and Escape. */
export function Menu({
  label,
  active = false,
  align = "left",
  width = "w-64",
  children,
  buttonClassName = "",
}: {
  label: React.ReactNode;
  /** Draws the button as "something is set here". */
  active?: boolean;
  align?: "left" | "right";
  width?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  buttonClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={`${CONTROL} ${active ? CONTROL_ACTIVE : ""} ${buttonClassName}`}
      >
        {label}
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-oa-muted-fg transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div
          className={`oa-surface absolute top-[calc(100%+6px)] z-40 max-h-[min(70vh,26rem)] max-w-[calc(100vw-2rem)] overflow-y-auto border border-oa-border bg-oa-card shadow-[0_14px_40px_-12px_rgba(0,0,0,0.35)] ${width} ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

/** A tickable line inside a menu. */
export function MenuCheck({
  checked,
  onChange,
  children,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13.5px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <span
        aria-hidden="true"
        className={`flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border ${
          checked ? "border-oa-primary bg-oa-primary text-oa-primary-fg" : "border-oa-border bg-oa-card"
        }`}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="oa-mono shrink-0 text-[11.5px] text-oa-muted-fg">{hint}</span> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="oa-caption px-3 pb-1 pt-2.5">{children}</p>;
}
