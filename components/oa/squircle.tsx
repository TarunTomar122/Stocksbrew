import * as React from "react";

/**
 * The oa surface and the standard card.
 *
 * These were squircle-clipped plates in the first design language. The "brew"
 * system uses flat paper cards instead: a hairline border, a modest radius,
 * an uppercase mono label, and content that sits directly on the card. The
 * component names are kept because every page already imports them.
 *
 * Callers written for the old language pass arbitrary radius and clip-path
 * utilities (`rounded-[22px]`, `[--card-clip-radius:12px]`). Those are
 * stripped here so one definition of the card shape wins everywhere.
 */

const LEGACY_SHAPE_CLASS =
  /(?:^|\s)(?:[a-z]+:)?(?:rounded-\[[^\]\s]+\]|\[--card-clip-(?:radius|handle|path):[^\]\s]+\]|\[clip-path:[^\]\s]+\]|\[corner-shape:[^\]\s]+\])(?=\s|$)/g;

function cleanClassName(className: string | undefined): string {
  if (!className) return "";
  return className.replace(LEGACY_SHAPE_CLASS, " ").replace(/\s+/g, " ").trim();
}

export function SquircleSurface({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="oa-surface"
      className={`oa-surface relative flex min-w-0 flex-col bg-oa-card text-oa-fg ${cleanClassName(className)}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SquircleCardProps {
  /** Header label shown in the card's top strip. */
  title: React.ReactNode;
  /** Optional 16px header icon; tinted muted automatically. */
  icon?: React.ReactNode;
  /** The card's content, typically rows. */
  children: React.ReactNode;
  /** "See all" in the header strip; omit to hide it. */
  seeAllHref?: string;
  /** Label for the header link. Defaults to "See all". */
  seeAllLabel?: string;
  className?: string;
  /** Classes for the content area (e.g. a fixed height with scrolling). */
  contentClassName?: string;
}

export function SquircleCard({
  title,
  icon,
  children,
  seeAllHref,
  seeAllLabel = "See all",
  className,
  contentClassName,
}: SquircleCardProps) {
  return (
    <div
      data-slot="oa-card"
      className={`oa-surface relative flex min-w-0 flex-col overflow-hidden border border-oa-border bg-oa-card text-oa-fg shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-18px_rgba(40,25,5,0.35)] ${cleanClassName(className)}`}
    >
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h2 className="oa-label flex min-w-0 items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0">
          {icon}
          {title}
        </h2>
        {seeAllHref ? (
          <a
            href={seeAllHref}
            className="group/seeall -mr-1.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          >
            {seeAllLabel}
            <span
              aria-hidden="true"
              className="transition-transform duration-200 group-hover/seeall:translate-x-0.5"
            >
              →
            </span>
          </a>
        ) : null}
      </div>
      <div className={`min-w-0 border-t border-oa-border ${cleanClassName(contentClassName) || "py-1"}`}>
        {children}
      </div>
    </div>
  );
}

/** A standard card row: 36px tall, full-bleed hover wash, tabular numbers. */
export function SquircleCardRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-9 items-center justify-between gap-3 px-4 text-[15px] transition-colors hover:bg-oa-accent ${className ?? ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {value !== undefined ? (
        <span className="oa-mono shrink-0 tabular-nums text-oa-muted-fg">{value}</span>
      ) : null}
    </div>
  );
}
