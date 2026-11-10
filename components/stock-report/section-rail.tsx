"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The sticky section tabs. On a phone they are a horizontally scrollable strip
 * pinned under the top bar (the bottom tab bar is fixed, so the strip stays at
 * the top and never meets it). Links are plain anchors, so they work before
 * hydration; the scroll listener only keeps the active tab in step.
 */
export function SectionRail({ sections }: { sections: Array<{ id: string; label: string; count?: number | null }> }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const strip = useRef<HTMLDivElement>(null);
  const ids = sections.map((section) => section.id).join(",");

  useEffect(() => {
    const targets = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!targets.length) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      // The active section is the last one whose top has passed the reading line.
      const line = 180;
      let current = targets[0]!.id;
      for (const node of targets) {
        if (node.getBoundingClientRect().top <= line) current = node.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids]);

  // Keep the active chip in view inside the strip without moving the page.
  useEffect(() => {
    const container = strip.current;
    const chip = container?.querySelector<HTMLElement>(`[data-rail="${active}"]`);
    if (!container || !chip) return;
    const left = chip.offsetLeft - 12;
    const right = chip.offsetLeft + chip.offsetWidth + 12;
    if (left < container.scrollLeft) container.scrollTo({ left, behavior: "smooth" });
    else if (right > container.scrollLeft + container.clientWidth) container.scrollTo({ left: right - container.clientWidth, behavior: "smooth" });
  }, [active]);

  return (
    <nav
      aria-label="Report sections"
      className="sticky top-[52px] z-30 -mx-2 border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_92%,transparent)] backdrop-blur-xl sm:-mx-6 lg:top-0 lg:mx-0"
    >
      <div
        ref={strip}
        className="flex gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] sm:px-6 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              data-rail={section.id}
              aria-current={current ? "true" : undefined}
              className={`relative flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[14px] font-medium outline-none transition-colors focus-visible:bg-oa-accent ${
                current ? "text-oa-fg" : "text-oa-muted-fg hover:text-oa-fg"
              }`}
            >
              {section.label}
              {section.count ? <span className="oa-mono text-[11px] text-oa-muted-fg">{section.count}</span> : null}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-oa-primary transition-opacity ${current ? "opacity-100" : "opacity-0"}`}
              />
            </a>
          );
        })}
      </div>
    </nav>
  );
}
