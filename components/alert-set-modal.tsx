"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect } from "react";

type Props = {
  open: boolean;
  status: "loading" | "success" | "error";
  title: string;
  subtitle?: string;
  onClose: () => void;
};

export function AlertSetModal({ open, status, title, subtitle, onClose }: Props) {
  useEffect(() => {
    if (!open || status !== "success") return;
    const t = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(t);
  }, [open, status, onClose]);

  if (!open) return null;

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[#111827]/35 p-4 backdrop-blur-[1px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[400px] rounded-2xl bg-surface px-5 py-5 shadow-[0_24px_48px_rgba(17,24,39,0.22)] ${
          isError
            ? "border border-[#fecaca]"
            : isSuccess
              ? "border border-[#bbf7d0]"
              : "border border-outline-variant"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isError
                ? "bg-[#fef2f2] text-[#b91c1c]"
                : isSuccess
                  ? "bg-[#ecfdf5] text-[#047857]"
                  : "bg-surface-container text-accent-terminal"
            }`}
          >
            {isLoading ? (
              <AnimatedIcon name="notifications_active" size={20} className="h-4 w-4 animate-spin rounded-full border-2 border-outline-variant border-t-accent-terminal" />
            ) : (
              <span className="text-[16px] font-bold">!</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-on-surface">{title}</p>
            {subtitle ? <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">{subtitle}</p> : null}
          </div>
        </div>
        {!isLoading ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl border border-outline-variant bg-surface-container-low py-2.5 text-[13px] font-semibold text-on-surface"
          >
            {isSuccess ? "Got it" : "Close"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
