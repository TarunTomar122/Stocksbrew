"use client";

import * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { NUM } from "@/components/oa/kit/cells";

/**
 * A News section split by tone (owner, Nov 12): good news in the left column, mixed or bad in the right, each a stack
 * in the section's order (lib/wire-read.ts `splitByTone`), paired row by row so cards side by side end level. Stories
 * with no tone read yet follow the pairing as their own quiet "No read yet" group, never counted as bad.
 *
 * Balance (owner rule 4, council Nov 12): folded, both columns show exactly the same count, the cut or the short
 * side's whole list when it has fewer, so neither ends far above the other; one "Show N more" opens the rest. Opened,
 * the columns go on only as far as the shorter one does, and what the longer side has past that spreads two across
 * under both ("More mixed or bad"), so no column hangs on beside empty space. When the short side has under half the
 * cut (one card beside ten), there are no columns: the short group is a strip two across above the long one, also
 * two across. With none at all, it is its header and "None today" on one line. On a phone, one column, good first.
 *
 * Every item is rendered on the server; folded ones carry `hidden`, so the first paint is already the folded section.
 * Never a box scrolling inside.
 */

type Layout = "col" | "wide";
type SideKey = "good" | "rest";

const SIDE = {
  good: { label: "Good news", more: "More good news", tone: "up" },
  rest: { label: "Mixed or bad", more: "More mixed or bad", tone: "down" },
} as const;

/** The list classes per variant and layout: a stack, or two across with each row of cards ending level. */
function listClass(rows: boolean, layout: Layout): string {
  if (rows) {
    return layout === "col"
      ? "[&>li+li]:border-t [&>li+li]:border-oa-border"
      : // Two across under one rule each; the header above rules the first row.
        "md:grid md:grid-cols-2 [&>li]:border-t [&>li]:border-oa-border max-md:[&>li:first-child]:border-t-0 md:[&>li:nth-child(-n+2)]:border-t-0 md:[&>li:nth-child(odd)]:border-r";
  }
  return layout === "col" ? "flex flex-col gap-3" : "grid grid-cols-1 gap-3 md:grid-cols-2 [&>li>*]:h-full";
}

/**
 * A place in the paired rows (council, Nov 12: cards side by side end level): from `md` up, column 1 or 2 of the
 * section's grid at `row`, set through a CSS variable so a phone, where the lists keep their own stack, ignores it.
 * The rows variant's right column carries the rule between the columns.
 */
type Cell = { className: string; style: React.CSSProperties };

function cell(col: 1 | 2, row: number, rows: boolean): Cell {
  const rule = rows && col === 2 ? " md:border-l md:border-oa-border" : "";
  return { className: `${col === 1 ? "md:col-start-1" : "md:col-start-2"} md:[grid-row:var(--r)]${rule}`, style: { ["--r" as string]: row } };
}

/** The item placed in its paired row, stretched to the row's height (its card filling it), and hidden when folded. */
function placed(item: React.ReactNode, at: Cell, hide: boolean): React.ReactNode {
  if (!React.isValidElement(item)) return item;
  const props = item.props as { className?: string; style?: React.CSSProperties };
  return React.cloneElement(item as React.ReactElement<{ hidden?: boolean; className?: string; style?: React.CSSProperties }>, {
    className: `${props.className ?? ""} ${at.className} md:[&>*]:h-full`.trim(),
    style: { ...props.style, ...at.style },
    ...(hide ? { hidden: true } : {}),
  });
}

/** The item with `hidden` set when it is folded away. */
function folded(item: React.ReactNode, hide: boolean): React.ReactNode {
  return hide && React.isValidElement(item) ? React.cloneElement(item as React.ReactElement<{ hidden?: boolean }>, { hidden: true }) : item;
}

