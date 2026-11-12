"use client";

import * as React from "react";

import { SECTION_LABELS } from "./primitives";

export type PhoneSection = { id: string; label: string };

/** Phone only: the width below which the report shows one section at a time (Tailwind's md). */
const PHONE = "(max-width: 767.98px)";

/**
 * The stock page on a phone, folded into named sections: the price, the call
 * and the chart stay on top, and under them a sticky switcher shows one part
 * at a time (our view with what changed, key facts, the full report, alerts).
 *
 * The parts stay in the page. Each is marked `data-phone-section="<id>"` and
 * the report's root carries `data-phone-tab`; a CSS rule hides every part but
 * the chosen one below md. The server renders the first part chosen, so the
 * page does not jump when it hydrates. Wider screens show everything.
 *
 * A link to an anchor inside a hidden part (#read, #changed, #financials)
 * opens that part first, so in-page links keep working.
 */
export function PhoneSections({ sections, initial, className = "" }: { sections: PhoneSection[]; initial?: string; className?: string }) {
  const ids = sections.map((section) => section.id);
  const [active, setActive] = React.useState(initial ?? ids[0] ?? "");
  const bar = React.useRef<HTMLDivElement>(null);
  const key = ids.join(",");

  const show = React.useCallback((id: string) => {
    const root = bar.current?.closest<HTMLElement>("[data-phone-tab]");
    if (root) root.dataset.phoneTab = id;
    setActive(id);
  }, []);

  // Open the part that holds an anchor before the browser scrolls to it.
  React.useEffect(() => {
    const known = key.split(",");
    const partOf = (hash: string): string | null => {
      const id = decodeURIComponent(hash.replace(/^#/, ""));
      if (!id) return null;
      if (known.includes(id)) return id;
      // A section tab (#financials, #ownership) lives in the Report part, even before the tabs have streamed in.
      if (id in SECTION_LABELS && known.includes("report")) return "report";
      const target = document.getElementById(id) ?? document.getElementById(`tab-${id}`);
      return target?.closest<HTMLElement>("[data-phone-section]")?.dataset.phoneSection ?? null;
    };
    const onClick = (event: MouseEvent) => {
      if (!window.matchMedia(PHONE).matches) return;
      const link = (event.target as HTMLElement | null)?.closest?.("a[href^='#']");
      const part = link ? partOf(link.getAttribute("href") ?? "") : null;
      if (part && known.includes(part)) show(part);
    };
    const fromHash = () => {
      if (!window.matchMedia(PHONE).matches) return;
      const part = partOf(window.location.hash);
      if (part && known.includes(part)) show(part);
    };
    fromHash();
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", fromHash);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [key, show]);

  // Keep the chosen part's chip in view inside the row (a #financials link opens "Full report", the fourth chip).
  React.useEffect(() => {
    const row = bar.current?.querySelector<HTMLElement>("[role=tablist]");
    const chip = row?.querySelector<HTMLElement>("[aria-selected=true]");
    if (!row || !chip) return;
    const right = chip.offsetLeft + chip.offsetWidth + 24;
    if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
    else if (chip.offsetLeft < row.scrollLeft) row.scrollLeft = Math.max(0, chip.offsetLeft - 24);
  }, [active]);

  const choose = (id: string) => {
    show(id);
    // Bring the switcher back to the top only when it has scrolled away, so a tap never jumps the page down.
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    if (top <= 60) window.requestAnimationFrame(() => bar.current?.scrollIntoView({ block: "start" }));
  };

  // One rule per part: hide it below md unless it is the chosen one.
  const css = `@media ${PHONE} {${ids
    // Unquoted attribute values: the server escapes quotes inside <style>, which breaks hydration. Ids are plain words.
    .map((id) => `[data-phone-tab]:not([data-phone-tab=${id}]) [data-phone-section=${id}]{display:none!important}`)
    .join("")}}`;

  return (
    <div ref={bar} className={`${className} sticky top-[52px] z-30 -mx-2 scroll-mt-[52px] border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_94%,transparent)] backdrop-blur-xl md:hidden`}>
      <style>{css}</style>
      <div
        role="tablist"
        aria-label="Parts of this report"
        className="grid gap-1 px-2 py-1.5"
        style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
      >
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => choose(section.id)}
              className={`flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-full px-1 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
                current ? "bg-oa-fg font-medium text-oa-page" : "text-oa-fg hover:bg-oa-accent"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
