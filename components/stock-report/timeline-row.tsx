import { AppLink } from "@/components/oa/app-link";
import { wholeSentences } from "@/lib/plain-copy";
import type { StockTimelineItem, StockTimelineKind } from "@/lib/stock-timeline";

import { fmtDate, fmtStamp } from "./format";
import { NUM, Tag, ToneGlyph } from "./primitives";

/**
 * One row of "What changed". Server and client safe: the report renders the
 * latest rows on the server, and EarlierTimeline renders the older ones in
 * the browser only when the reader opens them.
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

function timelineDate(item: Pick<StockTimelineItem, "at" | "precision">, nowIso: string): string {
  if (item.precision === "month") {
    const text = fmtDate(item.at, true);
    return text.replace(/ \d+,/, "");
  }
  const sameYear = item.at.slice(0, 4) === nowIso.slice(0, 4);
  if (item.precision === "day") return fmtDate(item.at, !sameYear);
  const day = new Date(item.at).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return day;
}

export function TimelineRow({ item, nowIso }: { item: StockTimelineItem; nowIso: string }) {
  const tone = item.tone && item.tone !== "flat" ? item.tone : undefined;
  // Only a headline keeps its publisher; the other rows speak for themselves.
  const meta = [item.kind === "news" ? item.source : "", item.precision === "time" ? fmtStamp(item.at) : ""].filter(Boolean);
  return (
    <li className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-oa-border px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[5rem_minmax(0,1fr)] sm:px-4">
      <div className="pt-0.5">
        <p className={`${NUM} text-[12px] leading-4 text-oa-fg`}>{timelineDate(item, nowIso)}</p>
        <p className="oa-mono mt-0.5 text-[10px] uppercase leading-4 tracking-[0.08em]" style={{ color: item.kind === "call" ? "var(--oa-primary)" : "var(--oa-muted-fg)" }}>
          {KIND_LABEL[item.kind]}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-5 text-oa-fg">
          {tone ? (
            <ToneGlyph tone={tone} className="mr-1.5 -translate-y-px align-middle" />
          ) : null}
          {item.href && !item.sourceUrl ? (
            <AppLink href={item.href} className="hover:underline">
              {item.title}
            </AppLink>
          ) : item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {item.locked ? (
            <span className="ml-1.5 inline-flex -translate-y-px align-middle">
              <Tag tone="primary">Pro</Tag>
            </span>
          ) : null}
        </p>
        {/* Complete sentences only: a feed excerpt cut off with "..." loses its broken last clause. */}
        {wholeSentences(item.detail) ? <p className="mt-0.5 text-pretty text-[13px] leading-5 text-oa-muted-fg">{wholeSentences(item.detail)}</p> : null}
        {meta.length || (item.href && item.sourceUrl) ? (
          <p className="oa-mono mt-0.5 text-[11px] leading-4 text-oa-muted-fg">
            {meta.join(" · ")}
            {item.href && item.sourceUrl ? (
              <>
                {meta.length ? " · " : ""}
                <AppLink href={item.href} className="text-oa-primary hover:underline">
                  open
                </AppLink>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}