function Head({
  side,
  text,
  count,
  rows,
  kind,
  id,
  hidden = false,
  place,
  total = 0,
}: {
  /** The tone mark; none for the "No read yet" group. */
  side: SideKey | null;
  text: string;
  /** Null: "None today" in its place. */
  count: number | null;
  rows: boolean;
  /** "side": a column's header. "sub": a group inside or after one ("No read yet", "More mixed or bad"). */
  kind: "side" | "sub";
  id?: string;
  hidden?: boolean;
  /** Grid placement in the paired rows (`cell`). */
  place?: Cell;
  /** Good plus mixed or bad: a column's header draws its count as a share of this, on one scale for both columns. */
  total?: number;
}) {
  // Not the `hidden` attribute: the `flex` class would still show it. A folded group's header is simply left out.
  if (hidden) return null;
  const style = rows
    ? kind === "side"
      ? `px-4 py-1.5 ${count === null ? "" : "border-b border-oa-border bg-oa-bg/40"}`
      : "border-y border-oa-border px-4 py-1.5"
    : kind === "side"
      ? count === null
        ? ""
        : // In the paired rows the grid's own gap spaces the header row.
          `mb-2 ${place ? "md:mb-0" : ""}`
      : `mb-2 mt-4 ${place ? "md:my-0" : ""}`;
  return (
    <h3 id={id} style={place?.style} className={`flex items-center gap-1.5 text-[12.5px] font-medium leading-5 text-oa-muted-fg ${style} ${place?.className ?? ""}`}>
      {side ? <ToneGlyph tone={SIDE[side].tone} decorative /> : null}
      <span className={side ? "text-oa-fg" : ""}>{text}</span>
      {count === null ? <span className="ml-1 font-normal">None today</span> : <span className={NUM}>{count}</span>}
      {/* Good against mixed or bad as a share of both (judges, sweep 87): the two headers' bars read as one comparison. */}
      {side && kind === "side" && count !== null && total > count ? (
        <span aria-hidden="true" className="ml-1 inline-block h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-oa-bg">
          <span
            className={`block h-full rounded-full ${SIDE[side].tone === "up" ? "bg-signal-bullish" : "bg-signal-bearish"}`}
            style={{ width: `${(count / total) * 100}%` }}
          />
        </span>
      ) : null}
    </h3>
  );
}

