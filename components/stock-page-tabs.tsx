"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ProBadge } from "@/components/pro-badge";
import { useStockScrollRoot } from "@/components/stock-scroll-rail";

type TabKey = "overview" | "analyst" | "fundamentals" | "earnings" | "ai";

type Props = {
  overview: ReactNode;
  analyst: ReactNode;
  fundamentals: ReactNode;
  earnings?: ReactNode | null;
  ai: ReactNode | null;
  /** Keep AI brief visible in the tab bar even when body content is Pro-gated. */
  showAiTab?: boolean;
  isSubscribed: boolean;
};

const BASE_TABS: { key: TabKey; label: string; narrowLabel?: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "analyst", label: "Analyst" },
  { key: "fundamentals", label: "Fundamentals" },
  { key: "ai", label: "AI brief", narrowLabel: "AI" },
  { key: "earnings", label: "Earnings" },
];

function scrollOffset(useContainer: boolean): number {
  if (typeof window === "undefined") return 140;
  if (useContainer) return 56;
  return window.innerWidth < 768 ? 160 : 140;
}

function resolveScrollRoot(
  scrollRootRef: ReturnType<typeof useStockScrollRoot>,
): HTMLElement | null {
  if (typeof window === "undefined") return null;
  if (!window.matchMedia("(min-width: 1024px)").matches) return null;
  return scrollRootRef?.current ?? null;
}

export function StockPageTabs({
  overview,
  analyst,
  fundamentals,
  earnings,
  ai,
  showAiTab = false,
  isSubscribed,
}: Props) {
  const [active, setActive] = useState<TabKey>("overview");
  const clickLockUntil = useRef(0);
  const scrollRootRef = useStockScrollRoot();
  const visible = BASE_TABS.filter((t) => {
    if (t.key === "ai" && !ai && !showAiTab) return false;
    if (t.key === "earnings" && !earnings) return false;
    return true;
  });

  useEffect(() => {
    function onScroll() {
      if (Date.now() < clickLockUntil.current) return;
      const root = resolveScrollRoot(scrollRootRef);
      const offset = scrollOffset(Boolean(root));
      const probeLine = root
        ? root.getBoundingClientRect().top + offset + 20
        : offset + 20;
      let current: TabKey = visible[0]?.key ?? "overview";
      for (const t of visible) {
        const el = document.getElementById(`stock-section-${t.key}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= probeLine) current = t.key;
      }
      setActive(current);
    }

    function bind() {
      onScroll();
      const root = resolveScrollRoot(scrollRootRef);
      const cleanups: (() => void)[] = [];

      if (root) {
        root.addEventListener("scroll", onScroll, { passive: true });
        cleanups.push(() => root.removeEventListener("scroll", onScroll));
        window.addEventListener("scroll", onScroll, { passive: true });
        cleanups.push(() => window.removeEventListener("scroll", onScroll));
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
        cleanups.push(() => window.removeEventListener("scroll", onScroll));
      }

      return () => cleanups.forEach((fn) => fn());
    }

    let cleanup = bind();
    const mq = window.matchMedia("(min-width: 1024px)");
    function onBreakpoint() {
      cleanup();
      cleanup = bind();
    }
    mq.addEventListener("change", onBreakpoint);
    return () => {
      cleanup();
      mq.removeEventListener("change", onBreakpoint);
    };
  }, [visible, scrollRootRef]);

  function goTo(key: TabKey) {
    const targetKey =
      !isSubscribed && showAiTab && key === "ai" ? "fundamentals" : key;
    const el = document.getElementById(`stock-section-${targetKey}`);
    if (!el) return;
    clickLockUntil.current = Date.now() + 800;
    setActive(targetKey);
    const root = resolveScrollRoot(scrollRootRef);
    const offset = scrollOffset(Boolean(root));
    if (root) {
      const rootRect = root.getBoundingClientRect();
      const y = root.scrollTop + (el.getBoundingClientRect().top - rootRect.top) - offset;
      root.scrollTo({ top: y, behavior: "smooth" });
      return;
    }
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  const content: Record<TabKey, ReactNode> = {
    overview,
    analyst,
    fundamentals,
    earnings: earnings ?? null,
    ai,
  };

  return (
    <div className="flex flex-col gap-0 min-w-0">
      <div className="sticky top-[104px] md:top-16 lg:top-0 z-30 -mx-1 bg-[var(--background)] border-b border-[#e5e7eb]">
        <nav
          className="flex flex-nowrap items-stretch gap-0 sm:gap-0.5 px-1 overflow-x-auto overscroll-x-contain scrollbar-hide touch-pan-x"
          role="tablist"
        >
          {visible.map((t) => {
            const isActive = active === t.key;
            const locked = !isSubscribed && (t.key === "ai" || t.key === "earnings");
            const baseLabel = t.label;
            const baseNarrow = t.narrowLabel ?? t.label;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={locked ? `${baseLabel} · Pro` : baseLabel}
                title={locked ? `${baseLabel} · Pro` : baseLabel}
                onClick={() => goTo(t.key)}
                className={`relative flex shrink-0 items-center gap-1.5 justify-center whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tracking-[-0.01em] transition-colors sm:px-4 sm:py-3 sm:text-[14px] min-h-[44px] ${
                  isActive ? "text-[#111111]" : "text-[#6b7280] hover:text-[#111111]"
                }`}
              >
                <span className="inline sm:hidden">{baseNarrow}</span>
                <span className="hidden sm:inline">{baseLabel}</span>
                {locked && <ProBadge isSubscribed={false} />}
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
      {visible.map((t, i) => {
        const hideLockedAiBody = !isSubscribed && showAiTab && t.key === "ai" && !ai;
        if (hideLockedAiBody) return null;

        return (
          <section
            key={t.key}
            id={`stock-section-${t.key}`}
            className="scroll-mt-32 flex flex-col gap-6"
          >
            <div className={`flex flex-col gap-4 ${i > 0 ? "pt-8 border-t-2 border-[#e5e7eb]" : ""}`}>
              <h2 className="text-[26px] md:text-[30px] font-semibold text-[#111111] tracking-[-0.03em] leading-none">
                {t.label}
              </h2>
            </div>
            {content[t.key]}
          </section>
        );
      })}
      </div>
    </div>
  );
}
