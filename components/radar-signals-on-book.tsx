import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { RadarSignalsTrackAction } from "@/components/radar-signals-track-action";

export type BookAnomaly = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  dayChangePct: number | null;
  headline: string | null;
  market: "US" | "IN";
  /** False when surfaced from broader market anomalies, not the user's book. */
  onBook?: boolean;
};

export type BookBuzz = {
  ticker: string;
  sentiment: string;
  summary: string;
  mentions: number;
  market: "US" | "IN";
  /** False when surfaced from broader Reddit buzz, not the user's book. */
  onBook?: boolean;
};

export type BookPremarket = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  gapPct: number;
  market: "US" | "IN";
};

function sentimentTone(sentiment: string): { text: string; soft: string } {
  const s = sentiment.toLowerCase();
  if (s === "bullish") return { text: "var(--signal-bullish)", soft: "color-mix(in srgb, var(--signal-bullish) 12%, var(--surface))" };
  if (s === "bearish") return { text: "var(--signal-bearish)", soft: "color-mix(in srgb, var(--signal-bearish) 12%, var(--surface))" };
  return { text: "var(--on-surface-variant)", soft: "var(--surface-container)" };
}

function pctClass(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "text-on-surface-variant";
  if (v > 0.05) return "text-[var(--signal-bullish)]";
  if (v < -0.05) return "text-[var(--signal-bearish)]";
  return "text-on-surface-variant";
}

function LensHeader({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
        {label}
        <span className="ml-1.5 text-on-surface">{count}</span>
      </span>
      <Link href={href} className="font-mono text-[11px] font-semibold text-on-surface-variant hover:text-on-surface">
        See all →
      </Link>
    </div>
  );
}

const REDDIT_BUZZ_CARD_TARGET = 4;
export const MOVING_TODAY_CARD_TARGET = 6;

type AnomalyFeedItem = {
  ticker: string;
  name?: string;
  logo_url?: string | null;
  day_change_pct?: number;
  headline?: string | null;
  today_brief?: string | null;
};

function mapBookAnomaly(
  a: AnomalyFeedItem,
  market: "US" | "IN",
  onBook: boolean,
): BookAnomaly {
  return {
    ticker: a.ticker,
    name: a.name || a.ticker,
    logoUrl: a.logo_url ?? null,
    dayChangePct: typeof a.day_change_pct === "number" ? a.day_change_pct : null,
    headline: a.headline ?? a.today_brief ?? null,
    market,
    onBook,
  };
}

export function buildBookAnomalyList(
  allAnomalies: AnomalyFeedItem[],
  trackedTickers: Set<string>,
  market: "US" | "IN",
): BookAnomaly[] {
  const onBook = allAnomalies
    .filter((a) => trackedTickers.has(String(a.ticker || "").trim().toUpperCase()))
    .map((a) => mapBookAnomaly(a, market, true))
    .sort((a, b) => Math.abs(b.dayChangePct ?? 0) - Math.abs(a.dayChangePct ?? 0));

  const used = new Set(onBook.map((a) => a.ticker.toUpperCase()));
  const backfill = allAnomalies
    .filter((a) => {
      const ticker = String(a.ticker || "").trim().toUpperCase();
      return ticker && !used.has(ticker);
    })
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0))
    .slice(0, Math.max(0, MOVING_TODAY_CARD_TARGET - onBook.length))
    .map((a) => mapBookAnomaly(a, market, false));

  return [...onBook, ...backfill].slice(0, MOVING_TODAY_CARD_TARGET);
}

export function buildBookBuzzList(
  redditTickers: Array<{
    ticker: string;
    sentiment: string;
    summary: string;
    mention_count: number;
  }>,
  trackedTickers: Set<string>,
  market: "US" | "IN",
): BookBuzz[] {
  const onBook = redditTickers
    .filter((t) => trackedTickers.has(String(t.ticker || "").trim().toUpperCase()))
    .map((t) => ({
      ticker: t.ticker,
      sentiment: t.sentiment,
      summary: t.summary,
      mentions: t.mention_count,
      market,
      onBook: true,
    }))
    .sort((a, b) => b.mentions - a.mentions);

  const used = new Set(onBook.map((b) => b.ticker.toUpperCase()));
  const backfill = redditTickers
    .filter((t) => {
      const ticker = String(t.ticker || "").trim().toUpperCase();
      return ticker && !used.has(ticker);
    })
    .sort((a, b) => b.mention_count - a.mention_count)
    .slice(0, Math.max(0, REDDIT_BUZZ_CARD_TARGET - onBook.length))
    .map((t) => ({
      ticker: t.ticker,
      sentiment: t.sentiment,
      summary: t.summary,
      mentions: t.mention_count,
      market,
      onBook: false,
    }));

  return [...onBook, ...backfill];
}

