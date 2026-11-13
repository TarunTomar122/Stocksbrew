import { Fragment, type CSSProperties } from "react";
import { FOCUS } from "@/components/oa/kit";
import { KindIcon, type KindIconName } from "@/components/oa/nav-icon";
import { conditionFigure, type ChangeCheck, type CheckSource } from "@/lib/call-evidence";
import { capitalize, dayWords } from "@/lib/day-words";
import { CALL_PLAIN } from "@/lib/plain-copy";
import type { CallWord } from "@/lib/stock-chart";
import { TONE_COLOR } from "./primitives";

/**
 * "What would change it" as grouped condition cards (owner, Nov 12: the bullet lists were "weird and totally breaks").
 * One group per call it could move to ("Could move to Buy more"), inside it one sub-group per event with its icon and
 * the shared line said once ("Next report · Tuesday", "Compared with the S&P 500"), then one figure-led card per
 * condition: the threshold large, what it is under it. A group's heading is only where it would move the call ("→ Keep"):
 * the cards say the rest. The cards are built from the checks' structured fields
 * (lib/call-evidence.ts `conditionFigure`), never from their sentences. Every source sits behind one "Sources" action
 * for the whole section.
 *
 * Layout by the section's own width, not the viewport: every card has a base width (--cb), a group's base is its
 * cards' bases plus the gaps between them, and each level is a wrapping flex row that grows by card count. So the two
 * groups sit side by side only when all their cards fit on one line; otherwise they stack, and on a phone every card
 * is full width. Cards on one line are the same height.
 */

const DESTINATION_COLOR: Record<CallWord, string> = { Add: TONE_COLOR.up, Hold: "var(--oa-fg)", Trim: TONE_COLOR.down };
const EVENT_ICON: Record<ChangeCheck["event"], KindIconName> = { report: "calendar", move: "movers" };

/** A card with two conditions takes two cards' width. */
function unitsOf(check: ChangeCheck): number {
  return Math.max(1, check.conditions?.length ?? 1);
}

/** Flex sizing for something `units` cards wide: grows by its card count from a base of its cards plus their gaps. */
function span(units: number): CSSProperties {
  return { flex: `${units} 1 calc(${units} * var(--cb) + ${units - 1} * var(--cg))`, minWidth: 0 };
}

/**
 * One card in all is capped at every width (it is never stretched across the section). Otherwise the cap only
 * applies once the section is wide enough for the groups to share one line (56rem: a two-unit card plus
 * four one-unit cards); narrower, groups wrap onto their own lines and a capped one would leave a gap beside it, so
 * there they fill their line instead (council, Nov 12).
 */
const CAP_WHEN_WIDE = "[@container(min-width:56rem)]:max-w-[var(--lone-cap,none)]";

function cardsIn(group: Group): number {
  return group.subs.reduce((sum, sub) => sum + sub.items.length, 0);
}

/** The widest a lone card (and its column) may grow: twice its base, so it is never stretched across the strip. */
function loneCap(units: number): string {
  return `calc(2 * (${units} * var(--cb) + ${units - 1} * var(--cg)))`;
}

type SubGroup = { event: ChangeCheck["event"]; items: ChangeCheck[]; units: number };
type Group = { to: CallWord; subs: SubGroup[]; units: number };

function groupChecks(all: ReadonlyArray<ChangeCheck>): Group[] {
  const groups: Group[] = [];
  // Only checks with structured conditions become cards; one without them is left out rather than shown as a sentence
  // (council, Nov 12: never a long sentence card).
  const list = all.filter((item) => item.conditions?.length);
  // Up first, then down: the order a Keep call reads them in.
  for (const way of ["raise", "lower"] as const) {
    const ofWay = list.filter((item) => item.way === way);
    if (!ofWay.length) continue;
    const subs: SubGroup[] = [];
    for (const event of ["report", "move"] as const) {
      // A check from before the structured fields counts as a report check.
      const items = ofWay.filter((item) => (item.event ?? "report") === event);
      if (items.length) subs.push({ event, items, units: items.reduce((sum, item) => sum + unitsOf(item), 0) });
    }
    groups.push({ to: ofWay[0]!.to, subs, units: subs.reduce((sum, sub) => sum + sub.units, 0) });
  }
  return groups;
}

function subLabel(sub: SubGroup, today: string): string {
  if (sub.event === "move") return `Compared with the ${sub.items[0]?.conditions?.[0]?.benchmark ?? "S&P 500"}`;
  const date = sub.items.find((item) => item.eventDate)?.eventDate ?? null;
  const when = date ? dayWords(date, today) : "";
  return when ? `Next report · ${capitalize(when)}` : "Next report";
}

/**
 * One condition card, figure-led (council, Nov 12): each threshold large with what it is under it ("$2.49" / "earnings
 * per share"). A single threshold says its side small before the figure ("below $2.49"); a combined card joins its
 * figures with AND and says the side once under them ("Above both"), the report it waits for being the sub-group's line.
 */
