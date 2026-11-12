import Link from "next/link";
import * as React from "react";

import { interTight } from "@/components/oa/font";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PageIcon, PlaceTrail } from "@/components/oa/place-nav";
import { StockLogo } from "@/components/stock-logo";
import { stampWords } from "@/lib/day-words";
import { shortCompanyName } from "@/lib/plain-copy";

import { PAGE_PAD, PAGE_PAD_PROSE } from "./skeleton";
import { AppLink } from "@/components/oa/app-link";
import { Delta, NUM, Sparkline, Tag, fmtDay, toneOf, toneText, type TagTone } from "./cells";

// The atoms live in ./cells (no server imports) so client tables can use them; pages keep importing them from here.
export { Delta, NUM, Sparkline, Tag, fmtDay, toneOf, toneText, type TagTone };

/**
 * The page kit. Every app page is assembled from these so the product reads
 * as one terminal: compact page head, underline tabs, hairline panels, dense
 * rows, mono numbers.
 *
 * Type: 12.5 meta and caption, 14 body and table, 15 emphasis, 17 panel lead,
 * 22 page title, 28 to 34 for the one hero number on a page. Space: 4, 8, 12,
 * 16, 24, 32. Copper is for the primary button, the active tab, links and one
 * key tag; titles are ink (.oa-label), captions are muted mono (.oa-caption). If a page needs something that is not here, add it here
 * rather than styling it locally.
 */

export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/* ── Shell ─────────────────────────────────────────────────────────────── */

// The content frame every app page shares. Defined once, in ./skeleton, so loading files can use it without the whole kit.
export { PAGE_PAD };

type HeadNote = { lede?: React.ReactNode; meta?: React.ReactNode; note?: boolean; full?: boolean; className?: string };

/**
 * Finds the PageHead among a page's children so its full lede and source can
 * be printed in the page note at the bottom. It follows `children` through
 * fragments, elements and wrappers; a PageHead created inside another
 * component's render is out of reach, and that head prints its own copy.
 */
function findHead(node: React.ReactNode, depth = 0): HeadNote | null {
  if (node == null || typeof node !== "object" || depth > 16) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findHead(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.type === PageHead) return node.props as HeadNote;
  return findHead((node.props as { children?: React.ReactNode }).children, depth + 1);
}

/** The whole page: tokens, font, site chrome, the content frame and the page note. */
export function AppPage({
  children,
  width = "wide",
  prose = width === "read",
  className = "",
}: {
  children: React.ReactNode;
  /** "wide" for tables and dashboards, "read" for prose. */
  width?: "wide" | "read" | "full";
  /**
   * The page is mostly text that sits straight on the page (docs, an
   * article), so a phone keeps a 16px gutter instead of the 8px that lets
   * cards run wide. On by default for "read".
   */
  prose?: boolean;
  className?: string;
}) {
  const max = width === "read" ? "max-w-[47rem]" : width === "full" ? "max-w-none" : "max-w-[84rem]";
  const head = findHead(children);
  const noted = head != null && head.note !== false && !head.full && (head.lede != null || head.meta != null);
  // The head shows the full lede from sm up unless the page hides it there, so the note only repeats it on a phone.
  const ledeInHead = noted && head.lede != null && !String(head.className ?? "").includes("oa-head-lede]:hidden");
  // A page that hides the title row's as-of time on a phone (the screener) keeps it in the note, or a phone shows it nowhere.
  const compactShown = !String(head?.className ?? "").includes("oa-head-compact]:hidden");
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className={`mx-auto w-full ${max} ${prose ? PAGE_PAD_PROSE : PAGE_PAD} ${noted ? "oa-has-note" : ""} ${className}`}>
        {children}
        {noted ? <PageNote lede={head.lede} source={compactShown ? noteMeta(head.meta) : head.meta} ledeInHead={ledeInHead} /> : null}
      </div>
    </main>
  );
}

/**
 * The source line for the page note, without the part the title row already shows (`compactMeta`): the head says
 * "as of 9:10 AM ET", so the note does not say it again (Nov 11). Null when nothing else is left.
 */
