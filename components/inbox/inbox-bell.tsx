"use client";

import Link from "next/link";
import * as React from "react";

import { InboxRow } from "@/components/inbox/inbox-row";
import { useMarkSeen } from "@/components/inbox/use-mark-seen";
import { useUser } from "@/lib/auth-context";
import { badgeText, isUnread, nyDay } from "@/lib/inbox/merge";
import { newestShown, wouldClear } from "@/lib/inbox/seen";
import { INBOX_SEEN_EVENT, type InboxSummary } from "@/lib/inbox/types";
import { usePublicPathname } from "@/lib/use-public-pathname";

/**
 * The bell in the app's chrome. It never holds up a page: it paints as a plain
 * bell, and only once the page is idle does a signed-in person's browser ask
 * /api/inbox/summary for the unread count (a small private response, cached
 * for a few seconds). On a desktop it opens the newest few in a popover; on a
 * phone it is a link to /inbox. Signed out, nothing is fetched until the
 * popover opens, and then it shows the example portfolio's inbox.
 *
 * Opening the popover reads what it shows: after about two seconds open, the
 * items in it are marked read and the count clears; following one marks it at
 * once. The "new" dots stay while it is open, so people see what was new.
 */

/** Read the count again when the tab comes back after this long. */
const REFRESH_AFTER_MS = 5 * 60_000;

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

function BellGlyph({ className = "size-[18px]" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className="oa-mono absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-oa-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-oa-primary-fg ring-2 ring-[var(--oa-page)]"
    >
      {badgeText(count)}
    </span>
  );
}

/** Run once the page is idle (or after a short wait where the browser has no idle callback). */
function whenIdle(run: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}

/**
 * One read shared by both bells (the sidebar's and the phone top bar's are both mounted, one hidden by CSS), so a page
 * load makes one request at most. The address names the account (`u=`), so the browser's short cache of one person's
 * inbox is never handed to another account, or to the signed-out example, in the same browser.
 */
