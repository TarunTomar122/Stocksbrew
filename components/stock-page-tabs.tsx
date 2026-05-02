"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type TabKey = "overview" | "analyst" | "fundamentals" | "ai";

type Props = {
  overview: ReactNode;
  analyst: ReactNode;
  fundamentals: ReactNode;
  ai: ReactNode | null;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "analyst", label: "Analyst" },
  { key: "fundamentals", label: "Fundamentals" },
  { key: "ai", label: "AI brief" },
];

const SCROLL_OFFSET = 140;

export function StockPageTabs({ overview, analyst, fundamentals, ai }: Props) {
  const [active, setActive] = useState<TabKey>("overview");
  const clickLockUntil = useRef(0);
  const visible = ai ? TABS : TABS.filter((t) => t.key !== "ai");

  useEffect(() => {
    function onScroll() {
      if (Date.now() < clickLockUntil.current) return;
      const probe = window.scrollY + SCROLL_OFFSET + 20;
      let current: TabKey = visible[0]?.key ?? "overview";
      for (const t of visible) {
        const el = document.getElementById(`stock-section-${t.key}`);
        if (!el) continue;
        if (el.offsetTop <= probe) current = t.key;
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  function goTo(key: TabKey) {
    const el = document.getElementById(`stock-section-${key}`);
    if (!el) return;
    clickLockUntil.current = Date.now() + 800;
    setActive(key);
    const y = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  const content: Record<TabKey, ReactNode> = {
    overview,
    analyst,
    fundamentals,
    ai,
  };

  return (
    <div className="flex flex-col gap-8 min-w-0">
      <div className="sticky top-16 z-30 -mx-1 bg-[var(--background)] border-b border-[#e5e7eb]">
        <nav
          className="flex items-center gap-1 px-1 overflow-x-auto scrollbar-hide"
          role="tablist"
        >
          {visible.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => goTo(t.key)}
                className={`relative flex items-center px-4 py-3 text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
                  isActive ? "text-[#0052ff]" : "text-[#6b7280] hover:text-[#111111]"
                }`}
              >
                {t.label}
                <span
                  aria-hidden
                  className={`absolute left-3 right-3 -bottom-px h-0.5 rounded-full transition-all ${
                    isActive ? "bg-[#0052ff] opacity-100" : "bg-transparent opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {visible.map((t) => (
        <section
          key={t.key}
          id={`stock-section-${t.key}`}
          className="scroll-mt-32 flex flex-col gap-4"
        >
          <h2 className="text-[20px] md:text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">
            {t.label}
          </h2>
          {content[t.key]}
        </section>
      ))}
    </div>
  );
}
