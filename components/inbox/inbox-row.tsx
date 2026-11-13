import Link from "next/link";
import * as React from "react";

import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { StockLogo } from "@/components/stock-logo";
import { dayLabel, type InboxGroup } from "@/lib/inbox/merge";
import type { InboxItem, InboxKind } from "@/lib/inbox/types";

/**
 * One inbox line: the stock's logo (or the kind's icon), the sentence whole,
 * and who reported it and when. The whole row is the link to the evidence;
 * nothing is repeated on every row (no icon, no chevron, no link text): Ask is
 * the shell's one Ask. No hooks: the page's list and the bell's popover
 * both render it.
 */

const KIND_ICON: Record<InboxKind, NavIconName> = {
  agent: "agents",
  call: "research",
  results: "calendar",
  alert: "alerts",
  reason: "portfolio",
  follow: "follow",
  insider: "filings",
  filing: "filings",
  strategy: "strategies",
  memo: "briefing",
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** "4:35 PM" in New York. */
function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
}

/** When, as the row says it: the clock time inside a day group, or the day (and time) in the popover. */
export function whenWords(item: Pick<InboxItem, "at" | "day" | "exact">, today: string, withDay: boolean): string {
  const time = item.exact ? `${clock(item.at)} ET` : "";
  if (!withDay) return time;
  const day = dayLabel(item.day, today);
  return time ? `${day}, ${time}` : day;
}

