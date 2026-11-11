import { MoreLocked } from "@/components/oa/gate";
import { Tag } from "@/components/oa/kit";
import type { Plan } from "@/lib/entitlements";
import { firstFullSentence } from "@/lib/plain-copy";
import type { Memo, MemoItem, MemoMover } from "@/lib/memo/types";
import { cardItems } from "@/lib/memo/view";
import { shortDay, sinceCloseWords, weekTitle, weekdayName } from "@/lib/memo/week";

import { CallChanges } from "./calls";
import { explainDays, plainFootnote } from "./explain";
import { MemoCards } from "./cards";
import { Movers } from "./movers";
import { WeekChart } from "./week-chart";

/**
 * The week's memo, picture first: a short headline over the week's line
 * against the S&P 500, the holdings that moved it, the calls that changed,
 * then what could hurt and what is worth a look as cards. Every figure comes
 * from the memo's facts; each card shows its full sentence. A memo
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

/**
 * The week's biggest driver, named before the chart: "NVIDIA's 9.5% drop took 1.4 points off the week." While the
 * week runs it says where the move is measured from ("since Friday's close"), so it is not read as a five-session move.
 */
function DriverLine({ movers, since }: { movers: MemoMover[]; since: string }) {
  const top = [...movers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];
  if (!top || Math.abs(top.points) < 0.05) return null;
  const size = `${Math.abs(top.pct).toFixed(1)}%`;
  const shown = Math.abs(top.points).toFixed(1);
  const points = shown === "1.0" ? "1 point" : Number(shown) > 1 ? `${shown} points` : `${shown} of a point`;
  const text =
    top.points < 0
      ? `${top.name || top.ticker}'s ${size} ${top.pct < 0 ? "drop" : "move"}${since ? ` ${since}` : ""} took ${points} off the week, the most of any holding.`
      : `${top.name || top.ticker}'s ${size} ${top.pct > 0 ? "rise" : "move"}${since ? ` ${since}` : ""} added ${points}, more than any other holding.`;
  return <p className="mt-1 text-pretty text-[14.5px] leading-[21px] text-oa-muted-fg">{text}</p>;
}

/**
 * The week list (`rail`) sits beside the chart only; everything under it runs the full width, in pairs, so the page
 * never shows an empty right-hand column (owner, Nov 11).
 */
export function MemoLetter({ memo, example, plan, rail = null }: { memo: Memo; example: boolean; plan: Plan; rail?: React.ReactNode }) {
  const view = memo.view ?? null;
  const hasView = Boolean(view);
  const hurt = cardItems(memo.hurt, hasView);
  const look = cardItems(memo.look, hasView);
  const also = cardItems(memo.changed, hasView);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-stretch">
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
          {view ? <DriverLine movers={view.movers} since={sinceCloseWords(view.curve[0]?.day, memo.complete)} /> : null}
          {view && view.curve.length >= 2 ? (
            <div className="mt-3">
              <WeekChart curve={view.curve} subject={memo.subject} days={explainDays(memo, view.curve)} />
            </div>
          ) : null}
          {view?.footnote ? <p className="mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg">{plainFootnote(view.footnote)}</p> : null}
        </div>
      </article>
      {/* On wide screens the week list takes the chart's height and scrolls inside it, so neither leaves a gap. */}
      {rail ? (
        <div className="min-w-0 lg:relative">
          <div className="lg:absolute lg:inset-0 lg:flex lg:flex-col">{rail}</div>
        </div>
      ) : null}
      </div>

      {/* Each its own row of stock cards, the full width, so neither leaves a gap beside the other. */}
      {view ? <Movers movers={view.movers} memo={memo} example={example} /> : null}
      {view ? <CallChanges calls={view.calls} memo={memo} example={example} /> : null}

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
