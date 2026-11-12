"use client";

import * as React from "react";

export type SectionLink = { id: string; label: string };

/**
 * The page's sections as one quiet row of links under the title, stuck to the top while the page scrolls (under the
 * app bar on a phone, where it scrolls sideways). The section in view reads darker; plain anchors, so it works before
 * the script loads too.
 */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [current, setCurrent] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sections = links.map((link) => document.getElementById(link.id)).filter((node): node is HTMLElement => node !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first section (in page order) that crosses the band near the top of the screen.
        setCurrent(sections.find((section) => visible.has(section.id))?.id ?? null);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [links]);
  return (
    <nav
      aria-label="Sections"
      className="sticky top-[52px] z-30 -mx-2 border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_90%,transparent)] px-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0"
    >
      <ul className="flex h-10 items-center gap-5 overflow-x-auto whitespace-nowrap text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={`#${link.id}`}
              aria-current={current === link.id ? "true" : undefined}
              className={`transition-colors hover:text-oa-fg ${current === link.id ? "text-oa-fg" : "text-oa-muted-fg"}`}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
