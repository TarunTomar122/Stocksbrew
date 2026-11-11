import * as React from "react";

import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { uiFont } from "@/components/oa/font";
import { AppLink } from "@/components/oa/app-link";

/** The app shell every markets page sits in: site chrome, paper background, the standard frame. */
export function MarketsPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className={`oa-landing ${uiFont.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className="oa-page-frame mx-auto flex w-full max-w-[76rem] flex-col gap-4 px-2 pb-24 pt-3 sm:px-6 sm:pt-4 lg:pb-10 lg:pt-6">{children}</div>
    </main>
  );
}

/** "Markets / ETFs / SPY" */
export function Crumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12.5px] leading-4 text-oa-muted-fg">
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {item.href ? (
            <AppLink href={item.href} className="underline decoration-oa-border underline-offset-2 outline-none hover:text-oa-fg focus-visible:text-oa-fg">
              {item.label}
            </AppLink>
          ) : (
            <span aria-current="page" className="text-oa-fg">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

type StatProps = { label: string; value: React.ReactNode; sub?: React.ReactNode; title?: string };

function hasValue(value: React.ReactNode): boolean {
  return value !== null && value !== undefined && value !== "";
}

/** A labelled figure in a stat grid. Renders nothing when the value is unknown. */
export function Stat({ label, value, sub, title }: StatProps) {
  if (!hasValue(value)) return null;
  return (
    <div
      className="flex min-w-0 grow basis-1/2 flex-col gap-0.5 px-4 py-3 shadow-[1px_0_0_0_var(--oa-border),0_1px_0_0_var(--oa-border)] sm:basis-1/3 lg:basis-[calc(100%/var(--stat-cols))]"
      title={title}
    >
      <dt className="oa-caption truncate">{label}</dt>
      <dd className="oa-mono truncate text-[15px] font-medium leading-[22px] tabular-nums text-oa-fg">{value}</dd>
      {sub ? <dd className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{sub}</dd> : null}
    </div>
  );
}

/**
 * Stats in rows that always fill. Unknown stats render nothing, so the grid
 * counts the ones that will show and splits them into even rows of up to six;
 * a short last row stretches across instead of leaving empty boxes.
 */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const shown = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && hasValue((child.props as StatProps).value),
  ).length;
  if (shown === 0) return null;
  const cols = Math.ceil(shown / Math.ceil(shown / 6));
  return (
    <dl
      className="oa-surface flex flex-wrap overflow-hidden border border-oa-border bg-oa-card"
      style={{ "--stat-cols": cols } as React.CSSProperties}
    >
      {children}
    </dl>
  );
}

export function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3 px-2 sm:px-0">
      <h2 className="oa-label">{children}</h2>
      {aside ? <span className="text-[12.5px] text-oa-muted-fg">{aside}</span> : null}
    </div>
  );
}
