"use client";

import * as React from "react";

import { Verdict } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { askWhyHref, COPILOT_PATH, type BriefingItem, type BriefingItemStatus } from "@/lib/briefing";
import { moveRowText, reasonSource, visibleLines, type BriefingGroup, type BriefingLine } from "@/lib/briefing-groups";

import { compactTime, signedPct, sourceTime } from "./format";
import { verdictFor } from "./item-metric";
import { trackBriefingItemOpened } from "@/lib/product-analytics";

const ACTION =
  "inline-flex h-10 cursor-pointer items-center rounded-md border border-oa-border bg-oa-card px-2.5 text-[13px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-50 sm:h-7";
const QUIET_ACTION =
  "inline-flex h-10 cursor-pointer items-center rounded-md px-1.5 text-[13px] font-medium text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-50 sm:h-7";
const SOFT = "text-[color:color-mix(in_srgb,var(--oa-fg)_80%,transparent)]";
const LINK = "underline decoration-oa-border underline-offset-2 hover:text-oa-fg hover:decoration-[color:color-mix(in_srgb,var(--oa-fg)_40%,transparent)]";

export type GroupActions = {
  statusOf: (id: string) => BriefingItemStatus;
  /** Sets every item to the status; the view saves them and rolls back what did not save. */
  onStatus: (items: BriefingItem[], status: BriefingItemStatus, busyKey: string) => void;
  busy: string | null;
  /** An earlier day shown as it read then: no actions. */
  readOnly: boolean;
  /** The briefing's day, so a time from that day prints without its date. */
  day: string;
};

function isExternal(url: string | null | undefined): boolean {
  return Boolean(url && /^https?:/.test(url));
}

/** The status shared by a set of items: open while any of them is still open. */
function sharedStatus(items: BriefingItem[], actions: GroupActions): BriefingItemStatus {
  const statuses = items.map((item) => actions.statusOf(item.id));
  if (statuses.some((status) => status === "open")) return "open";
  return statuses.every((status) => status === "dismissed") ? "dismissed" : "kept";
}

