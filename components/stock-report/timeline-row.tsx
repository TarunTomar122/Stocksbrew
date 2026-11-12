import { AppLink } from "@/components/oa/app-link";
import { wholeSentences } from "@/lib/plain-copy";
import type { StockTimelineItem, StockTimelineKind } from "@/lib/stock-timeline";

import { fmtDate } from "./format";
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

export function timelineDate(item: Pick<StockTimelineItem, "at" | "precision">, nowIso: string): string {
  if (item.precision === "month") {
    const text = fmtDate(item.at, true);
    return text.replace(/ \d+,/, "");
  }
  const sameYear = item.at.slice(0, 4) === nowIso.slice(0, 4);
  if (item.precision === "day") return fmtDate(item.at, !sameYear);
  return new Date(item.at).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function TimelineRow({ item, nowIso }: { item: StockTimelineItem; nowIso: string }) {
  const tone = item.tone && item.tone !== "flat" ? item.tone : undefined;
  // A headline's publisher is in the section head; the other rows say what they are. Then the day, once.
  const meta = [item.kind === "news" ? null : KIND_LABEL[item.kind], timelineDate(item, nowIso)].filter(Boolean).join(" · ");
  const detail = item.kind === "news" ? "" : wholeSentences(item.detail);
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
      </div>
      <p className={`${NUM} whitespace-nowrap text-[12px] leading-5 text-oa-muted-fg`} style={item.kind === "call" ? { color: "var(--oa-primary)" } : undefined}>
        {meta}
      </p>
    </li>
  );
}