export function ToneColumns({
  good,
  bad,
  unread = [],
  cut,
  variant,
  label,
  ordered = false,
  startOpen = false,
  more = null,
}: {
  /** Good news, each an `<li>` with its key. */
  good: React.ReactNode[];
  /** Stories with a tone that does not lean positive. */
  bad: React.ReactNode[];
  /** Stories with no tone read yet. */
  unread?: React.ReactNode[];
  /** The most a column shows folded. */
  cut: number;
  /** "cards": stacks of cards with gaps. "rows": hairline rows inside a Panel, the columns split by a rule. */
  variant: "cards" | "rows";
  /** The section's name, for the single list's accessible name. */
  label: string;
  /** Ranked lists keep their order semantics (each `<li>` carries its rank as `value`). */
  ordered?: boolean;
  /** Start unfolded (a later page of the same feed, where the reader already asked for more). */
  startOpen?: boolean;
  /** What the fold's button becomes once nothing is folded: the link to the feed's next page, when there is one. */
  more?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(startOpen);
  const id = React.useId();
  const foot = React.useRef<HTMLDivElement>(null);
  // Opening the fold swaps the button for the next-page link; keep the keyboard's place on it rather than losing focus.
  const focusMore = React.useRef(false);
  React.useEffect(() => {
    if (!open || !focusMore.current) return;
    focusMore.current = false;
    foot.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);

  const rows = variant === "rows";
  const List = ordered ? "ol" : "ul";
  // Pairing and balance are between good and mixed-or-bad only; stories with no read yet follow as their own group.
  const seq: Record<SideKey, React.ReactNode[]> = { good, rest: bad };
  const toned = good.length + bad.length > 0;
  const count = { good: good.length, rest: bad.length };
  const k = Math.min(cut, Math.max(count.good, count.rest));
  const short: SideKey = count.good <= count.rest ? "good" : "rest";
  const long: SideKey = short === "good" ? "rest" : "good";
  // Under half the cut on the short side (one card beside ten): a strip above the long side instead of columns.
  const stacked = !toned || count[short] < cut / 2;
  // Folded, both columns show exactly the same count: the cut, or the short side's whole list when it has fewer.
  const even = Math.min(cut, count[short]);

  /** A run of one side's items, [from, to), laid out as `layout`, with those at or past `shown` folded away. */
  const run = (side: SideKey, from: number, to: number, shown: number, layout: Layout) =>
    to > from ? (
      <List className={listClass(rows, layout)}>
        {seq[side].slice(from, to).map((item, offset) => folded(item, !open && from + offset >= shown))}
      </List>
    ) : null;

  /** A column or group's header: the side's name and its count, or "None today". */
  const sideHead = (side: SideKey, headId: string) => {
    const n = count[side];
    return <Head id={headId} side={side} text={SIDE[side].label} count={n ? n : null} rows={rows} kind="side" total={count.good + count.rest} />;
  };

  let body: React.ReactNode;
  let hidden: number;
  if (!toned) {
    // No story here has a tone yet: one list, no tone headers, rather than "Good news: none today" over stocks
    // nobody has read (owner rule 7).
    hidden = Math.max(0, unread.length - cut * 2);
    body = (
      <List aria-label={label} className={listClass(rows, "wide")}>
        {unread.map((item, index) => folded(item, !open && index >= cut * 2))}
      </List>
    );
  } else if (stacked) {
    // The short group (one card, or none) as a strip above the long one, both two across.
    hidden = Math.max(0, count[long] - k * 2);
    const order: SideKey[] = [short, long];
    body = (
      <div className={rows ? "" : "flex flex-col gap-4"}>
        {order.map((side, index) => {
          const headId = `${id}-${side}`;
          return (
            <section
              key={side}
              aria-labelledby={headId}
              // Good news first on a phone, wherever the strip falls wider up.
              className={`min-w-0 ${rows && index === 1 ? "border-t border-oa-border" : ""} ${!rows && side === "good" ? "max-md:order-first" : ""}`}
            >
              {sideHead(side, headId)}
              {run(side, 0, count[side], side === short ? count[side] : k * 2, "wide")}
            </section>
          );
        })}
      </div>
    );
  } else {
    // Two columns folded to the same count. Opened, they run as far as the shorter side; the longer side's rest goes under both.
    hidden = count.good - even + (count.rest - even);
    const column = count[short];
    const tail = count[long] - column;
    const tailId = `${id}-more`;
    body = (
      <>
        {/* One grid for both columns: row 1 the headers, then row i the i-th good card beside the i-th mixed or bad
            one, both stretched to the taller, so cards side by side end level. On a phone each side's list is its own
            stack (the grid's pieces only join it from md up, through `md:contents`). */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${rows ? "" : "gap-x-3 gap-y-5 md:gap-y-3"}`}>
          {(["good", "rest"] as const).map((side, index) => {
            const headId = `${id}-${side}`;
            const col = index === 0 ? 1 : 2;
            return (
              <section key={side} aria-labelledby={headId} className={`min-w-0 md:contents ${rows && index === 1 ? "border-oa-border max-md:border-t" : ""}`}>
                <Head id={headId} side={side} text={SIDE[side].label} count={count[side]} rows={rows} kind="side" place={cell(col, 1, rows)} total={count.good + count.rest} />
                <List className={`${listClass(rows, "col")} md:contents`}>
                  {seq[side].slice(0, column).map((item, offset) => placed(item, cell(col, offset + 2, rows), !open && offset >= even))}
                </List>
              </section>
            );
          })}
        </div>
        {tail > 0 ? (
          <section aria-labelledby={tailId} hidden={!open}>
            <Head id={tailId} side={long} text={SIDE[long].more} count={tail} rows={rows} kind="sub" />
            {run(long, column, count[long], column, "wide")}
          </section>
        ) : null}
      </>
    );
  }

  // Stories with no tone read yet: after the paired rows (and their tail), as their own group two across, never inside
  // the pairing and never counted as bad (council, Nov 12). Folded away whenever the section is folded.
  const unreadId = `${id}-unread`;
  if (toned && unread.length) {
    hidden += unread.length;
    body = (
      <>
        {body}
        <section aria-labelledby={unreadId} hidden={!open}>
          <Head id={unreadId} side={null} text="No read yet" count={unread.length} rows={rows} kind="sub" />
          <List className={listClass(rows, "wide")}>{unread}</List>
        </section>
      </>
    );
  }

  const button =
    hidden > 0 && !(open && more) ? (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          focusMore.current = !open && Boolean(more);
          setOpen((value) => !value);
        }}
        className={`flex h-9 w-full cursor-pointer items-center justify-center text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
          rows ? "border-t border-oa-border" : "mt-2 rounded-md"
        }`}
      >
        {open ? "Show less" : `Show ${hidden} more`}
      </button>
    ) : (
      more
    );

  return (
    <div className="min-w-0">
      <div id={id}>{body}</div>
      {button ? <div ref={foot}>{button}</div> : null}
    </div>
  );
}
