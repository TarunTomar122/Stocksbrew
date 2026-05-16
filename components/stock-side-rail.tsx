import { StockLogo } from "@/components/stock-logo";
import { StockRedditBuzzRail } from "@/components/stock-reddit-buzz-rail";
import { TrackButton } from "@/components/track-button";
import type { RedditTickerContext } from "@/lib/reddit-cues";
import type { StockIntelPro } from "@/lib/types";
import type { StockSummary, TimelineEvent } from "@/lib/stock";

type Props = {
  stock: StockSummary;
  intelPro: StockIntelPro | null;
  currencySymbol: string;
  timeline?: TimelineEvent[] | null;
  tier: "ai_launch" | "ai_personal" | "free";
  isSubscribed: boolean;
  isTracked: boolean;
  priceUpdatedAt?: string;
  market: "US" | "IN";
  redditTickerContext?: RedditTickerContext | null;
};

function sentimentDot(label?: string): string {
  const l = (label ?? "").toLowerCase();
  if (l.includes("bull") || l.includes("pos")) return "#10b981";
  if (l.includes("bear") || l.includes("neg")) return "#ef4444";
  return "#f59e0b";
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function absoluteTime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

const PILLARS: { key: "valuation" | "growth" | "quality" | "momentum"; label: string }[] = [
  { key: "valuation", label: "Valuation" },
  { key: "growth", label: "Growth" },
  { key: "quality", label: "Quality" },
  { key: "momentum", label: "Momentum" },
];

function fmtPrice(v: number, currency: string): string {
  if (!Number.isFinite(v)) return "-";
  return `${currency}${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtAbs(v: number, currency: string): string {
  return `${v >= 0 ? "+" : ""}${currency}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function verdictTone(v?: string): { bg: string; fg: string; label: string } {
  switch ((v ?? "").toLowerCase()) {
    case "strong":
      return { bg: "#ecfdf5", fg: "#10b981", label: "Strong" };
    case "solid":
      return { bg: "#eff6ff", fg: "#0052ff", label: "Solid" };
    case "mixed":
      return { bg: "#fef3c7", fg: "#b45309", label: "Mixed" };
    case "weak":
      return { bg: "#fef2f2", fg: "#ef4444", label: "Weak" };
    default:
      return { bg: "#f3f4f6", fg: "#6b7280", label: "-" };
  }
}

function scoreTone(v?: number | null): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-[#9ca3af]";
  if (v >= 80) return "text-[#10b981]";
  if (v >= 60) return "text-[#111111]";
  if (v >= 40) return "text-[#6b7280]";
  return "text-[#9ca3af]";
}

function isSystemTimelineEvent(event: TimelineEvent): boolean {
  const source = String(event.source_name ?? "").trim().toLowerCase();
  const title = String(event.title ?? "").trim().toLowerCase();
  if (source.includes("scheduled market snapshot")) return true;
  if (title.includes("price snapshot captured")) return true;
  return false;
}

export function StockSideRail({
  stock,
  intelPro,
  currencySymbol,
  timeline,
  tier,
  isSubscribed,
  isTracked,
  priceUpdatedAt,
  market,
  redditTickerContext,
}: Props) {
  const pct = stock.day_change_pct ?? 0;
  const abs = stock.day_change_abs ?? 0;
  const positive = pct >= 0;
  const arrow = positive ? "▲" : "▼";
  const changeBg = positive ? "bg-[#ecfdf5]" : "bg-[#fef2f2]";
  const changeFg = positive ? "text-[#10b981]" : "text-[#ef4444]";
  const visibleTimeline = (timeline ?? []).filter((event) => !isSystemTimelineEvent(event));

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 lg:-mr-2 flex flex-col gap-4 w-full lg:max-w-[340px] scrollbar-hide">
      {/* Identity card */}
      <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <StockLogo
            ticker={stock.ticker}
            logoUrl={stock.logo_url}
            market={market}
            size={48}
          />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug line-clamp-2">
              {stock.name}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-[#6b7280] mt-0.5">
              <span>{stock.ticker}</span>
              {stock.exchange && (
                <>
                  <span className="text-[#d1d5db]">·</span>
                  <span>{stock.exchange}</span>
                </>
              )}
            </div>
          </div>
          <TrackButton
            ticker={stock.ticker}
            instrumentId={stock.instrument_id}
            tier={tier}
            isSubscribed={isSubscribed}
            isTracked={isTracked}
            variant="icon"
          />
        </div>

        {/* Price */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] font-semibold text-[#111111] tabular-nums tracking-[-0.02em] leading-none">
              {fmtPrice(stock.price, currencySymbol)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ${changeBg} ${changeFg}`}
            >
              {arrow} {fmtPct(pct)}
            </span>
          </div>
          {Number.isFinite(abs) && abs !== 0 && (
            <span className={`text-[12px] font-medium tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
              {fmtAbs(abs, currencySymbol)} today
            </span>
          )}
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#9ca3af]" title={absoluteTime(priceUpdatedAt) || "Not available"}>
            Updated {relativeTime(priceUpdatedAt) || "-"}
          </span>
        </div>

        <TrackButton
          ticker={stock.ticker}
          instrumentId={stock.instrument_id}
          tier={tier}
          isSubscribed={isSubscribed}
          isTracked={isTracked}
        />
      </div>

      {/* Scorecard mini - hidden on mobile (available in Fundamentals tab) */}
      {intelPro && (
        <div className="hidden lg:flex rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
              Scorecard
            </h3>
            {typeof intelPro.overall?.score === "number" && (
              <span className="inline-flex items-baseline gap-1 tabular-nums">
                <span
                  className={`text-[20px] font-semibold leading-none ${scoreTone(intelPro.overall.score)}`}
                >
                  {Math.round(intelPro.overall.score)}
                </span>
                <span className="text-[11px] text-[#6b7280]">/ 100</span>
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {PILLARS.map((p) => {
              const pillar = intelPro.pillars?.[p.key];
              const score = pillar?.score;
              const tone = verdictTone(pillar?.verdict);
              return (
                <div
                  key={p.key}
                  className="grid grid-cols-[1fr_2.5rem_4.5rem] items-center gap-3"
                >
                  <span className="text-[13px] font-medium text-[#111111] truncate">
                    {p.label}
                  </span>
                  <span
                    className={`text-[13px] font-semibold tabular-nums text-right ${scoreTone(score)}`}
                  >
                    {typeof score === "number" ? Math.round(score) : "-"}
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {tone.label}
                  </span>
                </div>
              );
            })}
          </div>
          {intelPro.overall?.verdict && (
            <p className="text-[12px] text-[#6b7280] leading-snug pt-1 border-t border-[#f3f4f6]">
              {intelPro.overall.verdict}
            </p>
          )}
        </div>
      )}

      {/* Reddit buzz - hidden on mobile */}
      {redditTickerContext && (
        <div className="hidden lg:block">
          <StockRedditBuzzRail context={redditTickerContext} />
        </div>
      )}

      {/* Latest news - hidden on mobile */}
      {timeline && (
        <div className="hidden lg:flex rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex-col gap-3">
          <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
            Latest news
          </h3>
          {visibleTimeline.length === 0 ? (
            <p className="text-[12px] text-[#6b7280]">No recent news yet.</p>
          ) : (
            <div className="flex flex-col">
              {visibleTimeline.slice(0, 5).map((event, i) => {
              const dot = sentimentDot(event.sentiment_label);
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
                  className="flex gap-2.5 py-3 border-t border-[#f3f4f6] first:border-t-0 -mx-1 px-1 rounded-lg hover:bg-[#f8f9fa] transition-colors"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: dot }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[#111111] leading-snug line-clamp-2">
                      {event.title ?? "Untitled"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                      {event.source_name && (
                        <span className="font-semibold tracking-[0.04em] uppercase text-[#0052ff] truncate">
                          {event.source_name}
                        </span>
                      )}
                      {event.timestamp && (
                        <>
                          <span className="text-[#d1d5db]">·</span>
                          <span className="text-[#6b7280]">
                            {relativeTime(event.timestamp)}
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
        </div>
      )}
    </aside>
  );
}
