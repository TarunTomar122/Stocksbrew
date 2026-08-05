"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { useEffect, useState } from "react";

/**
 * Light/dark toggle. The actual class is applied pre-paint by the inline
 * script in app/layout.tsx; this control keeps that choice in sync and stores
 * an explicit preference after the first click.
 */
export function ThemeToggle({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "footer";
}) {
  const [isDark, setIsDark] = useState(false);
  const isFooter = variant === "footer";

  useEffect(() => {
    const root = document.documentElement;
    const syncFromDocument = () => setIsDark(root.classList.contains("dark"));
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== "sb-theme") return;
      const nextDark = event.newValue === "dark";
      root.classList.toggle("dark", nextDark);
      root.style.colorScheme = nextDark ? "dark" : "light";
      setIsDark(nextDark);
    };

    syncFromDocument();
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    const root = document.documentElement;
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem("sb-theme", next ? "dark" : "light");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`group relative inline-flex h-8 w-[58px] shrink-0 items-center justify-between rounded-full border p-1 shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        isFooter
          ? "border-white/15 bg-white/[0.07] hover:border-white/25 focus-visible:ring-offset-[#070b09]"
          : "border-outline-variant bg-surface-container-low hover:border-outline focus-visible:ring-offset-surface"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`absolute left-1 top-1 h-6 w-6 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-apple-ease motion-reduce:transition-none ${
          isFooter ? "bg-[#f4f7f5]" : "bg-on-surface"
        } ${
          isDark ? "translate-x-[26px]" : "translate-x-0"
        }`}
      />
      <span
        aria-hidden
        className={`relative z-10 grid h-6 w-6 place-items-center transition-colors ${
          isFooter
            ? isDark ? "text-white/45" : "text-[#070b09]"
            : isDark ? "text-on-surface-variant" : "text-surface"
        }`}
      >
        <AnimatedIcon name="light_mode" size={15} />
      </span>
      <span
        aria-hidden
        className={`relative z-10 grid h-6 w-6 place-items-center transition-colors ${
          isFooter
            ? isDark ? "text-[#070b09]" : "text-white/45"
            : isDark ? "text-surface" : "text-on-surface-variant"
        }`}
      >
        <AnimatedIcon name="dark_mode" size={14} />
      </span>
    </button>
  );
}
