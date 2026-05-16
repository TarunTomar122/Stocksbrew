"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type TabKey = "overview" | "analyst" | "fundamentals" | "ai";

type Props = {
  overview: ReactNode;
  analyst: ReactNode;
  fundamentals: ReactNode;
  ai: ReactNode | null;
  isSubscribed: boolean;
};

const TABS: { key: TabKey; label: string; narrowLabel?: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "analyst", label: "Analyst" },
  { key: "fundamentals", label: "Fundamentals" },
  { key: "ai", label: "AI brief", narrowLabel: "AI" },
];

const SCROLL_OFFSET = typeof window !== "undefined" && window.innerWidth < 768 ? 160 : 140;

export function StockPageTabs({ overview, analyst, fundamentals, ai, isSubscribed }: Props) {
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
    <div className="flex flex-col gap-0 min-w-0">
      <div className="sticky top-[104px] md:top-16 z-30 -mx-1 bg-[var(--background)] border-b border-[#e5e7eb]">
        <nav
          className="flex flex-nowrap items-stretch gap-0 sm:gap-0.5 px-1 overflow-x-auto overscroll-x-contain scrollbar-hide touch-pan-x"
          role="tablist"
        >
          {visible.map((t) => {
            const isActive = active === t.key;
            const locked = !isSubscribed && t.key === "ai";
            const label = locked ? `${t.label} 🔒` : t.label;
            const narrowLabel = locked ? `${t.narrowLabel ?? t.label} 🔒` : t.narrowLabel ?? t.label;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                title={label}
                onClick={() => goTo(t.key)}
                className={`relative flex shrink-0 items-center justify-center whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tracking-[-0.01em] transition-colors sm:px-4 sm:py-3 sm:text-[14px] min-h-[44px] ${
                  isActive ? "text-[#111111]" : "text-[#6b7280] hover:text-[#111111]"
                }`}
              >
                <span className="inline sm:hidden">{narrowLabel}</span>
                <span className="hidden sm:inline">{label}</span>
                <span
                  aria-hidden
                  className={`absolute left-2 right-2 sm:left-3 sm:right-3 -bottom-px h-[3px] rounded-full transition-all ${
                    isActive ? "bg-[#111111] opacity-100" : "bg-transparent opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-20 mt-6">
      {visible.map((t, i) => (
        <section
          key={t.key}
          id={`stock-section-${t.key}`}
          className="scroll-mt-32 flex flex-col gap-6"
        >
          {/* Section heading with divider - skip top border on first section */}
          <div className={`flex flex-col gap-4 ${i > 0 ? "pt-8 border-t-2 border-[#e5e7eb]" : ""}`}>
            <h2 className="text-[26px] md:text-[30px] font-semibold text-[#111111] tracking-[-0.03em] leading-none">
              {t.label}
            </h2>
          </div>
          {content[t.key]}
        </section>
      ))}
      </div>
    </div>
  );
}
