import Link from "next/link";
import * as React from "react";

import { NavIcon } from "@/components/oa/nav-icon";
import type { NavIcon as NavIconName } from "@/components/oa/nav-items";
import { StockLogo } from "@/components/stock-logo";
import { dayLabel } from "@/lib/inbox/merge";
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
  alert: "alerts",
  reason: "portfolio",
  follow: "follow",
  insider: "filings",
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
        {showDetail && item.detail ? <p className="mt-0.5 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{item.detail}</p> : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
          <span>{item.source}</span>
          {when ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="oa-mono tabular-nums">{when}</span>
            </>
          ) : null}
          {item.locked && lockMark ? <span className="relative z-10 ml-1">{lockMark}</span> : null}
        </p>
      </div>
    </li>
  );
}
