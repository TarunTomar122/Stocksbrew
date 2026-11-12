import { AppLink } from "@/components/oa/app-link";
import { capitalize, dayWords, daysFromToday, etToday } from "@/lib/day-words";
import { wholeSentences } from "@/lib/plain-copy";
import type { StockTimelineItem, StockTimelineKind } from "@/lib/stock-timeline";

import { VsBar } from "@/components/oa/kit/vs-bar";

import { fmtDate, shortFact } from "./format";
import { NUM, Tag, ToneGlyph } from "./primitives";

/**
 * One row of "What changed": the headline, then the day, said once. The row itself is the link (owner rule 1: no
 * "View on Yahoo" on every row); a headline's publisher is named once in the section's head (below.tsx), so a news
 * row carries only its day. The rarer rows (a move, a report, our call) keep what they are and their one line of
 * detail, since that is the news in them. Server and client safe.
 */

const KIND_LABEL: Record<StockTimelineKind, string> = {
  move: "Move",
  earnings: "Earnings",
  analyst: "Analysts",
  news: "News",
  congress: "Congress",
  discussion: "Reddit",
  dividend: "Dividend",
  call: "Our call",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A month-long entry (analyst ratings) in words beside the day words of its neighbours (judges, ship 71: "Nov 2026"
 * beside "Today"): "This month", "Last month", the month's name earlier this year, and the year only before that.
 */
export function timelineMonthWords(at: string, today: string): string {
  const year = Number(at.slice(0, 4));
  const month = Number(at.slice(5, 7));
  const nowYear = Number(today.slice(0, 4));
  const nowMonth = Number(today.slice(5, 7));
  if (!year || !month || !nowYear || !nowMonth) return at.slice(0, 7);
  const back = (nowYear - year) * 12 + (nowMonth - month);
  if (back <= 0) return "This month";
  if (back === 1) return "Last month";
  const name = MONTH_NAMES[month - 1] ?? "";
  return year === nowYear ? name : `${name} ${year}`;
}

export function timelineDate(item: Pick<StockTimelineItem, "at" | "precision">, nowIso: string): string {
  // A recent day in words ("Today", "Yesterday", "Monday"), counted from the render's own time so server and browser
  // agree (owner rule 4); anything older keeps its date.
  const nowMs = Date.parse(nowIso);
  const today = etToday(Number.isFinite(nowMs) ? nowMs : Date.now());
  if (item.precision === "month") return timelineMonthWords(item.at, today);
  const gap = daysFromToday(item.at, today);
  if (gap !== null && gap <= 0 && gap >= -6) return capitalize(dayWords(item.at, today));
  const sameYear = item.at.slice(0, 4) === nowIso.slice(0, 4);
  if (item.precision === "day") return fmtDate(item.at, !sameYear);
  return new Date(item.at).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** An analyst row's two months by name ("Nov", "Oct"), so an older row never says "Now". */
function ratingMonths(at: string): [string, string] {
  const month = Number(at.slice(5, 7));
  if (!month) return ["That month", "Month before"];
  return [MONTH_NAMES[month - 1] ?? "That month", MONTH_NAMES[(month + 10) % 12] ?? "Month before"];
}

export function TimelineRow({ item, nowIso, dayed = false }: { item: StockTimelineItem; nowIso: string; dayed?: boolean }) {
  const tone = item.tone && item.tone !== "flat" ? item.tone : undefined;
  // A headline's publisher is in the section head; the other rows say what they are. The day is said once: by the
  // day heading over the rows when the list has them (`dayed`, owner rule 1), else on the row.
  const meta = [item.kind === "news" ? null : KIND_LABEL[item.kind], dayed ? null : timelineDate(item, nowIso)].filter(Boolean).join(" · ");
  // One line of at most 15 words under a row (owner rule 8), its main clause when the sentence runs longer. An analyst
  // row draws its two months as a bar pair instead of the counts in words (owner VISUALS CHECK).
  const detail = item.kind === "news" || item.buyShare ? "" : shortFact(wholeSentences(item.detail));
  // Our own page for the story when there is one (it links the source), else the source itself. The whole row opens
  // it, through one link stretched over the row that names the headline and its publisher for screen readers.
  const href = item.href ?? item.sourceUrl ?? null;
  const label = item.kind === "news" && item.source ? `${item.title} (${item.source})` : item.title;
  const cover = "absolute inset-0 z-[1] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-oa-border";
  return (
    <li
      className={`relative grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-oa-border px-3.5 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4 ${
        href ? "transition-colors hover:bg-oa-accent" : ""
      }`}
    >
      {href ? (
        item.href ? (
          <AppLink href={item.href} aria-label={label} className={cover} />
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cover} />
        )
      ) : null}
      <div className="min-w-0">
        <p className="text-pretty text-[14px] font-medium leading-5 text-oa-fg">
          {tone ? <ToneGlyph tone={tone} className="mr-1.5 -translate-y-px align-middle" /> : null}
          {item.title}
          {item.locked ? (
            <span className="ml-1.5 inline-flex -translate-y-px align-middle">
              <Tag tone="primary">Pro</Tag>
            </span>
          ) : null}
        </p>
        {detail ? <p className="mt-0.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">{detail}</p> : null}
        {item.buyShare ? (
          <VsBar
            value={item.buyShare.now}
            versus={item.buyShare.before}
            labels={ratingMonths(item.at)}
            format={(n) => `${Math.round(n)}% buy`}
            className="mt-1 w-full max-w-xs"
          />
        ) : null}
      </div>
      <p className={`${NUM} whitespace-nowrap text-[12px] leading-5 text-oa-muted-fg`} style={item.kind === "call" ? { color: "var(--oa-primary)" } : undefined}>
        {meta}
      </p>
    </li>
  );
}