function Sources({ items }: { items: BriefingItem[] }) {
  const seen = new Set<string>();
  const entries = items
    .flatMap((item) => item.evidence)
    .filter((entry) => {
      const key = `${entry.url ?? ""}|${entry.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (entries.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {entries.map((entry, index) => {
        const when = sourceTime(entry.at);
        return (
          <li key={`${entry.label}-${index}`} className="flex flex-col gap-x-3 text-[13px] leading-5 sm:flex-row sm:items-baseline sm:justify-between">
            {entry.url ? (
              <a href={entry.url} {...(isExternal(entry.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`min-w-0 truncate ${SOFT} ${LINK}`}>
                {entry.label}
              </a>
            ) : (
              <span className={`min-w-0 truncate ${SOFT}`}>{entry.label}</span>
            )}
            <span className="shrink-0 whitespace-nowrap text-[12px] text-oa-muted-fg">
              {entry.source}
              {when ? ` · ${when}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** What opens under a line: where it comes from, the reason, the next step, the sources and the actions. */
function LinePanel({ id, line, group, actions }: { id: string; line: BriefingLine; group: BriefingGroup; actions: GroupActions }) {
  const { item } = line;
  const members = [item, ...line.folded];
  const status = sharedStatus(members, actions);
  const groupStatus = sharedStatus(group.items, actions);
  const busyLine = actions.busy === line.id;
  const busyGroup = actions.busy === group.key;
  const when = compactTime(line.source?.at, actions.day);
  const story = line.explainedBy?.evidence[0] ?? null;
  const showWhy = item.why.trim() && item.why.trim() !== line.text;
  const subject = group.ticker ?? "these";
  const others = group.items.length > members.length;
  // The good-or-bad word (Upgraded, Bearish) waits here: the collapsed row keeps one accent, the move.
  const found = verdictFor(item);
  const verdict = found && !line.text.toLowerCase().includes(found.word.toLowerCase()) ? found : null;

  return (
    <div id={id} className="pb-2 pt-1">
      <p className="flex flex-wrap items-center gap-x-2 text-[12px] leading-5 text-oa-muted-fg">
        {verdict ? <Verdict tone={verdict.tone}>{verdict.word}</Verdict> : null}
        {[line.label, story ? `via ${story.source}` : line.source?.source, when].filter(Boolean).join(" · ")}
      </p>
      <dl className="mt-1.5 grid max-w-[68ch] gap-1.5 text-[13.5px] leading-5">
        {showWhy ? <dd className={`text-pretty ${SOFT}`}>{item.why}</dd> : null}
        {story ? (
          <div>
            <dt className="oa-caption">The reason</dt>
            <dd className="mt-0.5">
              {story.url ? (
                <a href={story.url} {...(isExternal(story.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`${SOFT} ${LINK}`}>
                  {story.label}
                </a>
              ) : (
                <span className={SOFT}>{story.label}</span>
              )}
            </dd>
          </div>
        ) : null}
        {item.position_note ? (
          <div>
            <dt className="oa-caption">For you</dt>
            <dd className={`mt-0.5 text-pretty ${SOFT}`}>{item.position_note}</dd>
          </div>
        ) : null}
        <div>
          <dt className="oa-caption">Next step</dt>
          <dd className="mt-0.5 text-pretty text-oa-fg">{item.next_step}</dd>
        </div>
      </dl>
      <Sources items={members} />
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {actions.readOnly ? null : status === "open" ? (
          <>
            <button type="button" className={ACTION} disabled={busyLine} title="Hide it for today" onClick={() => actions.onStatus(members, "dismissed", line.id)}>
              Got it
            </button>
            <button type="button" className={ACTION} disabled={busyLine} title="Set it aside and keep it in today's list" onClick={() => actions.onStatus(members, "kept", line.id)}>
              Keep watching
            </button>
          </>
        ) : (
          <button type="button" className={ACTION} disabled={busyLine} onClick={() => actions.onStatus(members, "open", line.id)}>
            Put it back
          </button>
        )}
        <a href={askWhyHref(item)} className={ACTION} title={COPILOT_PATH ? "Ask about this" : "Open the page that explains it"}>
          Ask why
        </a>
        {!actions.readOnly && others && groupStatus === "open" ? (
          <button type="button" className={QUIET_ACTION} disabled={busyGroup} onClick={() => actions.onStatus(group.items, "dismissed", group.key)}>
            Got it for all {group.items.length} on {subject}
          </button>
        ) : null}
        {!actions.readOnly && others && groupStatus !== "open" ? (
          <button type="button" className={QUIET_ACTION} disabled={busyGroup} onClick={() => actions.onStatus(group.items, "open", group.key)}>
            Put all {group.items.length} back
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A confirmed move's reason, company first, in one whole sentence (lib/briefing-groups.ts `moveRowText`). */
function lineText(line: BriefingLine, group: BriefingGroup): string {
  return line.decision ? line.text : moveRowText(line.item, { name: group.name, ticker: group.ticker }, group.day_change_pct);
}

function LineRow({ line, group, actions }: { line: BriefingLine; group: BriefingGroup; actions: GroupActions }) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const settled = sharedStatus([line.item, ...line.folded], actions) !== "open";
  return (
    <li className={settled ? "opacity-70" : ""}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) trackBriefingItemOpened({ kind: line.item.kind, ticker: group.ticker ?? line.item.ticker, relation: line.item.relation, decision: line.decision });
          setOpen((value) => !value);
        }}
        className={`-mx-1.5 block w-[calc(100%+0.75rem)] cursor-pointer rounded px-1.5 py-0.5 text-left text-[14px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent ${
          line.decision ? "font-medium text-oa-fg" : SOFT
        }`}
      >
        <span className="text-pretty">{lineText(line, group)}</span>
        {/* Who reported the reason, named beside it; the link and the time are one tap away in the panel. */}
        {reasonSource(line.item) ? <span className="ml-1.5 whitespace-nowrap text-[12px] text-oa-muted-fg">{reasonSource(line.item)}</span> : null}
      </button>
      {open ? <LinePanel id={panelId} line={line} group={group} actions={actions} /> : null}
    </li>
  );
}

/**
 * One stock, quietly: the logo, the ticker and the day's move, then its most
 * important update in plain words. The rest wait behind "+N".
 */
export function BriefingGroupCard({
  group,
  actions,
  limit,
  moveMax,
}: {
  group: BriefingGroup;
  actions: GroupActions;
  limit: number;
  /** The largest move in the list: when given, each move gets a bar on that one scale. */
  moveMax?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { shown, hidden } = visibleLines(group.lines, expanded, limit);
  const settled = sharedStatus(group.items, actions) !== "open";
  const move = group.day_change_pct;
  const ticker = group.ticker;

  return (
    <article
      data-briefing-group={group.key}
      className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 px-4 py-2.5 sm:grid-cols-[1.25rem_3.75rem_minmax(0,1fr)_4.5rem] ${settled ? "opacity-80" : ""}`}
    >
      <span className="col-start-1 row-start-1 pt-px">
        {ticker ? (
          <StockLogo ticker={ticker} size={20} className="rounded-md" />
        ) : (
          <span aria-hidden="true" className="oa-mono flex size-5 items-center justify-center rounded-md bg-oa-bg text-[8px] font-medium text-oa-muted-fg">
            JOB
          </span>
        )}
      </span>
      <span className="col-start-2 row-start-1 min-w-0 leading-5">
        {ticker ? (
          <a
            href={`/stock/${encodeURIComponent(ticker)}`}
            title={group.name !== ticker ? group.name : undefined}
            className="oa-mono rounded text-[14px] font-semibold text-oa-fg outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          >
            {ticker}
          </a>
        ) : (
          <span className="text-[14px] font-semibold text-oa-fg">{group.name}</span>
        )}
      </span>
      <span className="col-start-3 row-start-1 text-right leading-5 sm:col-start-4">
        {move != null ? (
          <span className="inline-flex items-center justify-end gap-2">
            <span className={`oa-mono whitespace-nowrap text-[14px] tabular-nums ${move >= 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{signedPct(move)}</span>
          </span>
        ) : null}
      </span>
      <ul className="col-span-2 col-start-2 row-start-2 mt-0.5 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0">
        {shown.map((line) => (
          <LineRow key={line.id} line={line} group={group} actions={actions} />
        ))}
        {group.lines.length > limit ? (
          <li>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="-ml-1.5 inline-flex h-9 cursor-pointer items-center rounded px-1.5 text-[12.5px] font-medium text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:h-6"
            >
              {expanded ? "Show less" : `${hidden} more ${hidden === 1 ? "update" : "updates"}`}
            </button>
          </li>
        ) : null}
      </ul>
    </article>
  );
}
