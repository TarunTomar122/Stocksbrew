import Link from "next/link";
import type { RedditTickerContext, RedditTopPost } from "@/lib/reddit-cues";

type Props = {
  context: RedditTickerContext;
};

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours === 1) return "1h ago";
  return `${hours}h ago`;
}

function resolveRedditPostUrl(post: RedditTopPost): string | null {
  const u = post.url?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  const p = post.permalink?.trim();
  if (p) {
    if (/^https?:\/\//i.test(p)) return p;
    return `https://www.reddit.com${p.startsWith("/") ? "" : "/"}${p}`;
  }
  return null;
}

export function StockRedditBuzzRail({ context }: Props) {
  const { cue, generated_at, post_count, top_posts } = context;
  const hasThreads = top_posts.length > 0;

  return (
    <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
              Reddit Buzz
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#6b7280] shrink-0">
              <span className="h-1 w-1 rounded-full bg-[#ff4500]" />
              r/stocks &amp; more
            </span>
          </div>
          <p className="text-[11px] text-[#9ca3af]">
            {post_count} posts scanned · {timeAgo(generated_at)}
          </p>
        </div>
      </div>

      {hasThreads ? (
        <div className="flex flex-col gap-3 pt-3 border-t border-[#f3f4f6]">
          <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6b7280]">
            What people are posting
          </p>
          <div className="flex flex-col gap-4">
            {top_posts.map((post, i) => {
              const href = resolveRedditPostUrl(post);
              return (
                <article
                  key={`${post.title}-${i}`}
                  className="flex flex-col gap-2 border-t border-[#f3f4f6] first:border-t-0 first:pt-0 pt-4 first:mt-0 mt-0"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111111] leading-snug">
                      {post.title}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {post.subreddit ? (
                        <span className="text-[10px] font-semibold tracking-[0.04em] uppercase text-[#0052ff]">
                          r/{post.subreddit}
                        </span>
                      ) : null}
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-semibold text-[#0052ff] hover:underline"
                        >
                          Open thread →
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {post.summary ? (
                    <p className="text-[12px] leading-relaxed text-[#374151] whitespace-pre-wrap">
                      {post.summary}
                    </p>
                  ) : null}
                  {post.body ? (
                    <p className="text-[12px] leading-relaxed text-[#4b5563] whitespace-pre-wrap border-l-2 border-[#e5e7eb] pl-3">
                      {post.body}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : cue.summary ? (
        <p className="text-[12px] leading-relaxed text-[#374151] whitespace-pre-wrap border-t border-[#f3f4f6] pt-3">
          {cue.summary}
        </p>
      ) : null}

      {cue.summary && hasThreads ? (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#f3f4f6]">
          <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6b7280]">
            Roll-up across mentions
          </p>
          <p className="text-[12px] leading-relaxed text-[#374151] whitespace-pre-wrap">{cue.summary}</p>
        </div>
      ) : null}

      {cue.catalysts && cue.catalysts.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1 border-t border-[#f3f4f6]">
          <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#6b7280]">
            Key catalysts
          </p>
          <ul className="flex flex-col gap-1.5">
            {cue.catalysts.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#10b981]" />
                <span className="text-[12px] leading-snug text-[#374151]">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </div>
  );
}
