"use client";

import { useState, useTransition } from "react";

type Props = {
  field: "email_alerts_enabled" | "email_digest_enabled";
  label: string;
  description: string;
  icon: string;
  initialValue: boolean;
};

export function PreferenceToggle({ field, label, description, icon, initialValue }: Props) {
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
    <div className="flex items-start gap-3">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5 flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-on-surface">{label}</span>
            <p className="text-[12px] text-on-surface-variant mt-0.5">{description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`Toggle ${label}`}
            disabled={pending}
            onClick={toggle}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
              enabled ? "bg-[#111111]" : "bg-[#d1d5db]"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
