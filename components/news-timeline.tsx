import type { TimelineEvent } from "@/lib/stock";

type Props = {
  timeline: TimelineEvent[] | null | undefined;
};

function sentimentColor(label?: string): string {
  const l = (label ?? "").toLowerCase();
  if (l.includes("bull") || l.includes("pos")) return "var(--signal-bullish)";
  if (l.includes("bear") || l.includes("neg")) return "var(--signal-bearish)";
  return "var(--signal-neutral)";
}

function sentimentDot(label?: string) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
      style={{ backgroundColor: sentimentColor(label) }}
    />
  );
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
  if (!timeline || timeline.length === 0) {
    return (
      <section className="bg-surface-container-lowest brutalist-border p-6">
        <h2 className="text-[14px] font-semibold text-on-surface mb-3">
          News Timeline
        </h2>
        <div className="text-[13px] text-on-surface-variant py-6 text-center">
          No recent news tracked.
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <h2 className="text-[14px] font-semibold text-on-surface mb-5">
        News Timeline
      </h2>
      <div className="flex flex-col gap-5">
        {timeline.map((event, i) => {
          const hasLink = !!event.article_url;
          const Wrapper = hasLink ? "a" : "div";
          const wrapperProps = hasLink
            ? {
                href: event.article_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className:
                  "group flex gap-3 hover:bg-surface-container-low p-2 -mx-2 transition-colors",
              }
            : { className: "flex gap-3 p-2 -mx-2" };

          return (
            <Wrapper key={event.event_id ?? i} {...(wrapperProps as Record<string, string>)}>
              {sentimentDot(event.sentiment_label)}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[14px] font-semibold text-on-surface leading-snug ${hasLink ? "group-hover:text-primary transition-colors" : ""}`}
                >
                  {event.title ?? "Untitled"}
                </div>
                {event.summary && (
                  <div className="mt-1 text-[13px] text-on-surface-variant leading-relaxed line-clamp-2">
                    {event.summary}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3 text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
                  {event.source_name && <span>{event.source_name}</span>}
                  {event.timestamp && (
                    <span>{formatTimestamp(event.timestamp)}</span>
                  )}
                  {typeof event.impact_score === "number" && (
                    <span
                      style={{ color: sentimentColor(event.sentiment_label) }}
                    >
                      Impact {event.impact_score.toFixed(1)}
                    </span>
                  )}
                  {event.is_new_since_last_run && (
                    <span className="text-primary">New</span>
                  )}
                </div>
              </div>
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}
