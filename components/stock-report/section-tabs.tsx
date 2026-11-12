"use client";

import * as React from "react";

type Tab = { id: string; label: string; count?: number | null };

/**
 * The report's deeper sections as tabs: one section on screen at a time, so
 * the page is the call, the chart and the read, then whichever part the
 * reader picks. A link to a section's hash opens its tab.
 *
 * Only the first tab is in the page as sent. The rest are drawn here, from
 * data the page already holds: the one picked at once, and the others one
 * by one while the browser is idle, so each is in the page (hidden) soon
 * after load and a tap shows it with no wait. Sending all eight as markup
 * was most of every stock page's weight.
 */
export function SectionTabs({ sections, renderPanel }: { sections: Tab[]; renderPanel: (id: string) => React.ReactNode }) {
  const ids = sections.map((section) => section.id);
  const [active, setActive] = React.useState(ids[0] ?? "");
  const [drawn, setDrawn] = React.useState<ReadonlySet<string>>(() => new Set(ids.slice(0, 1)));
  const strip = React.useRef<HTMLDivElement>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const key = ids.join(",");

  // The chosen tab is drawn on the render that shows it (below), then kept.
  React.useEffect(() => {
    setDrawn((current) => (current.has(active) ? current : new Set(current).add(active)));
  }, [active]);

  // The others, one per idle moment, so drawing them never holds up a tap or a scroll.
  const missing = ids.some((id) => !drawn.has(id));
  React.useEffect(() => {
    if (!missing) return;
    const known = key.split(",");
    const drawOne = () =>
      setDrawn((current) => {
        const id = known.find((candidate) => !current.has(candidate));
        return id ? new Set(current).add(id) : current;
      });
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(drawOne, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(drawOne, 400);
    return () => window.clearTimeout(handle);
  }, [drawn, missing, key]);

  React.useEffect(() => {
    const known = key.split(",");
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!known.includes(hash)) return;
      setActive(hash);
      window.requestAnimationFrame(() => root.current?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [key]);

  // Keep the chosen tab in view inside the strip without moving the page.
  React.useEffect(() => {
    const container = strip.current;
    const chip = container?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!container || !chip) return;
    const left = chip.offsetLeft - 12;
    const right = chip.offsetLeft + chip.offsetWidth + 12;
    if (left < container.scrollLeft) container.scrollTo({ left, behavior: "smooth" });
    else if (right > container.scrollLeft + container.clientWidth) container.scrollTo({ left: right - container.clientWidth, behavior: "smooth" });
  }, [active]);

  const choose = (id: string) => {
    setActive(id);
    // Keep the router's history state: a null state here makes Back from the next page a no-op in the app router.
    window.history.replaceState(window.history.state, "", `#${id}`);
    const top = root.current?.getBoundingClientRect().top ?? 0;
    // Only scroll back up when the tabs have scrolled away; a tap near the strip keeps the page still.
    if (top < 0) root.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div ref={root} className="scroll-mt-[101px] md:scroll-mt-14 lg:scroll-mt-2">
      <nav
        aria-label="Report sections"
        className="sticky top-[101px] z-20 -mx-2 md:top-[52px] md:z-30 border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_92%,transparent)] backdrop-blur-xl sm:-mx-6 lg:top-0 lg:mx-0"
      >
        <div ref={strip} role="tablist" className="oa-scroll-fade flex gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] sm:px-6 lg:px-0 [&::-webkit-scrollbar]:hidden">
          {sections.map((section) => {
            const current = section.id === active;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                role="tab"
                aria-selected={current}
                aria-controls={`tab-${section.id}`}
                data-tab={section.id}
                onClick={(event) => {
                  event.preventDefault();
                  choose(section.id);
                }}
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
      {ids.map((id) => (
        <div key={id} id={`tab-${id}`} role="tabpanel" hidden={id !== active} className="pt-4">
          {drawn.has(id) || id === active ? renderPanel(id) : null}
        </div>
      ))}
    </div>
  );
}