export function InboxRow({
  item,
  unread,
  today,
  withDay = false,
  compact = false,
  lockMark = null,
  showDetail = true,
  showMeta = true,
  onOpen,
}: {
  item: InboxItem;
  unread: boolean;
  today: string;
  /** Say the day as well as the time (the popover has no day headings). */
  withDay?: boolean;
  /** Tighter, for the popover. */
  compact?: boolean;
  /** The plan's lock mark beside a locked item (the page passes the kit's ProMark). */
  lockMark?: React.ReactNode;
  showDetail?: boolean;
  /** Who reported it and when; left off when the row above said the same (one agent run, several stocks). */
  showMeta?: boolean;
  /** Called when the row's link is followed (the popover closes itself). */
  onOpen?: () => void;
}) {
  const lead = item.tickers[0] ?? null;
  const when = whenWords(item, today, withDay);
  const sentence = item.text;
  const linkClass = `rounded text-pretty text-oa-fg after:absolute after:inset-0 after:content-[''] ${FOCUS} ${compact ? "text-[13.5px] leading-[19px]" : "text-[14.5px] leading-[21px]"} ${unread ? "font-medium" : ""}`;
  return (
    <li
      data-inbox-id={item.id}
      className={`relative flex items-start gap-3 ${compact ? "py-2.5 pl-5 pr-3" : "py-3 pl-6 pr-4"} transition-colors hover:bg-oa-accent ${item.quiet ? "opacity-80" : ""}`}
    >
      {unread ? (
        // In its own gutter, level with the middle of the icon, never over it.
        <span aria-hidden="true" className={`absolute ${compact ? "left-2 top-[21px]" : "left-2.5 top-[25px]"} size-1.5 rounded-full bg-oa-primary`} />
      ) : null}
      <span className="mt-0.5 flex shrink-0 items-center">
        {lead ? (
          <StockLogo ticker={lead} size={compact ? 24 : 28} />
        ) : (
          <span className={`flex items-center justify-center rounded-md border border-oa-border bg-oa-bg text-oa-muted-fg ${compact ? "size-6" : "size-7"}`}>
            <NavIcon name={KIND_ICON[item.kind]} className={compact ? "size-3.5" : "size-4"} />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          {item.external ? (
            <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={linkClass}>
              {unread ? <span className="sr-only">New: </span> : null}
              {sentence}
            </a>
          ) : (
            <Link href={item.href} prefetch={false} onClick={onOpen} className={linkClass}>
              {unread ? <span className="sr-only">New: </span> : null}
              {sentence}
            </Link>
          )}
        </p>
        {/* Every stock a row names shows its logo (owner rule 5); the lead's is in the gutter. */}
        {!compact && item.tickers.length > 1 ? <LogoStrip tickers={item.tickers.slice(1)} /> : null}
        {showDetail && item.detail ? <p className="mt-0.5 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{item.detail}</p> : null}
        {showMeta || (item.locked && lockMark) ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
            {showMeta ? <span>{item.source}</span> : null}
            {showMeta && when ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="oa-mono tabular-nums">{when}</span>
              </>
            ) : null}
            {item.locked && lockMark ? <span className="relative z-10 ml-1">{lockMark}</span> : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Who reported a row's items (each once) and the newest clock time among them. */
function groupMeta(group: InboxGroup, today: string, withDay = false): { sources: string; when: string } {
  const sources = [...new Set(group.items.map((item) => item.source))].join(" · ");
  const newest = [...group.items].sort((a, b) => Number(b.exact) - Number(a.exact) || Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  return { sources, when: newest && (newest.exact || withDay) ? whenWords(newest, today, withDay) : "" };
}

/** The row's "who and when" line as text, so a list can leave it off a row whose line matches the one above. */
export function metaWords(group: InboxGroup, today: string, withDay = false): string {
  const { sources, when } = groupMeta(group, today, withDay);
  return [sources, when].filter(Boolean).join(" · ");
}

/** The other stocks a row names, as small logos on one line under the sentence (the sentence already names them). */
function LogoStrip({ tickers }: { tickers: string[] }) {
  return (
    <span aria-hidden="true" className="mt-1 flex flex-wrap items-center gap-1.5">
      {tickers.map((ticker) => (
        <span key={ticker} title={ticker} className="inline-flex">
          <StockLogo ticker={ticker} size={18} />
        </span>
      ))}
    </span>
  );
}

/** Where a stock's row goes: its one item's link, the link they all share, or else the stock's page. */
function groupHref(group: InboxGroup): { href: string; external: boolean } {
  const first = group.items[0]!;
  if (group.items.every((item) => item.href === first.href)) return { href: first.href, external: first.external };
  return group.ticker ? { href: `/stock/${encodeURIComponent(group.ticker)}`, external: false } : { href: first.href, external: first.external };
}

/**
 * The page's row: one stock and everything that happened to it that day, said once (its logo, then each thing in
 * its own sentence, the confirmed reason under a move, and who reported it and when on one line), or one item about
 * several stocks or none. The whole row is the link; nothing is repeated on every row.
 */
export function InboxGroupRow({
  group,
  unread,
  today,
  lockMark = null,
  showMeta = true,
  withDay = false,
  compact = false,
  showDetail = true,
  onOpen,
}: {
  group: InboxGroup;
  /** Which of the group's items are new. */
  unread: (item: InboxItem) => boolean;
  today: string;
  lockMark?: React.ReactNode;
  showMeta?: boolean;
  /** Say the day as well as the time (the popover has no day headings). */
  withDay?: boolean;
  /** Tighter, for the popover. */
  compact?: boolean;
  showDetail?: boolean;
  onOpen?: () => void;
}) {
  const [first, ...more] = group.items;
  if (!first) return null;
  if (more.length === 0) {
    return <InboxRow item={first} unread={unread(first)} today={today} lockMark={lockMark} showMeta={showMeta} withDay={withDay} compact={compact} showDetail={showDetail} onOpen={onOpen} />;
  }
  const anyUnread = group.items.some(unread);
  const { href, external } = groupHref(group);
  // Who reported it, each once ("Your agent · SEC Form 4"), and the newest clock time.
  const { sources, when } = groupMeta(group, today, withDay);
  const locked = group.items.some((item) => item.locked);
  const size = compact ? "text-[13.5px] leading-[19px]" : "text-[14.5px] leading-[21px]";
  const linkClass = `rounded text-pretty text-oa-fg after:absolute after:inset-0 after:content-[''] ${FOCUS} ${size} ${unread(first) ? "font-medium" : ""}`;
  const lead = (
    <>
      {anyUnread ? <span className="sr-only">New: </span> : null}
      {first.text}
    </>
  );
  return (
    <li data-inbox-id={first.id} className={`relative flex items-start gap-3 ${compact ? "py-2.5 pl-5 pr-3" : "py-3 pl-6 pr-4"} transition-colors hover:bg-oa-accent`}>
      {anyUnread ? <span aria-hidden="true" className={`absolute ${compact ? "left-2 top-[21px]" : "left-2.5 top-[25px]"} size-1.5 rounded-full bg-oa-primary`} /> : null}
      <span className="mt-0.5 flex shrink-0 items-center">
        {group.ticker ? <StockLogo ticker={group.ticker} size={compact ? 24 : 28} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          {external ? (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={linkClass}>
              {lead}
            </a>
          ) : (
            <Link href={href} prefetch={false} onClick={onOpen} className={linkClass}>
              {lead}
            </Link>
          )}
        </p>
        {showDetail && first.detail ? <p className="mt-0.5 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{first.detail}</p> : null}
        {more.map((item) => (
          <React.Fragment key={item.id}>
            <p className={`mt-1 text-pretty ${size} text-oa-fg ${unread(item) ? "font-medium" : ""}`}>{item.text}</p>
            {showDetail && item.detail ? <p className="mt-0.5 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{item.detail}</p> : null}
          </React.Fragment>
        ))}
        {showMeta || (locked && lockMark) ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
            {showMeta ? <span>{sources}</span> : null}
            {showMeta && when ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="oa-mono tabular-nums">{when}</span>
              </>
            ) : null}
            {locked && lockMark ? <span className="relative z-10 ml-1">{lockMark}</span> : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}
