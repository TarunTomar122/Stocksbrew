import type { ReactNode } from "react";

import { ToneGlyph } from "@/components/oa/kit";

/**
 * Building blocks for the stock report, in the brew system: paper cards with a
 * hairline border, an uppercase mono label, tight rows, mono numbers.
 */

export const NUM = "oa-mono tabular-nums";
export const PROSE = "text-pretty text-[15px] leading-6 text-oa-fg/90";
export const MUTED = "text-[13px] leading-5 text-oa-muted-fg";

export const TONE_COLOR = {
  up: "var(--signal-bullish)",
  down: "var(--signal-bearish)",
  flat: "var(--oa-muted-fg)",
} as const;

export type Tone = keyof typeof TONE_COLOR;

// The good-or-bad cue lives in the shared kit so every page uses the same marks.
export { MarkSlot, ToneGlyph, Verdict } from "@/components/oa/kit";

export type SectionId =
  | "overview"
  | "financials"
  | "valuation"
  | "earnings"
  | "ownership"
  | "news"
  | "technicals"
  | "peers";

export const SECTION_LABELS: Record<SectionId, string> = {
  overview: "Overview",
  financials: "Financials",
  valuation: "Valuation",
  earnings: "Earnings",
  ownership: "Ownership",
  news: "News",
  technicals: "Technicals",
  peers: "Peers",
};

/** One card: a header strip with the label and an optional short note on the right. */
export function Panel({
  label,
  meta,
  id,
  children,
  className = "",
  bodyClassName = "",
}: {
  label?: ReactNode;
  /** Right side of the header: a unit, a period or a link. */
  meta?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      id={id}
      className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card text-oa-fg ${className}`}
    >
      {label || meta ? (
        <header className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-oa-border px-3.5 py-1.5 sm:px-4">
          {label ? <h3 className="oa-label min-w-0">{label}</h3> : <span />}
          {meta ? <div className="oa-mono min-w-0 text-[11px] leading-4 text-oa-muted-fg">{meta}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A top-level section of the report: the anchor the rail scrolls to, a title and its panels. */
export function ReportSection({
  id,
  title,
  lede,
  children,
}: {
  id: SectionId;
  title?: string;
  /** One sentence that says what the numbers below add up to. */
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} data-report-section={id} aria-labelledby={`${id}-title`} className="scroll-mt-[6.5rem] lg:scroll-mt-14">
      <header className="mb-2.5 flex flex-col gap-1 px-2 sm:px-0">
        <h2 id={`${id}-title`} className="text-[19px] font-medium leading-7 tracking-tight text-oa-fg">
          {title ?? SECTION_LABELS[id]}
        </h2>
        {lede ? <p className="max-w-[62ch] text-pretty text-[15px] leading-6 text-oa-muted-fg">{lede}</p> : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Label on the left, mono figure on the right. The basic terminal row. */
export function Row({
  label,
  value,
  sub,
  tone,
  title,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  /** Small note under the label. */
  sub?: ReactNode;
  /** Colours the figure itself. Only for signed changes (returns), where green and red are the convention. */
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <div
      title={title}
      className={`flex min-h-9 items-center justify-between gap-3 border-b border-oa-border px-3.5 py-1.5 text-[14px] leading-5 last:border-b-0 sm:px-4 ${className}`}
    >
      <span className="min-w-0 text-oa-muted-fg">
        {label}
        {sub ? <span className="block text-[12px] leading-4 text-oa-muted-fg">{sub}</span> : null}
      </span>
      <span className={`shrink-0 text-right ${NUM}`} style={tone ? { color: TONE_COLOR[tone] } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** A grid of label-over-figure cells, hairlines between them. */
export function StatGrid({
  items,
  columns = "grid-cols-2 sm:grid-cols-4",
}: {
  items: Array<{ label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; title?: string }>;
  columns?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden">
      {/* Hairlines are cell borders, pulled 1px past the clip so the outer edge never doubles up and a short last row stays paper. */}
      <dl className={`-mb-px -mr-px grid ${columns}`}>
        {items.map((item) => (
          <div key={item.label} title={item.title} className="min-w-0 border-b border-r border-oa-border px-3.5 py-2.5 sm:px-4">
            <dt className="truncate text-[12px] leading-4 text-oa-muted-fg">{item.label}</dt>
            <dd className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[15px] font-medium leading-6 text-oa-fg ${NUM}`}>
              <span className="truncate">{item.value}</span>
              {/* Only good and bad get a mark: a neutral mark next to a number reads as a minus sign. */}
              {item.tone && item.tone !== "flat" ? <ToneGlyph tone={item.tone} /> : null}
            </dd>
            {item.sub ? <dd className="truncate text-[12px] leading-4 text-oa-muted-fg">{item.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The quiet key facts under the chart: caption over figure, no boxes, in a
 * loose grid. Lighter and shorter than a StatGrid, so the facts support the
 * chart instead of matching it. Two columns on a phone, four from md.
 */
export function StatStrip({ items }: { items: Array<{ label: string; value: ReactNode; sub?: ReactNode }> }) {
  if (!items.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 px-3.5 py-3 sm:px-4 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-[12.5px] leading-4 text-oa-muted-fg">{item.label}</dt>
          <dd className={`mt-0.5 truncate text-[14px] leading-5 text-oa-fg ${NUM}`}>
            {item.value}
            {item.sub ? <span className="ml-1.5 font-sans text-[12.5px] text-oa-muted-fg">{item.sub}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Small mono tag for a state word: "PRO", "ADD", "NEW". */
export function Tag({ children, tone, className = "" }: { children: ReactNode; tone?: Tone | "primary"; className?: string }) {
  const color = tone === "primary" ? "var(--oa-primary)" : tone ? TONE_COLOR[tone] : "var(--oa-muted-fg)";
  return (
    <span
      className={`oa-mono inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-[11px] font-medium uppercase leading-none tracking-[0.06em] ${className}`}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** A sentence that says plainly what we do not have. */
export function Missing({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`px-3.5 py-3 text-[14px] leading-5 text-oa-muted-fg sm:px-4 ${className}`}>{children}</p>;
}

/** Text link with the sliding arrow. */
export function MoreLink({ href, children, external = false, className = "" }: { href: string; children: ReactNode; external?: boolean; className?: string }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`group/more inline-flex items-center gap-1 text-[13px] font-medium text-oa-primary outline-none hover:underline focus-visible:underline ${className}`}
    >
      {children}
      <span aria-hidden="true" className="transition-transform duration-200 group-hover/more:translate-x-0.5">
        {external ? "↗" : "→"}
      </span>
    </a>
  );
}

/** Native disclosure, styled. No client JavaScript. */
export function Details({ summary, children, className = "" }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group/details ${className}`}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3.5 py-1.5 text-[14px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:min-h-9 sm:px-4 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="oa-mono grid size-4 place-items-center text-[13px] leading-none text-oa-primary transition-transform duration-200 group-open/details:rotate-45"
        >
          +
        </span>
        {summary}
      </summary>
      <div className="border-t border-oa-border">{children}</div>
    </details>
  );
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
