"use client";

import { useState, useTransition } from "react";

type Props = {
  field: "email_alerts_enabled" | "email_digest_enabled";
  label: string;
  description: string;
  initialValue: boolean;
};

export function PreferenceToggle({ field, label, description, initialValue }: Props) {
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ [field]: next }),
        });
        if (!res.ok) throw new Error("Preference update failed");
      } catch {
        setEnabled(!next);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-3 py-4 first:pt-1 last:pb-0">
      <div className="min-w-0">
        <span className="text-[15px] font-medium text-oa-fg">{label}</span>
        <p className="mt-0.5 text-sm leading-6 text-oa-muted-fg">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-50 ${
          enabled ? "bg-oa-primary" : "bg-oa-secondary"
        }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-0.5 inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
