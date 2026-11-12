"use client";

import * as React from "react";

import { Verdict } from "@/components/oa/kit/tone";
import { askWhyQuestion, type BriefingItem, type BriefingItemStatus } from "@/lib/briefing";
import { reasonSource, type BriefingGroup, type BriefingLine } from "@/lib/briefing-groups";

import { briefAskHref, briefContext } from "./ask";
import { compactTime, signedPct, sourceTime } from "./format";
import { plainCardText, rowWords, unTitle, type CardWords } from "./card-words";
import { verdictFor } from "./item-metric";
import { StockCard } from "./stock-card";
import { trackBriefingItemOpened } from "@/lib/product-analytics";
import { AppLink } from "@/components/oa/app-link";

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
  /**
   * Your own briefing: an opened card keeps only what to do with it (the page's one Ask box sits under the read).
   * The market view keeps "Ask why" inside the opened card, about the stock.
   */
  personal?: boolean;
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

/** A source's headline as a sentence, the same casing path as the card face (./card-words.ts unTitle, owner rule 8). */
function sourceTitle(label: string, company: string, names: readonly string[]): string {
  return unTitle(label, company, names) || label;
}

function Sources({ items, company, names }: { items: BriefingItem[]; company: string; names: readonly string[] }) {
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
              <AppLink href={entry.url} {...(isExternal(entry.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`min-w-0 truncate ${SOFT} ${LINK}`}>
                {sourceTitle(entry.label, company, names)}
              </AppLink>
            ) : (
              <span className={`min-w-0 truncate ${SOFT}`}>{sourceTitle(entry.label, company, names)}</span>
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
function LinePanel({
  id,
  line,
  group,
  actions,
  names,
  stockLink = false,
}: {
  id: string;
  line: BriefingLine;
  group: BriefingGroup;
  actions: GroupActions;
  /** The section's company names, kept capitalised in source titles. */
  names: readonly string[];
  stockLink?: boolean;
}) {
  const { item } = line;
  const members = [item, ...line.folded];
  const status = sharedStatus(members, actions);
  const groupStatus = sharedStatus(group.items, actions);
  const busyLine = actions.busy === line.id;
  const busyGroup = actions.busy === group.key;
  const when = compactTime(line.source?.at, actions.day);
  const story = line.explainedBy?.evidence[0] ?? null;
  // The same plain words as the card face: old saved briefings said "The call is Hold" and "What would change it".
  const why = plainCardText(item.why);
  const nextStep = plainCardText(item.next_step);
  const showWhy = why && why !== line.text;
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
        {showWhy ? <dd className={`text-pretty ${SOFT}`}>{why}</dd> : null}
        {story ? (
          <div>
            <dt className="oa-caption">The reason</dt>
            <dd className="mt-0.5">
              {story.url ? (
                <AppLink href={story.url} {...(isExternal(story.url) ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`${SOFT} ${LINK}`}>
                  {sourceTitle(story.label, group.name, names)}
                </AppLink>
              ) : (
                <span className={SOFT}>{sourceTitle(story.label, group.name, names)}</span>
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
        {nextStep ? (
          <div>
            <dt className="oa-caption">Next step</dt>
            <dd className="mt-0.5 text-pretty text-oa-fg">{nextStep}</dd>
          </div>
        ) : null}
      </dl>
      <Sources items={members} company={group.name} names={names} />
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
        {actions.personal ? null : (
          <AppLink href={briefAskHref(askWhyQuestion(item), briefContext(item, actions.day, false))} className={ACTION} title="Ask about this">
            Ask why
          </AppLink>
        )}
        {/* Only on an opened card, so the stock's page is one tap away without a link on every card. */}
        {stockLink && group.ticker ? (
          <AppLink href={`/stock/${encodeURIComponent(group.ticker)}`} className={QUIET_ACTION}>
            {group.ticker} research
          </AppLink>
        ) : null}
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

function LineRow({ line, group, actions, names }: { line: BriefingLine; group: BriefingGroup; actions: GroupActions; names: readonly string[] }) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  const settled = sharedStatus([line.item, ...line.folded], actions) !== "open";
  // A move with no reason says nothing about the missing reason (owner, Nov 11): it shows its next step instead.
  const text = rowWords(line, group);
  if (!text) return null;
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
        className={`-mx-1.5 block w-[calc(100%+0.75rem)] cursor-pointer rounded px-1.5 py-1 text-left text-[14px] leading-5 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent ${
          line.decision ? "font-medium text-oa-fg" : SOFT
        }`}
      >
        <span className="text-pretty">{text}</span>
        {/* Who reported the reason, named beside it; the link and the time are one tap away in the panel. */}
        {reasonSource(line.item) ? <span className="ml-1.5 whitespace-nowrap text-[12px] text-oa-muted-fg">{reasonSource(line.item)}</span> : null}
      </button>
      {open ? <LinePanel id={panelId} line={line} group={group} actions={actions} names={names} /> : null}
    </li>
  );
}

/**
 * One stock as a small card (owner, Nov 11): the logo, ticker and short name, the day's move as the one big
 * figure, the one thing to know as a plain sentence, and at most one highlighted fact. The whole card is one
 * button that opens it in place (it then takes the whole row): the reason, the sources and what to do with it,
 * then the stock's other updates. The section works out the words (./card-words.ts) so no card repeats another.
 */
export function BriefingGroupCard({
  group,
  words,
  actions,
  names = [],
  anchor = false,
  fill = "",
}: {
  group: BriefingGroup;
  words: CardWords;
  actions: GroupActions;
  /** The section's company names: an opened card's source titles keep their capitals, as the card faces do. */
  names?: readonly string[];
  /** Spans that let the last card fill its row (./stock-card.tsx `stockGridFill`). */
  fill?: string;
  /** The first open card of its stock on the page: it carries the `brief-<ticker>` id the agents strip links to. */
  anchor?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const panelId = React.useId();
  const settled = sharedStatus(group.items, actions) !== "open";
  const move = group.day_change_pct;
  const ticker = group.ticker;
  const main = words.line;
  // Closed, the face says the main line and the next update (words.more). Opened, every other update is a row with
  // its reason, sources and actions, the next update included, and the face's extra line steps aside.
  const others = group.lines.filter((line) => line !== main && rowWords(line, group) && (expanded || line !== words.moreLine));
  const subject = ticker ?? group.name;

  return (
    <StockCard
      data-briefing-group={group.key}
      // The agents strip links a stock its agent flagged to its card here (one card per stock, lib/briefing-anchors.ts).
      id={anchor && ticker ? `brief-${ticker}` : undefined}
      className="scroll-mt-20"
      ticker={ticker}
      name={group.name}
      figure={move != null ? signedPct(move, 1) : null}
      tone={move == null ? "flat" : move >= 0 ? "up" : "down"}
      sentence={words.sentence || null}
      extra={expanded ? null : words.more}
      fact={words.fact}
      // No "N other updates" foot (owner rules 1, 2): the face says the two things worth saying and the card itself opens.
      foot={expanded ? "Show less" : null}
      muted={settled}
      expanded={expanded}
      fill={fill}
      cover={
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
          aria-label={[
            subject,
            move != null ? signedPct(move, 1) : null,
            words.sentence || null,
            words.more,
            words.fact,
          ]
            .filter(Boolean)
            .join(", ")}
          onClick={() => {
            if (!expanded && main) trackBriefingItemOpened({ kind: main.item.kind, ticker: ticker ?? main.item.ticker, relation: main.item.relation, decision: main.decision });
            setExpanded((value) => !value);
          }}
          className="absolute inset-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      }
    >
      {expanded ? (
        <div id={panelId}>
          {main ? <LinePanel id={`${panelId}-main`} line={main} group={group} actions={actions} names={names} stockLink /> : null}
          {others.length > 0 ? (
            <ul className={main ? "mt-1 border-t border-oa-border pt-1.5" : ""}>
              {others.map((line) => (
                <LineRow key={line.id} line={line} group={group} actions={actions} names={names} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </StockCard>
  );
}
