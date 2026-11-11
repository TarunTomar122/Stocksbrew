import { MoreLocked } from "@/components/oa/gate";
import { Tag } from "@/components/oa/kit";
import type { Plan } from "@/lib/entitlements";
import { firstFullSentence } from "@/lib/plain-copy";
import type { Memo, MemoItem } from "@/lib/memo/types";
import { cardItems } from "@/lib/memo/view";
import { shortDay, weekTitle, weekdayName } from "@/lib/memo/week";

import { CallChanges } from "./calls";
import { explainDays } from "./explain";
import { MemoCards } from "./cards";
import { Movers } from "./movers";
import { WeekChart } from "./week-chart";

/**
 * The week's memo, picture first: a short headline over the week's line
 * against the S&P 500, the holdings that moved it, the calls that changed,
 * then what could hurt and what is worth a look as cards. Every figure comes
 * from the memo's facts; each card's full sentence sits behind "Why". A memo
 * written before the page went visual has no view, so it shows its top line
 * and its sentences as cards.
 */

/** The New York day of an ISO time, so a memo written at 9pm ET is not dated tomorrow. */
function newYorkDay(iso: string): string | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

function dateLine(memo: Memo): string {
  const day = memo.writtenAt ? newYorkDay(memo.writtenAt) : null;
  const written = day ? shortDay(day) : null;
  if (memo.complete) return `${shortDay(memo.monday)} to ${shortDay(memo.friday)}${written ? ` · written ${written}` : ""}`.replace(/\b([A-Z][a-z]{2}) (\d)/g, "$1\u00a0$2");
  const through = memo.endDay ? `through ${weekdayName(memo.endDay)}'s close` : "so far";
  return `${shortDay(memo.monday)} to ${shortDay(memo.friday)}, ${through}${written ? ` · updated ${written}` : ""}`.replace(/\b([A-Z][a-z]{2}) (\d)/g, "$1\u00a0$2");
}

/** Risks get an agent as their action; so does a report coming up, the one "worth a look" item an agent can watch. */
const watchHurt = () => true;
const watchLook = (item: MemoItem) => item.kind === "upcoming";
const watchNone = () => false;

export function MemoLetter({ memo, example, plan }: { memo: Memo; example: boolean; plan: Plan }) {
  const view = memo.view ?? null;
  const hasView = Boolean(view);
  const hurt = cardItems(memo.hurt, hasView);
  const look = cardItems(memo.look, hasView);
  const also = cardItems(memo.changed, hasView);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <article aria-label={`Memo, ${weekTitle(memo)}`} className="oa-surface min-w-0 border border-oa-border bg-oa-card">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-oa-border px-4 py-2.5 sm:px-5">
          <p className="oa-label">{weekTitle(memo)}</p>
          {example ? <Tag tone="primary">Example</Tag> : null}
          {!memo.complete ? <Tag tone="warn">In progress</Tag> : null}
          <p className="oa-mono w-full text-[12.5px] tabular-nums text-oa-muted-fg sm:ml-auto sm:w-auto">{dateLine(memo)}</p>
        </header>
        <div className="px-4 pb-4 pt-3.5 sm:px-5">
          <h2 className="text-balance text-[21px] font-semibold leading-[28px] tracking-[-0.015em] text-oa-fg sm:text-[24px] sm:leading-[31px]">
            {view ? view.headline : firstFullSentence(memo.topLine)}
          </h2>
          {view && view.curve.length >= 2 ? (
            <div className="mt-3">
              <WeekChart curve={view.curve} subject={memo.subject} days={explainDays(memo, view.curve)} />
            </div>
          ) : null}
          {view?.footnote ? <p className="mt-2 text-[12px] leading-4 text-oa-muted-fg">{view.footnote}</p> : null}
        </div>
      </article>

      {view ? (
        <>
          <Movers movers={view.movers} memo={memo} example={example} />
          <CallChanges calls={view.calls} memo={memo} example={example} />
        </>
      ) : null}

      <MemoCards title="What could hurt" items={hurt} empty="Nothing stands out as a risk this week." example={example} watchable={watchHurt} />
      <MemoCards title="Worth a look" items={look} empty="Nothing new to look at this week." example={example} watchable={watchLook} />
      {also.length > 0 ? <MemoCards title="Also this week" items={also} empty="" example={example} watchable={watchNone} /> : null}

      {memo.heldBack > 0 && !example ? (
        <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
          <MoreLocked
            feature="briefing_personal"
            plan={plan}
            hidden={memo.heldBack}
            noun={memo.heldBack === 1 ? "reason left out, on a stock your plan does not cover" : "reasons left out, on stocks your plan does not cover"}
            className="border-t-0"
          />
        </div>
      ) : null}
    </div>
  );
}
