"use client";

import { useState } from "react";

import { SquircleSurface } from "@/components/oa/squircle";
import { StockLogo } from "@/components/stock-logo";

import { LABEL } from "./shared";

export type IdeaBookLine = {
  ticker: string;
  company: string;
  role: string;
  why: string;
  breaks: string;
  label: string;
};

export type IdeaBookTheme = {
  slug: string;
  name: string;
  description: string;
  lines: IdeaBookLine[];
  total: number;
};

/** Phones get a shorter list; the full idea is one tap away. */
const MOBILE_LINES = 3;

function labelTone(label: string): string {
  const value = label.toLowerCase();
  if (value.includes("strong")) return "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
  if (value.includes("weak") || value.includes("avoid")) return "bg-red-600/10 text-red-800 dark:text-red-300";
  return "bg-oa-accent text-oa-muted-fg";
}

/**
 * An idea on the left, the names that express it on the right. Each line says
 * what the company does in the idea, why it fits, and what would break the
 * case, which is the part most lists leave out.
 */
export function IdeaBook({ themes }: { themes: IdeaBookTheme[] }) {
  const [active, setActive] = useState(0);
  const theme = themes[active] ?? themes[0];
  if (!theme) return null;

  return (
    <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-1 gap-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* the idea picker */}
        <div className="flex flex-col p-3 sm:p-4">
          <p className={LABEL}>Pick an idea</p>
          <div
            role="tablist"
            aria-label="Investment ideas"
            className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {themes.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.slug}
                  type="button"
                  role="tab"
                  id={`idea-tab-${item.slug}`}
                  aria-selected={selected}
                  aria-controls="idea-book-panel"
                  onClick={() => setActive(index)}
                  className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 py-2 text-left text-[15px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] lg:rounded-[14px] ${
                    selected
                      ? "bg-oa-secondary font-medium text-oa-fg"
                      : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <p className="mt-4 hidden text-[15px] leading-6 text-oa-muted-fg lg:block">{theme.description}</p>
        </div>

        {/* the book */}
        <SquircleSurface
          id="idea-book-panel"
          role="tabpanel"
          aria-labelledby={`idea-tab-${theme.slug}`}
          className="rounded-[22px] bg-oa-bg p-2 [--card-clip-radius:12px] sm:rounded-[44px] sm:p-2.5 sm:[--card-clip-radius:17px]"
        >
          <p className="px-2 pb-2 pt-1 text-[15px] leading-6 text-oa-muted-fg lg:hidden">{theme.description}</p>
          <ul className="flex flex-col gap-1.5">
            {theme.lines.map((line, index) => (
              <li key={line.ticker} className={index >= MOBILE_LINES ? "hidden md:block" : undefined}>
                <a
                  href={`/stock/${line.ticker}`}
                  className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-[16px] border border-oa-border bg-oa-card px-3.5 py-3 outline-none transition-colors hover:border-oa-fg/25 focus-visible:border-oa-fg/40 md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <StockLogo ticker={line.ticker} size={26} circle className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="oa-mono text-[15px] text-oa-fg">{line.ticker}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[12px] ${labelTone(line.label)}`}>
                          {line.label}
                        </span>
                      </span>
                      <span className="block truncate text-[14px] leading-5 text-oa-muted-fg">
                        {line.role}
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 text-[15px] leading-6 text-oa-fg/85">
                    <span className={`${LABEL} mb-0.5 block`}>Why it fits</span>
                    {line.why}
                  </span>
                  <span className="min-w-0 text-[15px] leading-6 text-oa-muted-fg">
                    <span className={`${LABEL} mb-0.5 block`}>What breaks it</span>
                    {line.breaks}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-1 pt-3">
            <p className="text-[14px] text-oa-muted-fg">
              A few of the {theme.total} names in this idea. Research, not a recommendation.
            </p>
            <a
              href={`/themes/${theme.slug}`}
              className="group/open inline-flex items-center gap-1.5 text-[15px] font-medium text-oa-fg"
            >
              Open the full idea
              <span aria-hidden="true" className="transition-transform duration-200 group-hover/open:translate-x-0.5">
                →
              </span>
            </a>
          </div>
        </SquircleSurface>
      </div>
    </SquircleSurface>
  );
}