type Shared = { key: string; summary: InboxSummary | null; failed: boolean; at: number; pending: Promise<void> | null };
const shared: Shared = { key: "", summary: null, failed: false, at: 0, pending: null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * `fresh` revalidates the browser's short-cached copy. "reload" goes to the server and stores the answer over the
 * cached one, which "Mark all read" needs: otherwise the next page load is handed the old count from the cache.
 */
function readShared(key: string, fresh: boolean | "reload"): Promise<void> {
  if (shared.key === key && shared.pending) return shared.pending;
  if (shared.key !== key) Object.assign(shared, { key, summary: null, failed: false, at: 0 });
  const pending = (async () => {
    try {
      const response = await fetch(`/api/inbox/summary?u=${encodeURIComponent(key)}`, { credentials: "same-origin", cache: fresh === "reload" ? "reload" : fresh ? "no-cache" : "default" });
      const body = response.ok ? ((await response.json()) as InboxSummary) : null;
      if (shared.key !== key) return;
      shared.summary = body ?? shared.summary;
      shared.failed = !body;
    } catch {
      if (shared.key === key) shared.failed = true;
    } finally {
      if (shared.key === key) {
        shared.at = Date.now();
        shared.pending = null;
      }
      notify();
    }
  })();
  shared.pending = pending;
  notify();
  return pending;
}

export function InboxBell({ variant }: { variant: "sidebar" | "topbar" }) {
  const { user, loading, initialAuthed } = useUser();
  const signedIn = Boolean(user) || initialAuthed;
  // Who the count is for: the account's uid, "anon" for the example. Unknown while a session resolves: nothing is read.
  const key = user ? user.uid : !loading && !initialAuthed ? "anon" : "";
  const pathname = usePublicPathname() ?? "/";
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const popoverId = React.useId();

  React.useEffect(() => {
    listeners.add(rerender);
    return () => void listeners.delete(rerender);
  }, []);

  const mine = shared.key === key && key !== "";
  const summary = mine ? shared.summary : null;
  const state: "idle" | "loading" | "failed" = !mine ? "idle" : shared.pending ? "loading" : shared.failed ? "failed" : "idle";
  const load = React.useCallback((fresh = false) => (key ? readShared(key, fresh) : Promise.resolve()), [key]);

  // Signed in: the count, after first paint, and again when the tab returns after a while. Signed out: nothing until the popover opens.
  React.useEffect(() => {
    if (!signedIn || !key || key === "anon") return;
    const cancel = whenIdle(() => {
      if (shared.key !== key || (!shared.summary && !shared.pending)) void load();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - shared.at > REFRESH_AFTER_MS) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, key, load]);

  // A save of the read mark (the page or the popover read, or "Mark all read") clears the count at once.
  React.useEffect(() => {
    const onSeen = (event: Event) => {
      const seenAt = (event as CustomEvent<{ seenAt?: string }>).detail?.seenAt ?? new Date().toISOString();
      // A save up to a followed item leaves anything newer unread; those are all among the newest few the bell holds.
      if (shared.summary) shared.summary = { ...shared.summary, unread: shared.summary.items.filter((item) => isUnread(item, seenAt)).length, seenAt };
      notify();
      // Replace the browser's cached count (kept for 30 seconds) with the server's new one, after any read in flight.
      const key = shared.key;
      if (key && key !== "anon") void (shared.pending ?? Promise.resolve()).then(() => (shared.key === key ? readShared(key, "reload") : undefined));
    };
    window.addEventListener(INBOX_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(INBOX_SEEN_EVENT, onSeen);
  }, []);

  // The popover closes on a click outside, on Escape (focus back on the bell) and when the page changes.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  React.useEffect(() => setOpen(false), [pathname]);
  // Opened while the session was still resolving: read once it is known.
  React.useEffect(() => {
    if (open && key && !(shared.key === key && (shared.summary || shared.pending))) void readShared(key, false);
  }, [open, key]);

  const unread = summary?.signedIn ? summary.unread : 0;
  // Taken when the popover first shows a fresh signed-in list (not while a newer read is on its way), dropped when it closes.
  const [view, setView] = React.useState<{ seenAt: string | null; unread: number } | null>(null);
  const reading = Boolean(shared.pending);
  React.useEffect(() => {
    if (!open) setView(null);
    else if (!view && !reading && summary?.signedIn) setView({ seenAt: summary.seenAt, unread: summary.unread });
  }, [open, view, reading, summary]);
  // Findings first: a day's "checked, nothing found" line only fills the popover when there is nothing else.
  const popoverItems = React.useMemo(() => {
    const list = summary?.items ?? [];
    const findings = list.filter((item) => !item.quiet);
    return findings.length > 0 ? findings : list;
  }, [summary]);
  // The popover shows the newest few. The read mark is one time, so marking them read would also clear older unread
  // items it never showed: it only reads itself when everything unread is in view, and leaves the rest to /inbox.
  const shownUnreadCount = view?.seenAt ? popoverItems.filter((item) => isUnread(item, view.seenAt!)).length : 0;
  const seen = useMarkSeen({
    auto: open && view !== null && Boolean(summary?.signedIn) && wouldClear(popoverItems, view.seenAt) && shownUnreadCount >= view.unread,
    at: newestShown(popoverItems),
    signedIn: Boolean(summary?.signedIn),
    account: user?.uid ?? null,
  });
  const label = unread > 0 ? `Inbox, ${unread} new` : "Inbox";
  const onInbox = pathname === "/inbox";

  if (variant === "topbar") {
    return (
      <Link
        href="/inbox"
        prefetch={false}
        aria-label={label}
        aria-current={onInbox ? "page" : undefined}
        className={`relative inline-flex size-8 items-center justify-center rounded-md text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
      >
        <BellGlyph />
        <Badge count={unread} />
      </Link>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Signed out, or the count is old: read when the popover opens.
    if (next && (!summary || Date.now() - shared.at > REFRESH_AFTER_MS)) void load(Boolean(summary));
  };
  const today = nyDay(new Date().toISOString()) ?? "";
  const items = popoverItems;
  // The read mark as it was when the popover opened: the dots and the "N new" hold for this view after the save.
  const seenAt = view?.seenAt ?? summary?.seenAt ?? null;
  const shownUnread = view ? view.unread : unread;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        className={`relative inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-oa-accent hover:text-oa-fg ${open || onInbox ? "text-oa-fg" : "text-oa-muted-fg"} ${FOCUS}`}
      >
        <BellGlyph />
        <Badge count={unread} />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Inbox"
          className="oa-surface absolute left-0 top-10 z-50 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-oa-border bg-oa-card shadow-[0_16px_48px_-20px_rgba(0,0,0,0.35)]"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-oa-border px-3 py-2.5">
            <p className="text-[15px] font-semibold text-oa-fg">
              {summary?.example ? (
                <span className="mr-2 inline-flex h-[20px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-1.5 align-[2px] text-[12px] font-medium text-oa-primary">
                  Example
                </span>
              ) : null}
              Inbox
            </p>
            {summary?.signedIn ? (
              <p className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{shownUnread > 0 ? `${shownUnread} new` : "All read"}</p>
            ) : null}
          </div>
          {!summary && state !== "failed" ? (
            <ul aria-hidden="true" className="divide-y divide-oa-border">
              {[0, 1, 2].map((row) => (
                <li key={row} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="size-6 shrink-0 animate-pulse rounded-md bg-oa-accent motion-reduce:animate-none" />
                  <span className="flex-1">
                    <span className="block h-3.5 w-11/12 animate-pulse rounded bg-oa-accent motion-reduce:animate-none" />
                    <span className="mt-2 block h-3 w-1/3 animate-pulse rounded bg-oa-accent motion-reduce:animate-none" />
                  </span>
                </li>
              ))}
            </ul>
          ) : !summary ? (
            <p className="px-3 py-4 text-[13.5px] leading-5 text-oa-muted-fg">We couldn&apos;t load your inbox just now. Open it to try again.</p>
          ) : items.length === 0 && !summary.complete ? (
            <p className="px-3 py-4 text-[13.5px] leading-5 text-oa-muted-fg">We couldn&apos;t read the whole inbox just now. Try again in a minute.</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-4 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
              {summary.signedIn
                ? "Nothing in the last two weeks. When an agent flags something, a call on your stocks moves or an investor you follow trades, it lands here."
                : "The example portfolio has nothing new in the last two weeks."}
            </p>
          ) : (
            <ul className="scrollbar-hide max-h-[min(26rem,70vh)] divide-y divide-oa-border overflow-y-auto overscroll-contain">
              {items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  unread={Boolean(summary.signedIn && seenAt && isUnread(item, seenAt))}
                  today={today}
                  withDay
                  compact
                  showDetail={false}
                  onOpen={() => {
                    // Following an item reads it: the save goes now, up to that item, before the popover closes.
                    if (summary.signedIn && seenAt && isUnread(item, seenAt)) seen.markNow(item.at);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-oa-border px-3 py-2.5">
            {summary && !summary.signedIn ? (
              <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">Sign in to get your own.</p>
            ) : summary && items.length > 0 ? (
              // The popover's one Ask, for the whole list: the panel opens beside the page from the person's own stocks.
              <Link href={`/ask?q=${encodeURIComponent("What in my inbox needs me first, and why?")}&ctx=portfolio`} prefetch={false} onClick={() => setOpen(false)} className={`rounded text-[13.5px] text-oa-muted-fg hover:text-oa-fg hover:underline ${FOCUS}`}>
                Ask about my inbox
              </Link>
            ) : (
              <span />
            )}
            <Link href="/inbox" prefetch={false} onClick={() => setOpen(false)} className={`rounded text-[13.5px] font-medium text-oa-primary hover:underline ${FOCUS}`}>
              {summary && !summary.signedIn ? "Open the example inbox" : "Open inbox"}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
