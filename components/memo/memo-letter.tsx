import Link from "next/link";

import { MoreLocked } from "@/components/oa/gate";
import { Tag } from "@/components/oa/kit";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { watchEarningsHref, watchMoveHref } from "@/lib/agents-plain/ask-links";
import type { Plan } from "@/lib/entitlements";
import type { Memo, MemoItem } from "@/lib/memo/types";
import { shortDay, weekTitle, weekdayName } from "@/lib/memo/week";

/**
 * The week's memo as a letter: the date, the top line, then what
 * changed, what could hurt and what is worth a look. Each item links to the
 * page that shows its evidence. An empty section says so in one line.
 */

const SECTIONS: Array<{ key: "changed" | "hurt" | "look"; title: string; empty: string }> = [
  { key: "changed", title: "What changed", empty: "Nothing else moved enough to mention." },
  { key: "hurt", title: "What could hurt", empty: "Nothing stands out as a risk this week." },
  { key: "look", title: "Worth a look", empty: "Nothing new to look at this week." },
];

/** The New York day of an ISO time, so a memo written at 9pm ET is not dated tomorrow. */
function newYorkDay(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

function dateLine(memo: Memo): string {
  const day = memo.writtenAt ? newYorkDay(memo.writtenAt) : null;
  const written = day ? shortDay(day) : null;
  if (memo.complete) return `${shortDay(memo.monday)} to ${shortDay(memo.friday)}${written ? ` · written ${written}` : ""}`;
  const through = memo.endDay ? `so far, through ${weekdayName(memo.endDay)}'s close` : "so far";
  return `${shortDay(memo.monday)} to ${shortDay(memo.friday)}, ${through}${written ? ` · updated ${written}` : ""}`;
}

/**
 * The next step for a risk, in place: an agent on the stock it names. An earnings risk gets a reminder before
 * the report; any other risk on one stock gets a big-move alert. Risks about the whole portfolio get none.
 */
function watchFor(item: MemoItem): { label: string; href: string } | null {
  const ticker = item.tickers.length === 1 ? item.tickers[0]! : null;
  if (!ticker) return null;
  if (item.kind === "upcoming_risk" || item.kind === "upcoming") {
    const href = watchEarningsHref(ticker, 3);
    return href ? { label: `Tell me 3 days before ${ticker} reports`, href } : null;
  }
  const href = watchMoveHref(ticker, 5);
  return href ? { label: `Tell me when ${ticker} moves 5% in a day`, href } : null;
}

function Item({ item, watch }: { item: MemoItem; watch?: { label: string; href: string } | null }) {
  return (
    <li className="flex gap-3 py-3 first:pt-2 last:pb-1">
      <ToneGlyph tone={item.tone} className="mt-[7px]" />
      <div className="min-w-0 flex-1">
        <p className="text-pretty text-[15px] leading-6 text-oa-fg">{item.text}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
          <Link href={item.href} className="font-medium text-oa-primary underline-offset-2 hover:underline">
            {item.linkLabel} →
          </Link>
          <span aria-hidden="true">·</span>
          <span>{item.source}</span>
        </p>
        {watch ? (
          <p className="mt-1 text-[12.5px] leading-[18px]">
            <Link href={watch.href} className="font-medium text-oa-primary underline-offset-2 hover:underline">
              {watch.label} →
            </Link>
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function MemoLetter({ memo, example, plan }: { memo: Memo; example: boolean; plan: Plan }) {
  return (
    <article aria-label={`Memo, ${weekTitle(memo)}`} className="oa-surface min-w-0 border border-oa-border bg-oa-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-oa-border px-4 py-3 sm:px-6">
        <p className="oa-label">{weekTitle(memo)}</p>
        {example ? <Tag tone="primary">Example</Tag> : null}
        {!memo.complete ? <Tag tone="warn">In progress</Tag> : null}
        <p className="oa-mono w-full text-[12.5px] tabular-nums text-oa-muted-fg sm:ml-auto sm:w-auto">{dateLine(memo)}</p>
      </header>
      <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <p className="max-w-[44rem] text-pretty text-[18px] font-semibold leading-[27px] tracking-[-0.01em] text-oa-fg sm:text-[20px] sm:leading-[30px]">
          {memo.topLine}
        </p>
        {SECTIONS.map((section) => {
          // Memos saved before the week's return moved into the top line still list it first; it repeats the top line.
          const items = section.key === "changed" ? memo.changed.filter((item) => item.kind !== "performance") : memo[section.key];
          return (
            <section key={section.key} aria-label={section.title} className="mt-6">
              <h2 className="oa-label border-b border-oa-border pb-2">{section.title}</h2>
              {items.length > 0 ? (
                <ul className="divide-y divide-oa-border">
                  {items.map((item) => (
                    <Item
                      key={item.id}
                      item={item}
                      // Risks get an agent; so does a report coming up, the one "worth a look" item an agent can watch.
                      watch={section.key === "hurt" || (section.key === "look" && item.kind === "upcoming") ? watchFor(item) : null}
                    />
                  ))}
                </ul>
              ) : (
                <p className="pt-3 text-[14.5px] leading-6 text-oa-muted-fg">{section.empty}</p>
              )}
            </section>
          );
        })}
      </div>
      {memo.heldBack > 0 && !example ? (
        <MoreLocked
          feature="briefing_personal"
          plan={plan}
          hidden={memo.heldBack}
          noun={memo.heldBack === 1 ? "reason left out, on a stock your plan does not cover" : "reasons left out, on stocks your plan does not cover"}
        />
      ) : null}
    </article>
  );
}
