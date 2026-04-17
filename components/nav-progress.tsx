"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function NavProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const prevKey = useRef("");

  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    if (prevKey.current && prevKey.current !== routeKey) {
      setProgress(100);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }
    prevKey.current = routeKey;
  }, [routeKey]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;

      setVisible(true);
      setProgress(0);
      requestAnimationFrame(() => {
        setProgress(30);
        setTimeout(() => setProgress(60), 300);
        setTimeout(() => setProgress(80), 800);
        setTimeout(() => setProgress(90), 1500);
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-[2px] pointer-events-none"
      style={{ opacity: visible || progress > 0 ? 1 : 0 }}
    >
      <div
        className="h-full bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.4)]"
        style={{
          width: `${progress}%`,
          transition: progress === 0
            ? "none"
            : progress === 100
              ? "width 0.15s ease-out"
              : "width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <NavProgressInner />
    </Suspense>
  );
}
