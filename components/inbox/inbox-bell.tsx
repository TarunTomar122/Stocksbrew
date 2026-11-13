"use client";

import Link from "next/link";
import * as React from "react";

import { InboxGroupRow, metaWords } from "@/components/inbox/inbox-row";
import { postSeen, useMarkSeen } from "@/components/inbox/use-mark-seen";
import { useUser } from "@/lib/auth-context";
import { badgeText, inboxRows, isUnread, nyDay, unreadRows } from "@/lib/inbox/merge";
import { newestShown, wouldClear } from "@/lib/inbox/seen";
import { INBOX_SEEN_EVENT, type InboxSummary } from "@/lib/inbox/types";
import { PROPOSALS_CHANGED_EVENT, type ProposalsChangedDetail } from "@/lib/proposals-event";
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
 * once. The "new" dots stay while it is open, so people see what was new. The
 * popover and the count are rows, as on the page: each stock once a day.
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
      if (shared.summary) {
        const today = nyDay(new Date().toISOString()) ?? "";
        shared.summary = { ...shared.summary, unread: unreadRows(shared.summary.items, seenAt, today), seenAt };
      }
      notify();
      // Replace the browser's cached count (kept for 30 seconds) with the server's new one, after any read in flight.
      const key = shared.key;
      if (key && key !== "anon") void (shared.pending ?? Promise.resolve()).then(() => (shared.key === key ? readShared(key, "reload") : undefined));
    };
    window.addEventListener(INBOX_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(INBOX_SEEN_EVENT, onSeen);
  }, []);

  // Answering an agent proposal (components/proposals) moves the count at once.
  React.useEffect(() => {
    const onProposals = (event: Event) => {
      const waiting = (event as CustomEvent<ProposalsChangedDetail>).detail?.waiting;
      if (shared.summary?.signedIn && typeof waiting === "number" && waiting !== shared.summary.proposals) {
        shared.summary = { ...shared.summary, proposals: waiting };
        notify();
        // Replace the browser's short-cached count, so a reload right after an answer does not bring the old one back.
        const key = shared.key;
        if (key && key !== "anon") void (shared.pending ?? Promise.resolve()).then(() => (shared.key === key ? readShared(key, "reload") : undefined));
      }
    };
    window.addEventListener(PROPOSALS_CHANGED_EVENT, onProposals);
    return () => window.removeEventListener(PROPOSALS_CHANGED_EVENT, onProposals);
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
  const [view, setView] = React.useState<{ seenAt: string | null; unread: number; clearable: boolean } | null>(null);
  const reading = Boolean(shared.pending);
  React.useEffect(() => {
    if (!open) setView(null);
    else if (!view && !reading && summary?.signedIn) setView({ seenAt: summary.seenAt, unread: summary.unread, clearable: summary.clearable === true });
  }, [open, view, reading, summary]);
  // The server sends the popover's rows (findings first, the newest few rows, as lib/inbox/merge.ts popoverItems).
  const popoverItems = React.useMemo(() => summary?.items ?? [], [summary]);
  // The read mark is one time, so marking the shown items read would also clear older unread items the popover never
  // showed: it only reads itself when the server says nothing unread sits outside what it shows (`clearable`), and
  // leaves the rest to /inbox.
  const seen = useMarkSeen({
    auto: open && view !== null && Boolean(summary?.signedIn) && wouldClear(popoverItems, view.seenAt) && view.clearable,
    at: newestShown(popoverItems),
    signedIn: Boolean(summary?.signedIn),
    account: user?.uid ?? null,
  });
  // The badge also counts the agent's proposals waiting for an answer (lib/proposals.ts), but only the ones that arrived
  // since the bell or /inbox was last opened (owner, Nov 13: "the count should go away once I click this"). The waiting
  // ones stay listed on /agent; the badge only says something new came in.
  const proposals = summary?.signedIn ? summary.proposals ?? 0 : 0;
  const [proposalsSeen, setProposalsSeen] = React.useState<number>(0);
  const seenKey = user?.uid ? `stocksbrew:bell:proposals-seen:${user.uid}` : null;
  React.useEffect(() => {
    if (!seenKey) return;
    try {
      setProposalsSeen(Number(window.localStorage.getItem(seenKey) ?? 0) || 0);
    } catch {
      setProposalsSeen(0);
    }
  }, [seenKey]);
  const acknowledge = React.useCallback(() => {
    if (!seenKey) return;
    setProposalsSeen(proposals);
    try {
      window.localStorage.setItem(seenKey, String(proposals));
    } catch {
      // Private mode: the badge clears for this tab only.
    }
  }, [seenKey, proposals]);
  // An answered proposal lowers the waiting count: what was seen can never count above what still waits.
  const newProposals = Math.max(0, proposals - Math.min(proposalsSeen, proposals));
  // Opening /inbox (the phone's bell goes there) counts as looking.
  React.useEffect(() => {
    if (pathname === "/inbox" && summary?.signedIn) acknowledge();
  }, [pathname, summary?.signedIn, acknowledge]);
  const badge = unread + newProposals;
  const label = badge > 0 ? `Inbox, ${badge} new` : "Inbox";
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
        <Badge count={badge} />
      </Link>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening the bell clears its count at once: everything up to now is marked read (the popover still shows this
    // view's new dots), and the waiting proposals count as seen.
    if (next && summary?.signedIn) {
      void postSeen(null, { account: user?.uid ?? null });
      acknowledge();
    }
    // Signed out, or the count is old: read when the popover opens.
    if (next && (!summary || Date.now() - shared.at > REFRESH_AFTER_MS)) void load(Boolean(summary));
  };
  const today = nyDay(new Date().toISOString()) ?? "";
  const items = popoverItems;
  const rows = inboxRows(items, today);
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
        <Badge count={badge} />
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
          {proposals > 0 ? (
            <Link
              href="/agent#agent-proposals"
              prefetch={false}
              onClick={() => setOpen(false)}
              className={`block border-b border-oa-border px-3 py-2.5 text-[13.5px] font-medium text-oa-primary hover:bg-oa-accent ${FOCUS}`}
            >
              {proposals === 1 ? "Your agent has a proposal waiting for you" : `Your agent has ${proposals} proposals waiting for you`}
            </Link>
          ) : null}
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
              {rows.map((row, index) => {
                const isNew = (item: (typeof items)[number]) => Boolean(summary.signedIn && seenAt && isUnread(item, seenAt));
                const newestUnread = newestShown(row.items.filter(isNew));
                // One agent run flags several stocks at one time: its "who and when" is said on the first of them only.
                const showMeta = index === 0 || metaWords(rows[index - 1]!, today, true) !== metaWords(row, today, true);
                return (
                  <InboxGroupRow
                    key={row.key}
                    group={row}
                    unread={isNew}
                    today={today}
                    withDay
                    compact
                    showDetail={false}
                    showMeta={showMeta}
                    onOpen={() => {
                      // Following a row reads it: the save goes now, up to that row, before the popover closes.
                      if (newestUnread) seen.markNow(newestUnread);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-oa-border px-3 py-2.5">
            {summary && !summary.signedIn ? (
              <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">Start free to get your own.</p>
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
