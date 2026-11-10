import * as React from "react";

import { AppPage, FOCUS } from "@/components/oa/kit";

export type TocEntry = { id: string; label: string };

/**
 * A long single page with its own contents list: sticky on the left at lg
 * and up, folded above the page below that. Used by Developers, Security
 * and Account.
 */
export function SideTocPage({
  toc,
  label = "On this page",
  children,
  footer,
}: {
  toc: TocEntry[];
  label?: string;
  children: React.ReactNode;
  /** Extra links under the contents list, such as "Back to docs". */
  footer?: React.ReactNode;
}) {
  return (
    <AppPage width="wide" prose>
      <div className="lg:grid lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-x-10">
        <aside className="hidden lg:block">
          <nav aria-label={label} className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-6">
            <p className="oa-caption mb-2">{label}</p>
            <ul className="border-l border-oa-border">
              {toc.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className={`-ml-px block border-l border-transparent py-1 pl-3 text-[14px] leading-5 text-oa-muted-fg hover:border-oa-primary hover:text-oa-fg ${FOCUS}`}
                  >
                    {entry.label}
                  </a>
                </li>
              ))}
            </ul>
            {footer ? <div className="mt-4 text-[14px] leading-5 text-oa-muted-fg">{footer}</div> : null}
          </nav>
        </aside>
        <div className="min-w-0 max-w-[54rem]">
          <details className="oa-surface mb-5 border border-oa-border bg-oa-card lg:hidden">
            <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <span className="oa-caption">{label}</span>
              <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{toc.length} sections</span>
            </summary>
            <ol className="border-t border-oa-border px-3 py-2">
              {toc.map((entry, index) => (
                <li key={entry.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] py-0.5">
                  <span className="oa-mono pt-0.5 text-[12.5px] tabular-nums text-oa-muted-fg">{index + 1}</span>
                  <a href={`#${entry.id}`} className={`rounded text-[14px] leading-6 text-oa-fg hover:underline ${FOCUS}`}>
                    {entry.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>
          {children}
        </div>
      </div>
    </AppPage>
  );
}

/** A titled part of a long page. The heading anchors and clears the mobile top bar. */
export function PageSection({
  id,
  title,
  lede,
  children,
  className = "",
}: {
  id: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-24 border-t border-oa-border pt-7 ${className}`}>
      <h2 id={`${id}-h`} className="text-[21px] font-medium leading-7 tracking-tight text-oa-fg">
        {title}
      </h2>
      {lede ? <p className="mt-1.5 max-w-[41rem] text-pretty text-[15.5px] leading-6 text-oa-muted-fg">{lede}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Body text for the long pages, matching the docs rhythm. */
export function Prose({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`max-w-[41rem] text-pretty text-[16px] leading-7 text-oa-fg/90 ${className}`}>{children}</p>;
}

export const TEXT_LINK = `font-medium text-oa-fg underline decoration-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] decoration-1 underline-offset-[3px] hover:decoration-oa-primary rounded-sm ${FOCUS}`;

/** Label and value rows inside a hairline card. */
export function FactList({ rows }: { rows: [label: React.ReactNode, value: React.ReactNode][] }) {
  return (
    <dl className="oa-surface border border-oa-border bg-oa-card">
      {rows.map(([label, value], index) => (
        <div key={index} className="grid gap-x-5 gap-y-0.5 border-b border-oa-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt className="text-[14.5px] font-medium leading-6 text-oa-fg">{label}</dt>
          <dd className="min-w-0 text-pretty text-[14.5px] leading-6 text-oa-fg/85">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
