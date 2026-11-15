"use client";

import { CssIcon } from "@/components/icons/css-icons";
import { useEffect, useState } from "react";

/**
 * Light/dark, as one round icon for the top bars (the same size as search): a moon in light mode, a sun in dark.
 * The class is applied pre-paint by the inline script in app/layout.tsx. Which icon shows is decided by the html.dark
 * class, so it is right on first paint; the html class is also the one source of truth, so two of these on one page
 * (top bar and footer on a narrow phone, sidebar and phone bar in the app) never disagree.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== "sb-theme") return;
      const nextDark = event.newValue === "dark";
      root.classList.toggle("dark", nextDark);
      root.style.colorScheme = nextDark ? "dark" : "light";
    };

    sync();
    // Another toggle on this page (or another tab, through storage) changes the html class: follow it.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("storage", syncFromStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
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
      title={isDark ? "Light mode" : "Dark mode"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${className}`}
    >
      <span aria-hidden className="grid place-items-center dark:hidden">
        <CssIcon name="moon" size={18} />
      </span>
      <span aria-hidden className="hidden place-items-center dark:grid">
        <CssIcon name="sun" size={19} />
      </span>
    </button>
  );
}