function CheckCard({ check }: { check: ChangeCheck }) {
  const parts = check.conditions.map(conditionFigure);
  const sides = new Set(parts.map((part) => part.side));
  // "Above both" only when every figure is on the same side; a loss under one figure and growth above another keep their own words.
  const shared = parts.length > 1 && sides.size === 1 && (parts[0]!.side === "above" || parts[0]!.side === "below") ? parts[0]!.side : "";
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {parts.map((part, index) => (
          <Fragment key={`${part.label}-${index}`}>
            {index ? <span className="text-[12px] font-semibold tracking-[0.04em] text-oa-muted-fg">AND</span> : null}
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-1">
                {part.side && !shared ? <span className="text-[13px] leading-5 text-oa-muted-fg">{part.side}</span> : null}
                <span className="oa-mono text-[22px] font-semibold leading-7 tracking-[-0.01em] text-oa-fg">{part.figure}</span>
              </p>
              <p className="text-pretty text-[13px] leading-[18px] text-oa-muted-fg">{part.label}</p>
            </div>
          </Fragment>
        ))}
      </div>
      {shared ? <p className="mt-1.5 text-[13px] font-medium leading-[18px] text-oa-fg">{capitalize(shared)} both</p> : null}
    </>
  );
}

function Sources({ list }: { list: ReadonlyArray<ChangeCheck> }) {
  const seen = new Set<string>();
  const sources: CheckSource[] = [];
  for (const check of list) {
    const parts = check.sources?.length ? check.sources : check.source ? [{ source: check.source, href: check.href }] : [];
    for (const part of parts) {
      if (!part.source || seen.has(part.source)) continue;
      seen.add(part.source);
      sources.push(part);
    }
  }
  if (!sources.length) return null;
  return (
    <details className="group/sources relative shrink-0">
      <summary
        className={`cursor-pointer list-none rounded text-[13px] leading-5 text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg group-open/sources:text-oa-fg [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        Sources
      </summary>
      <ul
        role="list"
        className="absolute right-0 top-full z-20 mt-1.5 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-1.5 rounded-lg border border-oa-border bg-oa-card p-3 text-[13px] leading-[18px] text-oa-muted-fg shadow-lg"
      >
        {sources.map((part) => (
          <li key={part.source} className="text-pretty">
            {part.href ? (
              <a href={part.href} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                {part.source}
              </a>
            ) : (
              part.source
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ChangeChecks({ list, today, wide }: { list: ReadonlyArray<ChangeCheck>; today: string; wide: boolean }) {
  const groups = groupChecks(list);
  if (!groups.length) return null;
  // One card in all: it keeps its card width, never stretched across the section.
  const onlyOne = groups.reduce((sum, group) => sum + cardsIn(group), 0) === 1;
  return (
    <section aria-label="What would change it" className={`[container-type:inline-size] ${wide ? "" : "max-w-[62ch]"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-medium leading-5 text-oa-fg">What would change it</h2>
        <Sources list={list} />
      </div>
      {/* A card's base width: two figure-led cards fit side by side on a phone (a 390px screen has about 21rem), and a
          two-figure card takes the line; closer from 40rem. */}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-4 [--cb:9.5rem] [--cg:0.75rem] [@container(min-width:40rem)]:[--cb:8.5rem]">
        {groups.map((group) => (
          // A one-card group is capped only when another group can take the rest of the line (it has more cards);
          // when every group is one card they share the line evenly, so neither leaves an empty gap (owner rule 4).
          <div
            key={group.to}
            style={
              onlyOne
                ? { ...span(group.units), maxWidth: loneCap(group.units), ["--lone-cap" as string]: "none" }
                : cardsIn(group) === 1 && groups.some((other) => cardsIn(other) > 1)
                  ? { ...span(group.units), ["--lone-cap" as string]: loneCap(group.units) }
                  : { ...span(group.units), ["--lone-cap" as string]: "none" }
            }
            className={`flex flex-col ${CAP_WHEN_WIDE}`}
          >
            {/* Where the checks below would move the call, as the call word alone (judge 91: "Any one could move it to
                Keep" restated the cards). Screen readers still hear the sentence. */}
            <h3 className="flex items-center gap-1.5 text-[14px] font-semibold leading-5 text-oa-fg">
              <span className="sr-only">Could move it to </span>
              <span aria-hidden="true" className="text-oa-muted-fg">→</span>
              <span style={{ color: DESTINATION_COLOR[group.to] }}>{CALL_PLAIN[group.to]}</span>
            </h3>
            <div className="mt-1.5 flex flex-1 flex-wrap gap-[var(--cg)]">
              {group.subs.map((sub) => (
                // A lone card stops growing at twice its base (below), so its column stops there too: otherwise the
                // column kept growing and left an empty gap before the next one (owner, Nov 12: "weird empty space").
                <div
                  key={sub.event}
                  style={(onlyOne || (sub.items.length === 1 && group.subs.some((other) => other.items.length > 1))) ? { ...span(sub.units), ["--lone-cap" as string]: loneCap(sub.units) } : { ...span(sub.units), ["--lone-cap" as string]: "none" }}
                  className={`flex flex-col ${CAP_WHEN_WIDE}`}
                >
                  <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-oa-muted-fg">
                    <KindIcon name={EVENT_ICON[sub.event]} className="size-3.5" />
                    {subLabel(sub, today)}
                  </p>
                  <ul role="list" className="mt-1.5 flex flex-1 flex-wrap gap-[var(--cg)]">
                    {sub.items.map((item) => {
                      const units = unitsOf(item);
                      const usual = item.conditions?.[0]?.usual;
                      return (
                        <li
                          key={item.text}
                          // Grows with its line. A lone card never grows past twice its base, so it is not stretched
                          // across the strip; cards with neighbours share the line out and fill it (owner rule 4).
                          // A lone card fills its column; the column itself is capped above when something beside
                          // it can take the space, so a card is never stretched across an empty strip.
                          style={span(units)}
                          className="flex flex-col rounded-lg border border-oa-border bg-oa-bg px-3 py-2.5"
                          title={usual ? `A normal day's gap is about ${usual} points` : undefined}
                        >
                          <CheckCard check={item} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