function noteMeta(meta: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(meta) || meta.type !== SourceLine) return meta;
  const props = meta.props as { asOf?: React.ReactNode; source?: React.ReactNode; note?: React.ReactNode };
  const rest = props.asOf ? { ...props, asOf: undefined } : props.source ? { ...props, source: undefined } : { ...props, note: undefined };
  if (!rest.asOf && !rest.source && !rest.note) return null;
  return React.cloneElement(meta as React.ReactElement<typeof props>, rest);
}

/** The short form of a provenance line for the title row: the as-of time if there is one, else the source. */
function compactMeta(meta: React.ReactNode): React.ReactNode {
  if (React.isValidElement(meta) && meta.type === SourceLine) {
    const { asOf, source, note } = meta.props as { asOf?: React.ReactNode; source?: React.ReactNode; note?: React.ReactNode };
    if (asOf) return <>as of {asOf}</>;
    return source ?? note ?? null;
  }
  return meta;
}

/**
 * Compact page head: one title row with the as-of time on its right, and the
 * muted line of what the page is under it (desktop only; it wraps, never
 * cut). A deep page gets the way back above its title from the address
 * (PlaceTrail: "Research › NVDA"), the same on every page; `crumb` is only shown outside the app's
 * places (docs, error pages).
 *
 * The full lede and the full source line are never dropped. AppPage prints
 * them in the page note at the bottom of the page; a page with its own frame
 * passes `note={false}` and places <PageNote /> itself. A page whose lede is
 * the point (a consent screen, an error) passes `full` and keeps it all in
 * the head.
 */
