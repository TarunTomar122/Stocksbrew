"use client";

import { useEffect, useRef, useState } from "react";

type Tab = { id: string; label: string; hint: string };

const TABS: Tab[] = [
  { id: "today", label: "Today", hint: "Price, technicals, news" },
  { id: "scorecard", label: "Fundamentals", hint: "Score, peers, analysts" },
  { id: "sector", label: "Sector", hint: "Peers, sector performance" },
  { id: "briefing", label: "AI Brief", hint: "Directive, synthesis, risks" },
];

// Sticky section nav with scroll-spy. Tabs smooth-scroll to their section and
// highlight as the user scrolls. Designed to sit directly under the stock
// header so it acts as the page's spine.
export function StockTabs({ hasAI }: { hasAI: boolean }) {
  const [active, setActive] = useState<string>("today");
  const clickLockUntil = useRef<number>(0);

  const visible = hasAI ? TABS : TABS.filter((t) => t.id !== "briefing");
  // "sector" tab is always shown regardless of AI tier.

  useEffect(() => {
    function onScroll() {
      // During a programmatic scroll triggered by a tab click, ignore scroll
      // events so the active tab doesn't jitter mid-scroll.
      if (Date.now() < clickLockUntil.current) return;
      const probe = window.scrollY + 160;
      let current = visible[0]?.id ?? "today";
      for (const t of visible) {
        const el = document.getElementById(t.id);
        if (!el) continue;
        if (el.offsetTop <= probe) current = t.id;
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  function goTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    clickLockUntil.current = Date.now() + 700;
    setActive(id);
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <nav className="sticky top-16 z-40 -mx-8 px-8 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/20">
      <div className="flex items-center gap-1 overflow-x-auto">
        {visible.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => goTo(t.id)}
              className={`group relative flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors ${
                isActive ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span
                className={`text-[11px] font-bold tracking-[0.15em] uppercase ${
                  isActive ? "text-primary" : ""
                }`}
              >
                {t.label}
              </span>
              <span className="text-[10px] font-medium text-on-surface-variant hidden sm:inline">
                {t.hint}
              </span>
              <span
                className={`absolute left-0 right-0 bottom-0 h-0.5 rounded-t transition-opacity ${
                  isActive ? "bg-primary opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
