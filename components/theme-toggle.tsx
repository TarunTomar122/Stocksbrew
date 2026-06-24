"use client";

import { useEffect, useState } from "react";

/**
 * Light/dark toggle. The actual class is applied pre-paint by the inline
 * script in app/layout.tsx (reads localStorage 'sb-theme'); this just flips it
 * and persists the choice. Default is light, so existing pages are unaffected
 * until a user opts in.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    const root = document.documentElement;
    if (next) root.classList.add("dark");
    else root.classList.remove("dark");
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
      className={`inline-grid h-9 w-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container ${className}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
