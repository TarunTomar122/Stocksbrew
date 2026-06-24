import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";

export type BookAnomaly = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  dayChangePct: number | null;
  headline: string | null;
  market: "US" | "IN";
};

export type BookBuzz = {
  ticker: string;
  sentiment: string;
  summary: string;
  mentions: number;
  market: "US" | "IN";
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
  if (s === "bullish") return { text: "#10b981", soft: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))" };
  if (s === "bearish") return { text: "#ef4444", soft: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))" };
  return { text: "var(--on-surface-variant)", soft: "var(--surface-container)" };
}

function LensHeader({ icon, label, count, href }: { icon: string; label: string; count: number; href: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-on-surface">
        <span aria-hidden>{icon}</span>
        {label}
        <span className="text-on-surface-variant">{count}</span>
      </span>
      <Link href={href} className="text-[12px] font-semibold text-[#22d3ee] hover:underline">
        See all →
      </Link>
    </div>
  );
}

export function RadarSignalsOnBook({
  anomalies,
  buzz,
  premarket = [],
}: {
  anomalies: BookAnomaly[];
  buzz: BookBuzz[];
  premarket?: BookPremarket[];
}) {
  if (anomalies.length === 0 && buzz.length === 0 && premarket.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eef2ff] text-[14px]">
          📡
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3b82f6]">
          Signals on your book
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {premarket.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4">
            <LensHeader icon="🌅" label="Before the open" count={premarket.length} href="/premarket" />
            <div className="flex flex-col divide-y divide-[#f3f4f6]">
              {premarket.slice(0, 4).map((p) => {
                const up = p.gapPct >= 0;
                return (
                  <Link
                    key={p.ticker}
                    href={`/stock/${encodeURIComponent(p.ticker)}`}
                    className="group flex items-center justify-between gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StockLogo ticker={p.ticker} market={p.market} size={26} logoUrl={p.logoUrl} />
                      <span className="text-[13px] font-semibold text-on-surface group-hover:text-[#22d3ee]">
                        {p.ticker}
                      </span>
                    </div>
                    <span
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: up ? "#10b981" : "#ef4444" }}
                    >
                      {up ? "▲" : "▼"} {Math.abs(p.gapPct).toFixed(1)}%
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {anomalies.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4">
            <LensHeader icon="📈" label="Moving today" count={anomalies.length} href="/anomalies" />
            <div className="flex flex-col divide-y divide-[#f3f4f6]">
              {anomalies.slice(0, 4).map((a) => {
                const up = (a.dayChangePct ?? 0) >= 0;
                return (
                  <Link
                    key={a.ticker}
                    href={`/stock/${encodeURIComponent(a.ticker)}`}
                    className="group flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <StockLogo ticker={a.ticker} market={a.market} size={26} logoUrl={a.logoUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-on-surface group-hover:text-[#22d3ee]">
                          {a.ticker}
                        </span>
                        {a.dayChangePct != null && (
                          <span
                            className="text-[12px] font-semibold tabular-nums"
                            style={{ color: up ? "#10b981" : "#ef4444" }}
                          >
                            {up ? "▲" : "▼"} {Math.abs(a.dayChangePct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {a.headline && (
                        <p className="line-clamp-1 text-[12px] text-on-surface-variant">{a.headline}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {buzz.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4">
            <LensHeader icon="💬" label="Buzzing on Reddit" count={buzz.length} href="/reddit-buzz" />
            <div className="flex flex-col divide-y divide-[#f3f4f6]">
              {buzz.slice(0, 4).map((b) => {
                const tone = sentimentTone(b.sentiment);
                return (
                  <Link
                    key={b.ticker}
                    href={`/stock/${encodeURIComponent(b.ticker)}`}
                    className="group flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-on-surface group-hover:text-[#22d3ee]">
                          {b.ticker}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                          style={{ background: tone.soft, color: tone.text }}
                        >
                          {b.sentiment}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">{b.mentions} mentions</span>
                      </div>
                      {b.summary && (
                        <p className="line-clamp-1 text-[12px] text-on-surface-variant">{b.summary}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
