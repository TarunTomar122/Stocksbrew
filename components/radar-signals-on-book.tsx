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
  if (s === "bullish") return { text: "#047857", soft: "#ecfdf5" };
  if (s === "bearish") return { text: "#b91c1c", soft: "#fef2f2" };
  return { text: "#6b7280", soft: "#f3f4f6" };
}

function LensHeader({ icon, label, count, href }: { icon: string; label: string; count: number; href: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#374151]">
        <span aria-hidden>{icon}</span>
        {label}
        <span className="text-[#9ca3af]">{count}</span>
      </span>
      <Link href={href} className="text-[12px] font-semibold text-[#0052ff] hover:underline">
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
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1d4ed8]">
          Signals on your book
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {premarket.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
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
                      <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
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
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
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
                        <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
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
                        <p className="line-clamp-1 text-[12px] text-[#6b7280]">{a.headline}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {buzz.length > 0 && (
          <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
            <LensHeader icon="💬" label="Buzzing on Reddit" count={buzz.length} href="/anomalies" />
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
                        <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff]">
                          {b.ticker}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                          style={{ background: tone.soft, color: tone.text }}
                        >
                          {b.sentiment}
                        </span>
                        <span className="text-[11px] text-[#9ca3af]">{b.mentions} mentions</span>
                      </div>
                      {b.summary && (
                        <p className="line-clamp-1 text-[12px] text-[#6b7280]">{b.summary}</p>
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
