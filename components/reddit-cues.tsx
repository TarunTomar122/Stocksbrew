import Link from "next/link";
import type { RedditSnapshot, RedditTicker } from "@/lib/reddit-cues";

type Props = {
  data: RedditSnapshot;
};

const SENTIMENT_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  bullish:  { label: "Bullish",  color: "#047857", bg: "#ecfdf5", dot: "#10b981" },
  bearish:  { label: "Bearish",  color: "#b91c1c", bg: "#fef2f2", dot: "#ef4444" },
  neutral:  { label: "Neutral",  color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
};

function getSentimentMeta(s: string) {
  return SENTIMENT_META[s?.toLowerCase()] ?? SENTIMENT_META.neutral;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours === 1) return "1h ago";
  return `${hours}h ago`;
}

function TickerCard({ item }: { item: RedditTicker }) {
  const meta = getSentimentMeta(item.sentiment);

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6]">
            <span className="text-[13px] font-bold text-[#111111]">
              {item.ticker.slice(0, 2)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
              {item.ticker}
            </span>
            <span className="text-[11px] text-[#9ca3af]">
              {item.mention_count} mention{item.mention_count !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
          {meta.label}
        </span>
      </div>

      <p className="text-[12px] leading-snug text-[#374151] line-clamp-3">{item.summary}</p>
    </Link>
  );
}

export function RedditCues({ data }: Props) {
  if (!data.tickers || data.tickers.length === 0) return null;

  const bulls = data.tickers.filter((t) => t.sentiment?.toLowerCase() === "bullish").length;
  const bears = data.tickers.filter((t) => t.sentiment?.toLowerCase() === "bearish").length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold text-[#111111] tracking-[-0.015em]">
              Reddit Buzz
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff4500]" />
              r/stocks &amp; more
            </span>
          </div>
          <p className="text-[12px] text-[#9ca3af]">
            {data.post_count} posts scanned · {timeAgo(data.generated_at)}
          </p>
        </div>

        <div className="hidden sm:flex items-center divide-x divide-[#e5e7eb] rounded-xl border border-[#e5e7eb] bg-white overflow-hidden">
          <div className="px-4 py-2 text-center">
            <div className="text-[15px] font-semibold tabular-nums text-[#047857]">{bulls}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Bullish</div>
          </div>
          <div className="px-4 py-2 text-center">
            <div className="text-[15px] font-semibold tabular-nums text-[#b91c1c]">{bears}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">Bearish</div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {data.tickers.slice(0, 8).map((item) => (
          <div key={item.ticker} className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0">
            <TickerCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
