import type * as React from "react";

import { interTight } from "@/components/oa/font";

/**
 * The content frame every app page shares: cards run to 8px from the edge of
 * a phone (text outside a card adds its own px-2, so it sits at 16px), 24px
 * gutters from sm up. It lives here, not in ./index, so a loading file does
 * not pull in the whole kit; AppPage imports it from here.
 */
export const PAGE_PAD = "oa-page-frame px-2 pb-10 pt-3 sm:px-6 sm:pt-4 lg:pb-8 lg:pt-6";
/** The frame for a page of prose (docs, about, an article): nothing is a card, so the text keeps a 16px gutter on a phone. */
export const PAGE_PAD_PROSE = "oa-page-prose px-4 pb-10 pt-3 sm:px-6 sm:pt-4 lg:pb-8 lg:pt-6";

/**
 * What a page shows the instant it is clicked, before its data arrives.
 * Only the content area: the sidebar and tab bar belong to the shared layout
 * (app/(app)/layout.tsx) and are already on screen.
 */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-oa-accent motion-reduce:animate-none ${className}`} />;
}

/** A panel with its title strip and `rows` dense rows. The strip is the same 44px the real Panel uses. */
export function PanelGhost({
  rows,
  lines = 1,
  className = "",
}: {
  rows: number;
  /** 2 or 3 for rows that carry lines of detail under the title. */
  lines?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card ${className}`}>
      <div className="flex min-h-11 items-center border-b border-oa-border px-4 py-2">
        <Bar className="h-3 w-28" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`border-b border-oa-border px-4 last:border-b-0 ${lines === 1 ? "py-3" : lines === 2 ? "py-2.5" : "py-4"}`}>
          <div className="flex items-center gap-4">
            <Bar className="h-3.5 w-1/3" />
            <Bar className="ml-auto h-3 w-16" />
            <Bar className="h-3 w-12" />
          </div>
          {lines >= 2 ? <Bar className={`h-3 w-3/5 ${lines === 3 ? "mt-3.5" : "mt-2"}`} /> : null}
          {lines === 3 ? <Bar className="mt-3 h-3 w-4/5" /> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * PageHead's shape: one title row and, from sm up, one line of lede. `lede`
 * is the old line count: anything above zero draws the single line. `label`
 * and `meta` are accepted for older callers; the head has no eyebrow, and
 * the as-of text sits on the title row.
 */
export function PageHeadGhost({ lede = 1, meta = false }: { lede?: number; label?: boolean; meta?: boolean }) {
  return (
    <div className="mb-3 px-2 sm:mb-4 sm:px-0">
      <div className="flex h-6 items-center justify-between gap-4 sm:h-7">
        <Bar className="h-5 w-[22rem] max-w-[70%]" />
        {meta ? <Bar className="hidden h-3 w-40 sm:block" /> : null}
      </div>
      {lede > 0 ? (
        <div className="mt-1 hidden h-5 items-center sm:flex">
          <Bar className="h-3 w-[36rem] max-w-full" />
        </div>
      ) : null}
    </div>
  );
}

/** StatStrip's shape: the same grid, cell padding and line heights, so the numbers land where the bars were. */
export function StatStripGhost({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div
      className={`oa-surface grid grid-cols-2 overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none ${className}`}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="-mb-px -mr-px border-b border-r border-oa-border px-4 py-3">
          <Bar className="h-3 w-16" />
          <Bar className="mt-2 h-5 w-14" />
          <Bar className="mt-2 h-3 w-24 max-w-full" />
        </div>
      ))}
    </div>
  );
}

/** TabBar's shape: an underlined row 40px tall. */
export function TabRowGhost({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`-mx-2 mb-4 flex h-[41px] items-center gap-6 overflow-hidden border-b border-oa-border px-4 sm:mx-0 sm:px-0 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <Bar key={index} className="h-3.5 w-16 shrink-0" />
      ))}
    </div>
  );
}

/** Chips' shape: a wrapping row of 32px pills. */
export function ChipRowGhost({ count = 5, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <Bar key={index} className={`h-8 rounded-md ${index % 3 === 0 ? "w-14" : index % 3 === 1 ? "w-24" : "w-20"}`} />
      ))}
    </div>
  );
}

/** The page frame for a hand-shaped skeleton: chrome plus the same content frame AppPage uses, with nothing awaited. */
export function SkeletonFrame({
  children,
  width = "wide",
  className = "",
  label,
}: {
  children: React.ReactNode;
  /** Same widths as AppPage ("dash": the 90rem 12-column frame). */
  width?: "wide" | "read" | "dash";
  /** Same escape hatch as AppPage: a page that narrows its frame passes the same class here. */
  className?: string;
  /** What is loading, for screen readers. */
  label?: string;
}) {
  const max = width === "read" ? "max-w-[47rem]" : width === "dash" ? "max-w-[90rem]" : "max-w-[84rem]";
  return (
    <main
      className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}
      aria-busy={label ? "true" : undefined}
      aria-label={label}
    >
      <div className={`mx-auto w-full ${max} ${width === "read" ? PAGE_PAD_PROSE : PAGE_PAD} ${className}`}>{children}</div>
    </main>
  );
}

/** A whole page's loading state: chrome, a page head, and panels shaped like the page. */
export function AppPageSkeleton({
  label,
  shape = "table",
  width = "wide",
}: {
  /** What is loading, for screen readers: "Loading the screener". */
  label: string;
  /** "table": one long panel. "panels": a stat strip and two columns. "read": prose. */
  shape?: "table" | "panels" | "read";
  width?: "wide" | "read";
}) {
  const max = width === "read" ? "max-w-[47rem]" : "max-w-[84rem]";
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`} aria-busy="true" aria-label={label}>
      <div className={`mx-auto w-full ${max} ${width === "read" || shape === "read" ? PAGE_PAD_PROSE : PAGE_PAD}`}>
        <PageHeadGhost />
        {shape === "read" ? (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 9 }, (_, index) => (
              <Bar key={index} className={`h-4 ${index % 3 === 2 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        ) : shape === "panels" ? (
          <>
            <div className="oa-surface grid grid-cols-2 overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="border-r border-oa-border px-4 py-3 last:border-r-0">
                  <Bar className="h-3 w-16" />
                  <Bar className="mt-2 h-6 w-20" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <PanelGhost rows={6} />
              <PanelGhost rows={6} />
            </div>
          </>
        ) : (
          <div>
            <PanelGhost rows={12} />
          </div>
        )}
      </div>
    </main>
  );
}