export function PageHead({
  crumb,
  title,
  lede,
  actions,
  meta,
  note = true,
  full = false,
  inline = false,
  className = "",
}: {
  /** Keep `actions` on the title row on a phone too (for one short control, e.g. a view switch). */
  inline?: boolean;
  /** No longer shown. Kept so callers still compile; use `crumb` for a way back. */
  label?: React.ReactNode;
  /** A short line above the title on pages outside the app's places ("Part 2 of 6"). Inside them the trail comes from the address. */
  crumb?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  /** A short line under the lede, e.g. <SourceLine asOf=... /> for live data. */
  meta?: React.ReactNode;
  /** false when the page places its own <PageNote /> (pages that do not use AppPage). */
  note?: boolean;
  /** Keep the whole lede and source in the head, and print no page note. */
  full?: boolean;
  className?: string;
}) {
  const compact = meta ? compactMeta(meta) : null;
  return (
    <header className={`mb-3 px-2 sm:mb-4 sm:px-0 ${note || full ? "" : "oa-has-note"} ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:flex-nowrap">
        <div className={`min-w-0 flex-1 ${inline ? "basis-0" : "basis-full sm:basis-0"}`}>
          <PlaceTrail crumb={crumb} />
          <div className="flex items-center gap-2.5">
            <PageIcon />
            <h1 className="min-w-0 text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">{title}</h1>
          </div>
        </div>
        {compact ? (
          <div className="oa-head-compact min-w-0 max-w-full text-pretty text-[12.5px] leading-4 text-oa-muted-fg sm:max-w-[45%] sm:shrink-0 sm:text-right">
            {compact}
          </div>
        ) : null}
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {lede ? <p className="oa-head-lede mt-1 max-w-4xl text-pretty text-[14px] leading-5 text-oa-muted-fg">{lede}</p> : null}
      {(note || full) && meta ? <div className="oa-head-fallback mt-1">{meta}</div> : null}
    </header>
  );
}

/**
 * "About this page": the full description and the full source line, at the
 * bottom of the page so the data can start at the top. AppPage renders it
 * from the PageHead it finds.
 */
export function PageNote({
  lede,
  source,
  ledeInHead = false,
  className = "",
}: {
  lede?: React.ReactNode;
  /** Usually the same <SourceLine /> the head was given. */
  source?: React.ReactNode;
  /**
   * The PageHead above already shows this lede in full from sm up (it is only
   * hidden on a phone), so the note prints it on a phone only, and drops out
   * on desktop when there is no source line left to show.
   */
  ledeInHead?: boolean;
  className?: string;
}) {
  if (!lede && !source) return null;
  const desktopEmpty = ledeInHead && !source;
  return (
    <aside
      aria-label="About this page"
      className={`mt-8 flex flex-col gap-2 border-t border-oa-border px-2 pt-4 sm:px-0 ${desktopEmpty ? "sm:hidden" : ""} ${className}`}
    >
      <p className="oa-caption">About this page</p>
      {lede ? <p className={`max-w-3xl text-pretty text-[14px] leading-5 text-oa-muted-fg ${ledeInHead ? "sm:hidden" : ""}`}>{lede}</p> : null}
      {source}
    </aside>
  );
}

/**
 * A small mono line under a block: "as of 4:00 PM ET" and/or a short note.
 * Use the time only where freshness changes the reader's decision (live prices,
 * movers). Vendor names and how the data is made do not belong here.
 */
export function SourceLine({
  source,
  asOf,
  href,
  note,
  className = "",
}: {
  source?: React.ReactNode;
  asOf?: React.ReactNode;
  href?: string;
  note?: React.ReactNode;
  className?: string;
}) {
  const parts = [
    source ? (
      href ? (
        <a key="s" href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          {source}
        </a>
      ) : (
        <span key="s">{source}</span>
      )
    ) : null,
    asOf ? <span key="a">as of {asOf}</span> : null,
    note ? <span key="n">{note}</span> : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[18px] text-oa-muted-fg ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </React.Fragment>
      ))}
    </p>
  );
}

/* ── Navigation inside a page ──────────────────────────────────────────── */

export type TabItem = { label: React.ReactNode; href: string; id: string; count?: number | null };

/** Underline tabs driven by the URL (links, not state), scrollable on phones. */
export function TabBar({ tabs, current, className = "" }: { tabs: TabItem[]; current: string; className?: string }) {
  return (
    <nav
      aria-label="Sections"
      className={`oa-tabbar oa-scroll-fade -mx-2 mb-4 flex gap-6 overflow-x-auto border-b border-oa-border px-4 pr-8 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 text-[14px] transition-colors ${FOCUS} ${
              active
                ? "border-oa-primary font-medium text-oa-fg"
                : "border-transparent text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            {tab.label}
            {tab.count != null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A small segmented switch driven by the URL: two to four views of the same
 * page ("Week / Month / List"). Sits in a PageHead's `actions` so a view
 * switch does not cost a row of its own.
 */
export function Segmented({
  items,
  current,
  label = "View",
  className = "",
}: {
  items: TabItem[];
  current: string;
  /** Accessible name of the group. */
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={`inline-flex h-10 shrink-0 items-stretch rounded-md border border-oa-border bg-oa-bg p-0.5 lg:h-8 ${className}`}>
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 text-[14px] transition-colors ${FOCUS} ${
              active ? "bg-oa-card font-medium text-oa-fg shadow-[0_0_0_1px_var(--oa-border)]" : "text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            {item.label}
            {item.count != null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export type ChipItem = { label: React.ReactNode; href: string; id: string; count?: number | null };

/** Filter chips driven by the URL. */
export function Chips({ items, current, className = "" }: { items: ChipItem[]; current: string; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "true" : undefined}
            className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors ${FOCUS} ${
              active
                ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg"
                : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
            }`}
          >
            {item.label}
            {item.count != null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{item.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

/** A hairline card with an optional title strip (44px). `flush` removes body padding for rows and tables. */
export function Panel({
  label,
  right,
  children,
  flush = false,
  fill = false,
  className = "",
  id,
}: {
  label?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  /**
   * Stretch to the height of the row it sits in (cards side by side end at
   * the same line). Give the last child `mt-auto` to pin it to the bottom.
   */
  fill?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`oa-surface min-w-0 scroll-mt-20 overflow-hidden border border-oa-border bg-oa-card ${fill ? "flex h-full flex-col" : ""} ${className}`}
    >
      {label || right ? (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
          {label ? <h2 className="oa-label min-w-0 truncate">{label}</h2> : <span />}
          {right ? <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-oa-muted-fg">{right}</div> : null}
        </div>
      ) : null}
      <div className={`${flush ? "" : "p-4"} ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>{children}</div>
    </section>
  );
}

const CARD_COLS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 xl:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
} as const;

/**
 * Cards side by side. The one rule for every multi-column card layout: cards
 * in the same row are the same height and each card's footer sits on its
 * bottom edge, so footers and gaps line up across the row. Children are
 * cards (Panel, SquircleCard, an `.oa-surface`), or a wrapper holding exactly
 * one card (a Reveal); either way the card is stretched to the row
 * (`.oa-card-grid` in globals.css). Inside a card, mark the footer
 * `oa-card-foot` (or give it `mt-auto`) so it pins to the bottom.
 */
export function CardGrid({
  cols = 2,
  children,
  className = "",
  as: Tag = "div",
}: {
  cols?: keyof typeof CARD_COLS;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol";
}) {
  return <Tag className={`oa-card-grid grid grid-cols-1 gap-3 ${CARD_COLS[cols]} ${className}`}>{children}</Tag>;
}

export type StatItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "up" | "down" | "flat";
};

/** A strip of headline numbers divided by hairlines. */
export function StatStrip({ stats, className = "" }: { stats: StatItem[]; className?: string }) {
  if (stats.length === 0) return null;
  return (
    <dl
      className={`oa-surface grid grid-cols-2 overflow-hidden border border-oa-border bg-oa-card max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none ${className}`}
    >
      {stats.map((stat, index) => (
        <div key={index} className="-mb-px -mr-px border-b border-r border-oa-border px-4 py-3">
          <dt className="oa-caption">{stat.label}</dt>
          <dd className={`${NUM} mt-1 text-[17px] font-medium leading-6 ${toneText(stat.tone)}`}>{stat.value}</dd>
          {stat.sub ? <dd className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{stat.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Says plainly that there is nothing, and why. Never a zero standing in for unknown. */
export function Empty({ title, children, className = "" }: { title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`px-4 py-8 text-center ${className}`}>
      {title ? <p className="text-[15px] font-medium text-oa-fg">{title}</p> : null}
      {children ? <p className="mx-auto mt-1 max-w-md text-pretty text-[14px] leading-5 text-oa-muted-fg">{children}</p> : null}
    </div>
  );
}

/* ── Atoms ─────────────────────────────────────────────────────────────── */

// The good-or-bad marks live in ./tone (no server imports) so client components can import them directly.
export { MarkSlot, MoveBar, ToneGlyph, Verdict } from "./tone";
export { ShowMore } from "./more";

/** Logo, ticker and (optionally) the company name, linking to the stock page. */
export function Ticker({
  symbol,
  name,
  href,
  size = 20,
  wrap = false,
  stretch = false,
  className = "",
}: {
  symbol: string;
  name?: string | null;
  /**
   * Make the whole row clickable: the link's hit area stretches over the
   * nearest `relative` ancestor (the row). Other links in that row need
   * `relative z-[1]` to stay on top.
   */
  stretch?: boolean;
  /** No longer used: names stay on one line everywhere (owner rule). Kept so callers still compile. */
  wrap?: boolean;
  /** Defaults to the stock page; pass `null` for no link. */
  href?: string | null;
  size?: number;
  className?: string;
}) {
  // A name that only repeats the ticker ("TTWO TTWO") says nothing; leave it out.
  const shown = name ? shortCompanyName(name) : "";
  const label = shown && shown.toUpperCase() !== symbol.toUpperCase() ? shown : "";
  const body = (
    <>
      <StockLogo ticker={symbol} size={size} />
      <span className="oa-mono oa-tk-sym">{symbol}</span>
      {/* One line, always (owner, Nov 11): a long name is cut with "…" and the full name shows on hover. */}
      {label ? <span title={shown} className="oa-tk-name">{label}</span> : null}
    </>
  );
  // .oa-tk (app/globals.css) is the row, the link's underline and its focus ring: tables print one per row.
  const extra = `${className ? ` ${className}` : ""}`;
  if (href === null) return <span className={`oa-tk-row${extra}`}>{body}</span>;
  return (
    <Link
      href={href ?? `/stock/${encodeURIComponent(symbol)}`}
      prefetch={false}
      className={`oa-tk${extra}${stretch ? " oa-tk-stretch" : ""}`}
    >
      {body}
    </Link>
  );
}

/**
 * Where a value sits between a low and a high (a day's or a year's range):
 * a hairline track with a dot, the two ends printed under it.
 */
export function RangeBar({
  low,
  high,
  value,
  format = (n: number) => n.toFixed(2),
  className = "",
}: {
  low: number;
  high: number;
  value: number | null | undefined;
  format?: (n: number) => string;
  className?: string;
}) {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;
  const at = value != null && Number.isFinite(value) ? Math.min(1, Math.max(0, (value - low) / (high - low))) : null;
  return (
    <span className={`block min-w-0 ${className}`}>
      <span aria-hidden="true" className="relative block h-1.5 rounded-full bg-oa-bg">
        {at != null ? (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card bg-oa-fg"
            style={{ left: `${at * 100}%` }}
          />
        ) : null}
      </span>
      <span className={`${NUM} mt-1 flex justify-between text-[12px] leading-4 text-oa-muted-fg`}>
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </span>
    </span>
  );
}

/* ── Streams ───────────────────────────────────────────────────────────── */

/**
 * One line of a wire: time on the left, what happened in the middle, the
 * names it touches on the right. Used for news, filings, trades, agent runs.
 */
export function StreamRow({
  time,
  tag,
  title,
  href,
  external = false,
  detail,
  meta,
  aside,
  shortTime = false,
}: {
  time?: React.ReactNode;
  tag?: React.ReactNode;
  title: React.ReactNode;
  href?: string;
  external?: boolean;
  /** One or two lines of why it matters. */
  detail?: React.ReactNode;
  /** Source and other small print. */
  meta?: React.ReactNode;
  /** Right-hand column: tickers, a number, an action. */
  aside?: React.ReactNode;
  /** The time is a short age like "1h", so the time column hugs it instead of leaving a gap. */
  shortTime?: boolean;
}) {
  const heading = href ? (
    <AppLink
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`rounded hover:underline ${FOCUS}`}
    >
      {title}
    </AppLink>
  ) : (
    title
  );
  return (
    <div className={`grid gap-x-3 border-b border-oa-border px-4 py-3 last:border-b-0 hover:bg-oa-accent ${
        shortTime
          ? "grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]"
          : "grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
      }`}>
      <div className={`${NUM} pt-px text-[12.5px] leading-[22px] text-oa-muted-fg`}>{time}</div>
      <div className="min-w-0">
        {tag ? <div className="mb-1 flex flex-wrap items-center gap-2">{tag}</div> : null}
        <p className="text-pretty text-[15px] font-medium leading-[22px] text-oa-fg">{heading}</p>
        {detail ? <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">{detail}</p> : null}
        {meta ? <div className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{meta}</div> : null}
      </div>
      {aside ? (
        <div className="col-start-2 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-3 sm:mt-0 sm:justify-end">
          {aside}
        </div>
      ) : null}
    </div>
  );
}

/** A day heading inside a stream. */
export function StreamDay({ children }: { children: React.ReactNode }) {
  return (
    <div className="oa-caption sticky top-[52px] z-10 border-b border-oa-border bg-oa-bg px-4 py-2 lg:top-0">
      {children}
    </div>
  );
}

/* ── Formatting ────────────────────────────────────────────────────────── */

export function fmtMoney(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** 1234567 -> "1.23M". For share counts, volumes and dollar totals. */
export function fmtCompact(value: number | null | undefined, prefix = ""): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      return `${sign}${prefix}${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)}${unit}`;
    }
  }
  return `${sign}${prefix}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * An "as of" stamp read now (lib/day-words.ts): "4:05 PM ET" today, "yesterday, 4:05 PM ET", "Monday, 4:05 PM ET"
 * within the week, "Nov 3, 4:05 PM ET" before. Lowercase; a label that starts with it capitalizes. A list of many
 * stamps, or a filing citation, keeps the date with `fmtStampETDate`.
 */
export function fmtStampET(iso: string | null | undefined, now: number | Date = Date.now()): string {
  if (!iso) return "";
  return stampWords(iso, now) || fmtStampETDate(iso);
}

/** An instant as "Nov 9, 4:05 PM ET": the date itself, for a list of many stamps or a citation. */
export function fmtStampETDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}

/** "18m", "3h", "2d": how long ago, measured against `now`. */
export function fmtAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
