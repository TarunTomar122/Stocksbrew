import * as React from "react";

/**
 * The OA surface: continuous-curvature (squircle) corners via a CSS `shape()`
 * clip-path, with `corner-shape: squircle` where the browser supports it.
 * Two custom properties parameterize the silhouette so one path serves every
 * size: `--card-clip-radius` (corner size) and `--card-clip-handle` (how far
 * the curve's control points sit from the corner).
 *
 * The standard mini card is a two-layer sandwich: a white frame (`p-1`) with
 * a title strip, holding a recessed grey inset with a FIXED height. Cards
 * never grow with their data; longer lists scroll inside the inset, so a
 * grid's baseline never breaks.
 */

const CARD_CLIP_PATH =
  "shape(from var(--card-clip-radius) 0px, line to calc(100% - var(--card-clip-radius)) 0px, curve to 100% var(--card-clip-radius) with calc(100% - var(--card-clip-handle)) 0px / 100% var(--card-clip-handle), line to 100% calc(100% - var(--card-clip-radius)), curve to calc(100% - var(--card-clip-radius)) 100% with 100% calc(100% - var(--card-clip-handle)) / calc(100% - var(--card-clip-handle)) 100%, line to var(--card-clip-radius) 100%, curve to 0px calc(100% - var(--card-clip-radius)) with var(--card-clip-handle) 100% / 0px calc(100% - var(--card-clip-handle)), line to 0px var(--card-clip-radius), curve to var(--card-clip-radius) 0px with 0px var(--card-clip-handle) / var(--card-clip-handle) 0px, close)";

type SquircleStyle = React.CSSProperties & {
  "--card-clip-handle"?: string;
  "--card-clip-path"?: string;
  "--card-clip-radius"?: string;
};

export function SquircleSurface({
  className,
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="squircle-surface"
      className={`relative flex min-w-0 flex-col rounded-[26px] bg-oa-card text-oa-fg [--card-clip-handle:2.25px] [--card-clip-radius:14px] [clip-path:var(--card-clip-path)] [corner-shape:squircle] sm:rounded-[50px] sm:[--card-clip-handle:3px] sm:[--card-clip-radius:20px] ${className ?? ""}`}
      style={{ "--card-clip-path": CARD_CLIP_PATH, ...style } as SquircleStyle}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SquircleCardProps {
  /** Header label shown in the frame's top strip. */
  title: React.ReactNode;
  /** Optional 16px header icon; tinted muted automatically. */
  icon?: React.ReactNode;
  /** The inset panel's content, typically 32px rows. */
  children: React.ReactNode;
  /** "See all" in the header strip; omit both to hide it. */
  seeAllHref?: string;
  className?: string;
  /** Override the inset (e.g. a different fixed height than `h-44`). */
  contentClassName?: string;
}

export function SquircleCard({
  title,
  icon,
  children,
  seeAllHref,
  className,
  contentClassName,
}: SquircleCardProps) {
  const seeAll =
    "group/seeall flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-oa-muted-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] hover:bg-oa-accent hover:text-oa-fg";
  const arrow = (
    <span
      aria-hidden="true"
      className="transition-transform duration-200 group-hover/seeall:translate-x-0.5"
    >
      ›
    </span>
  );
  return (
    <SquircleSurface
      className={`border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-2 pt-1.5">
        <h2 className="ml-1 flex min-w-0 items-center gap-2 text-sm font-medium text-oa-fg/80 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-oa-muted-fg">
          {icon}
          {title}
        </h2>
        {seeAllHref ? (
          <a href={seeAllHref} className={seeAll}>
            See all {arrow}
          </a>
        ) : null}
      </div>
      <SquircleSurface
        className={`overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg py-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px] ${
          contentClassName ?? ""
        }`}
      >
        {children}
      </SquircleSurface>
    </SquircleSurface>
  );
}

/** A standard inset row: 32px tall, full-bleed hover wash, tabular numbers. */
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
      className={`flex h-8 items-center justify-between gap-3 px-3.5 text-sm transition-colors hover:bg-oa-accent ${className ?? ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {value !== undefined ? (
        <span className="shrink-0 tabular-nums text-oa-muted-fg">{value}</span>
      ) : null}
    </div>
  );
}