export function RadarSignalsOnBook({
  anomalies,
  buzz,
  premarket = [],
  trackedIds = [],
  isSubscribed = false,
}: {
  anomalies: BookAnomaly[];
  buzz: BookBuzz[];
  premarket?: BookPremarket[];
  trackedIds?: string[];
  isSubscribed?: boolean;
}) {
  if (anomalies.length === 0 && buzz.length === 0 && premarket.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
        Signals on your book
      </span>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {premarket.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4">
            <LensHeader label="Before the open" count={premarket.length} href="/premarket" />
            <div className="flex flex-col divide-y divide-outline-variant/40">
              {premarket.slice(0, 4).map((p) => (
                <div
                  key={p.ticker}
                  className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/stock/${encodeURIComponent(p.ticker)}`}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StockLogo ticker={p.ticker} market={p.market} size={26} logoUrl={p.logoUrl} />
                      <span className="font-mono text-[13px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                        {p.ticker}
                      </span>
                    </div>
                    <span className={`font-mono text-[12px] font-semibold tabular-nums ${pctClass(p.gapPct)}`}>
                      {p.gapPct >= 0 ? "+" : ""}
                      {p.gapPct.toFixed(1)}%
                    </span>
                  </Link>
                  <RadarSignalsTrackAction
                    ticker={p.ticker}
                    market={p.market}
                    trackedIds={trackedIds}
                    isSubscribed={isSubscribed}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {anomalies.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4">
            <LensHeader label="Moving today" count={anomalies.length} href="/pulse" />
            {anomalies.some((a) => a.onBook) && anomalies.some((a) => a.onBook === false) ? (
              <p className="font-mono text-[10px] text-on-surface-variant">
                {anomalies.filter((a) => a.onBook).length} on your book ·{" "}
                {anomalies.filter((a) => a.onBook === false).length} trending
              </p>
            ) : anomalies.every((a) => a.onBook === false) ? (
              <p className="font-mono text-[10px] text-on-surface-variant">Trending now · not all on your book</p>
            ) : null}
            <div className="flex flex-col divide-y divide-outline-variant/40">
              {anomalies.slice(0, MOVING_TODAY_CARD_TARGET).map((a) => (
                <div key={a.ticker} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`/stock/${encodeURIComponent(a.ticker)}`}
                    className="group flex min-w-0 flex-1 items-start gap-2.5"
                  >
                    <StockLogo ticker={a.ticker} market={a.market} size={26} logoUrl={a.logoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                          {a.ticker}
                        </span>
                        {a.dayChangePct != null && (
                          <span className={`font-mono text-[12px] font-semibold tabular-nums ${pctClass(a.dayChangePct)}`}>
                            {a.dayChangePct >= 0 ? "+" : ""}
                            {a.dayChangePct.toFixed(1)}%
                          </span>
                        )}
                        {a.onBook === false ? (
                          <span className="rounded-md border border-outline-variant/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em] text-on-surface-variant">
                            Trending
                          </span>
                        ) : null}
                      </div>
                      {a.headline ? (
                        <p className="text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                          {a.headline}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                  <RadarSignalsTrackAction
                    ticker={a.ticker}
                    market={a.market}
                    trackedIds={trackedIds}
                    isSubscribed={isSubscribed}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {buzz.length > 0 && (
          <div className="flex min-h-[220px] flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4">
            <LensHeader label="Buzzing on Reddit" count={buzz.length} href="/pulse" />
            {buzz.some((b) => b.onBook) && buzz.some((b) => !b.onBook) ? (
              <p className="font-mono text-[10px] text-on-surface-variant">
                {buzz.filter((b) => b.onBook).length} on your book ·{" "}
                {buzz.filter((b) => !b.onBook).length} trending
              </p>
            ) : buzz.every((b) => !b.onBook) ? (
              <p className="font-mono text-[10px] text-on-surface-variant">Trending now · not all on your book</p>
            ) : null}
            <div className="flex flex-1 flex-col divide-y divide-outline-variant/40">
              {buzz.slice(0, REDDIT_BUZZ_CARD_TARGET).map((b) => {
                const tone = sentimentTone(b.sentiment);
                return (
                  <div key={b.ticker} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/stock/${encodeURIComponent(b.ticker)}`}
                      className="group flex min-w-0 flex-1 items-start gap-2.5"
                    >
                      <StockLogo ticker={b.ticker} market={b.market} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[13px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                            {b.ticker}
                          </span>
                          <span
                            className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em]"
                            style={{ background: tone.soft, color: tone.text }}
                          >
                            {b.sentiment}
                          </span>
                          <span className="font-mono text-[11px] text-on-surface-variant">{b.mentions} mentions</span>
                          {b.onBook === false ? (
                            <span className="rounded-md border border-outline-variant/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em] text-on-surface-variant">
                              Trending
                            </span>
                          ) : null}
                        </div>
                        {b.summary ? (
                          <p className="text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                            {b.summary}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                    <RadarSignalsTrackAction
                      ticker={b.ticker}
                      market={b.market}
                      trackedIds={trackedIds}
                      isSubscribed={isSubscribed}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
