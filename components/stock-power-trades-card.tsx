import Link from "next/link";
import type { PowerTrade } from "@/lib/power-trades";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function fmtMoney(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtAmount(low: number | null, high: number | null) {
  if (low != null && high != null) return low === high ? fmtMoney(low) : `${fmtMoney(low)} – ${fmtMoney(high)}`;
  if (low != null) return `${fmtMoney(low)}+`;
  if (high != null) return `≤ ${fmtMoney(high)}`;
  return "range n/a";
}

function typeMeta(txType: string) {
  switch (txType) {
    case "buy":
      return { label: "Buy", color: "var(--signal-bullish)" };
    case "sell":
      return { label: "Sell", color: "var(--signal-bearish)" };
    default:
      return { label: "Exchange", color: "var(--oa-muted-fg)" };
  }
}

function CapitolMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v3" />
      <path d="M8 21h8" />
      <path d="M6 18c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M9.5 10.5C10 8 11 7 12 5c1 2 2 3 2.5 5.5" />
      <path d="M4 18c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v1H4z" />
    </svg>
  );
}

export function StockPowerTradesCard({ ticker, trades }: { ticker: string; trades: PowerTrade[] }) {
  const visible = trades.slice(0, 4);
  const extra = trades.length - visible.length;

  return (
    <section className="mt-6 min-w-0 rounded-[20px] border border-oa-border bg-oa-card p-4 sm:mt-8 sm:rounded-[26px] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[#7c3aed]" aria-hidden>
          <CapitolMark size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-medium text-oa-fg">Power trades</p>
            <span className="shrink-0 rounded-full border border-oa-border bg-oa-bg px-2.5 py-0.5 text-[12px] font-medium text-oa-muted-fg">
              {trades.length} {trades.length === 1 ? "trade" : "trades"}
            </span>
          </div>
          <p className="mt-0.5 text-[14px] leading-snug text-oa-muted-fg">
            STOCK Act disclosures for {ticker} · last 7 days
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-oa-border pt-4">
        {visible.map((t) => {
          const meta = typeMeta(t.tx_type);
          return (
            <div key={t.trade_id} className="flex items-center gap-3 rounded-xl bg-oa-bg px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight text-oa-fg">{t.person_name}</p>
                <p className="mt-0.5 truncate text-[11px] text-oa-muted-fg">
                  {[t.party, t.state].filter(Boolean).join("-") || t.chamber}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color }}
                >
                  {meta.label}
                </span>
                <p className="oa-mono mt-1 text-[11px] tabular-nums text-oa-muted-fg">{fmtAmount(t.amount_low, t.amount_high)}</p>
              </div>
              <p className="w-11 shrink-0 text-right text-[11px] tabular-nums text-oa-muted-fg">{fmtDate(t.transaction_date)}</p>
            </div>
          );
        })}
        {extra > 0 && (
          <p className="pt-1 text-[12px] text-oa-muted-fg">+{extra} more in the last week</p>
        )}
      </div>

      <Link
        href="/power-trades"
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-oa-fg hover:text-[#0052ff]"
      >
        See all politician trades
        <span aria-hidden>&rarr;</span>
      </Link>
    </section>
  );
}
