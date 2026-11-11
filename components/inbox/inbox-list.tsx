"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { InboxRow } from "@/components/inbox/inbox-row";
import { ProMark } from "@/components/oa/gate";
import { groupByDay, isUnread, kindCounts } from "@/lib/inbox/merge";
import { INBOX_SEEN_EVENT, KIND_LABEL, type InboxItem, type InboxKind } from "@/lib/inbox/types";

/**
 * The inbox page's list: kind chips, then the items grouped by day in one
 * fixed-height box that scrolls inside (about eight rows show), and "Mark all
 * read". Filtering happens here, on what the page already sent, so a chip
 * never waits on the server; the chosen kind is kept in the address.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

function chipClass(active: boolean): string {
  return `inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-[14px] transition-colors ${FOCUS} ${
    active ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg" : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
  }`;
}

/** Investors and insiders share one chip: both are other people's trades in stocks. */
function chipOf(kind: InboxKind): InboxKind {
  return kind === "insider" ? "follow" : kind;
}

export function InboxList({
  items,
  seenAt,
  today,
  example,
  initialKind,
}: {
  items: InboxItem[];
  /** The read mark the page was rendered with; null for the example. */
  seenAt: string | null;
  today: string;
  example: boolean;
  initialKind: InboxKind | null;
}) {
  const [kind, setKind] = React.useState<InboxKind | null>(initialKind);
  const [mark, setMark] = React.useState<string | null>(seenAt);
  const [saving, setSaving] = React.useState<"idle" | "saving" | "failed">("idle");
  const router = useRouter();

  const chips = React.useMemo(() => {
    const counts = new Map<InboxKind, number>();
    for (const { kind: k, count } of kindCounts(items)) counts.set(chipOf(k), (counts.get(chipOf(k)) ?? 0) + count);
    return [...counts.entries()].map(([k, count]) => ({ kind: k, count, label: k === "follow" ? "Investors and insiders" : KIND_LABEL[k] }));
  }, [items]);
  const shown = kind ? items.filter((item) => chipOf(item.kind) === kind) : items;
  const days = groupByDay(shown, today);
  const unread = mark ? items.filter((item) => isUnread(item, mark)).length : 0;

  const choose = (next: InboxKind | null) => {
    setKind(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("kind", next);
    else url.searchParams.delete("kind");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const markAll = async () => {
    setSaving("saving");
    try {
      const response = await fetch("/api/inbox/seen", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { seenAt?: string };
      const next = body.seenAt ?? new Date().toISOString();
      setMark(next);
      setSaving("idle");
      window.dispatchEvent(new CustomEvent(INBOX_SEEN_EVENT, { detail: { seenAt: next } }));
      // The read above the list counts from the read mark: draw it again.
      router.refresh();
    } catch {
      setSaving("failed");
    }
  };

  return (
    <section aria-label="Inbox" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-oa-border px-3 py-2.5 sm:px-4">
        <div role="group" aria-label="Show" className="scrollbar-hide -mx-1 flex min-w-0 basis-full gap-2 overflow-x-auto px-1 sm:basis-0 sm:flex-1">
          <button type="button" aria-pressed={kind === null} onClick={() => choose(null)} className={chipClass(kind === null)}>
            All
            <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{items.length}</span>
          </button>
          {chips.length > 1
            ? chips.map((chip) => (
                <button key={chip.kind} type="button" aria-pressed={kind === chip.kind} onClick={() => choose(chip.kind)} className={chipClass(kind === chip.kind)}>
                  {chip.label}
                  <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{chip.count}</span>
                </button>
              ))
            : null}
        </div>
        {!example ? (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {saving === "failed" ? <span className="text-[12.5px] text-oa-muted-fg">That didn&apos;t save. Try again.</span> : null}
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0 || saving === "saving"}
              className={`h-8 rounded-md px-2.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
                unread === 0 ? "cursor-default text-oa-muted-fg" : "text-oa-primary hover:bg-oa-accent"
              }`}
            >
              {unread === 0 ? "All read" : saving === "saving" ? "Marking…" : `Mark all read (${unread})`}
            </button>
          </div>
        ) : null}
      </div>
      {days.length === 0 ? (
        <p className="px-4 py-6 text-[14px] text-oa-muted-fg">Nothing of this kind in the last two weeks.</p>
      ) : (
        <div className="scrollbar-hide max-h-[min(36rem,calc(100dvh-14rem))] overflow-y-auto overscroll-contain">
          {days.map((group) => (
            <section key={group.day} aria-label={group.label} className="border-t border-oa-border first:border-t-0">
              <h3 className="oa-caption sticky top-0 z-[1] border-b border-oa-border bg-oa-bg px-4 py-1.5">{group.label}</h3>
              <ul className="divide-y divide-oa-border">
                {group.items.map((item) => (
                  <InboxRow key={item.id} item={item} unread={Boolean(mark && isUnread(item, mark))} today={today} lockMark={<ProMark />} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
