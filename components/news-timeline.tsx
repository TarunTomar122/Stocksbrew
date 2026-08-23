import type { TimelineEvent } from "@/lib/stock";

type Props = {
  timeline: TimelineEvent[] | null | undefined;
};

function sentimentMeta(label?: string): { dot: string; tone: string } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("bull") || l.includes("pos")) return { dot: "var(--signal-bullish)", tone: "text-[var(--signal-bullish)]" };
  if (l.includes("bear") || l.includes("neg")) return { dot: "var(--signal-bearish)", tone: "text-[var(--signal-bearish)]" };
  return { dot: "var(--signal-neutral)", tone: "text-[var(--signal-neutral)]" };
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NewsTimeline({ timeline }: Props) {
  return (
    <section className="flex flex-col gap-4 pt-6 border-t border-oa-border">
      <h3 className="text-[18px] font-medium text-oa-fg tracking-[-0.01em]">
        News timeline
      </h3>

      {!timeline || timeline.length === 0 ? (
        <p className="text-[13px] text-oa-muted-fg">No recent news tracked.</p>
      ) : (
        <div className="flex flex-col">
          {timeline.map((event, i) => {
            const meta = sentimentMeta(event.sentiment_label);
            const hasLink = !!event.article_url;
            const Wrapper: "a" | "div" = hasLink ? "a" : "div";
            const linkProps = hasLink
              ? {
                  href: event.article_url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                }
              : {};
            return (
              <Wrapper
                key={event.event_id ?? i}
                {...(linkProps as Record<string, string>)}
                className="flex gap-3 py-3 border-t border-oa-border first:border-t-0 hover:bg-oa-accent -mx-2 px-2 rounded-lg transition-colors"
              >
                <span
                  className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                  style={{ background: meta.dot }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-oa-fg leading-snug">
                    {event.title ?? "Untitled"}
                  </p>
                  {event.summary && (
                    <p className="mt-1 text-[13px] text-oa-fg leading-relaxed line-clamp-2">
                      {event.summary}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                    {event.source_name && (
                      <span className="font-medium tracking-[0.06em] uppercase text-oa-primary">
                        {event.source_name}
                      </span>
                    )}
                    {event.timestamp && (
                      <>
                        <span className="text-oa-muted-fg/50">·</span>
                        <span className="text-oa-muted-fg">{formatTimestamp(event.timestamp)}</span>
                      </>
                    )}
                    {typeof event.impact_score === "number" && (
                      <>
                        <span className="text-oa-muted-fg/50">·</span>
                        <span className={`font-medium ${meta.tone}`}>
                          Impact {event.impact_score.toFixed(1)}
                        </span>
                      </>
                    )}
                    {event.is_new_since_last_run && (
                      <>
                        <span className="text-oa-muted-fg/50">·</span>
                        <span className="inline-flex items-center rounded-md bg-oa-primary text-white px-1.5 py-0.5 text-[9px] font-medium tracking-[0.08em] uppercase">
                          New
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Wrapper>
            );
          })}
        </div>
      )}
    </section>
  );
}
