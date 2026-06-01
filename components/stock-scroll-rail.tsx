"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

const StockScrollContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

const DESKTOP_MQ = "(min-width: 1024px)";

export function useStockScrollRoot() {
  return useContext(StockScrollContext);
}

function isDesktop() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}

type Props = {
  children: ReactNode;
};

export function StockScrollRail({ children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      const pane = scrollRef.current;
      if (!pane || !isDesktop()) return;

      const { scrollTop, clientHeight, scrollHeight } = pane;
      if (scrollHeight <= clientHeight + 1) return;

      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) return;

      e.preventDefault();
      pane.scrollTop += e.deltaY;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <StockScrollContext.Provider value={scrollRef}>
      <div
        ref={scrollRef}
        className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
      >
        {children}
      </div>
    </StockScrollContext.Provider>
  );
}
