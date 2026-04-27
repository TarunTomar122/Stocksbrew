"use client";

import { useRouter } from "next/navigation";

import type { HeatList, HeatRow } from "@/lib/heat";

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function fmtPct(v: number | null | undefined): { text: string; positive: boolean } | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, positive: v >= 0 };
}

function isUsefulTag(tag: string): boolean {
  const stale = ["strong momentum", "momentum building", "catalyst flagged",
    "big move today", "notable move today", "strong growth",
    "bullish coverage", "bearish coverage"];
  return !stale.includes(tag.toLowerCase());
}

function TagList({ tags }: { tags: string[] }) {
  const useful = tags.filter(isUsefulTag).slice(0, 3);
  if (useful.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {useful.map((tag) => {
        const t = tag.toLowerCase();
        const isEvent = t.startsWith("⚡");
        const isNews = t.startsWith("📰") || t.includes("mention");
        const isUp = t.includes("↑") || (t.startsWith("+") && !isEvent);
        const isDown = t.includes("↓") || t.includes("oversold");
        const cls = isEvent ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
          : isNews ? "bg-primary/10 text-primary border-primary/30"
          : isUp ? "bg-signal-bullish/10 text-signal-bullish border-signal-bullish/30"
          : isDown ? "bg-signal-bearish/10 text-signal-bearish border-signal-bearish/30"
          : "bg-surface-container text-on-surface-variant border-outline-variant/40";
        return (
          <span key={tag} className={`px-2.5 py-1 text-[10px] font-bold border whitespace-nowrap rounded-full ${cls}`}>
            {tag}
          </span>
        );
      })}
    </div>
  );
}

function ScoreMini({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return <span className="text-sm font-bold tabular-nums text-outline">—</span>;
  }
  const rounded = Math.round(value);
  const tone = rounded >= 70
    ? "text-signal-bullish bg-signal-bullish/10"
    : rounded >= 50
      ? "text-primary bg-primary/10"
      : "text-signal-bearish bg-signal-bearish/10";
  return (
    <span className={`inline-flex min-w-10 justify-center rounded-full px-2.5 py-1 text-sm font-black tabular-nums ${tone}`}>
      {rounded}
    </span>
  );
}

function HeatScore({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center justify-end gap-3">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-signal-bullish"
          style={{ width: `${Math.max(6, Math.min(100, rounded))}%` }}
        />
      </div>
      <span className="min-w-9 text-right text-base font-black tabular-nums text-on-surface">
        {rounded}
      </span>
    </div>
  );
}

function rsiStateLabel(raw?: string | null): { short: string; long: string } | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || key === "insufficient_data") return null;
  if (key === "overbought") return { short: "OB", long: "Overbought" };
  if (key === "oversold") return { short: "OS", long: "Oversold" };
  if (key === "neutral") return { short: "NTR", long: "Neutral" };
  return { short: key.slice(0, 3).toUpperCase(), long: raw ?? key };
}

function RsiPill({ value, state }: { value: number | null | undefined; state?: string | null }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return (
      <span className="inline-flex flex-col items-center gap-0.5 rounded-xl bg-surface-container px-3 py-2 text-center">
        <span className="text-sm font-black tabular-nums text-outline">—</span>
        <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">
          No RSI yet
        </span>
      </span>
    );
  }

  const display = value.toFixed(1);
  const rawState = String(state ?? "").trim().toLowerCase();
  const effectiveState =
    rawState && rawState !== "insufficient_data"
      ? rawState
      : value >= 70
        ? "overbought"
        : value <= 30
          ? "oversold"
          : "neutral";
  const inferred = rsiStateLabel(effectiveState);

  const toneKey = effectiveState;
  const tone = toneKey === "overbought"
    ? "text-signal-bullish bg-signal-bullish/10 border-signal-bullish/25"
    : toneKey === "oversold"
      ? "text-signal-bearish bg-signal-bearish/10 border-signal-bearish/25"
      : "text-on-surface bg-surface-container border-outline-variant/30";

  return (
    <span className={`inline-flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 ${tone}`}>
      <span className="text-base font-black tabular-nums leading-none">{display}</span>
      {inferred && (
        <span className="text-[9px] font-black tracking-[0.12em] uppercase opacity-80">
          {inferred.short} · {inferred.long}
        </span>
      )}
    </span>
  );
}

function TableRow({ row }: { row: HeatRow }) {
  const router = useRouter();
  const href = `/stock/${encodeURIComponent(row.ticker)}`;
  const pct = fmtPct(row.day_change_pct);
  const displayName = row.name && row.name !== row.ticker ? row.name : null;
  const priceMoveClass = pct?.positive ? "text-signal-bullish" : "text-signal-bearish";

  const openStock = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  return (
    <tr
      className="group cursor-pointer border-b border-outline-variant/10 bg-surface-container-lowest transition-colors hover:bg-surface-container-low focus-visible:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      role="link"
      tabIndex={0}
      aria-label={`Open ${row.ticker}`}
      onClick={openStock}
      onKeyDown={onRowKeyDown}
    >
      <td className="px-5 py-5 align-middle">
        <div className="text-xl font-black tracking-tight text-on-surface transition-colors group-hover:text-primary">
          {row.ticker}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {displayName && (
            <span className="max-w-56 truncate text-xs font-semibold text-on-surface-variant">
              {displayName}
            </span>
          )}
          {row.sector && (
            <span className="text-[10px] font-black tracking-[0.12em] uppercase text-outline">
              {row.sector}
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-5 text-right align-middle">
        <div className="text-base font-black tabular-nums text-on-surface">
          {fmtPrice(row.price)}
        </div>
        {pct && (
          <div className={`mt-1 text-xs font-black tabular-nums ${priceMoveClass}`}>
            {pct.text}
          </div>
        )}
      </td>
      <td className="px-5 py-5 text-center align-middle">
        <ScoreMini value={row.momentum_score} />
      </td>
      <td className="px-5 py-5 text-center align-middle">
        <RsiPill value={row.rsi_14} state={row.rsi_14_state} />
      </td>
      <td className="px-5 py-5 text-right align-middle">
        <HeatScore value={row.heat_score} />
      </td>
      <td className="min-w-[260px] px-5 py-5 align-middle">
        <TagList tags={row.reasons} />
      </td>
    </tr>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function HeatListView({ data }: { data: HeatList | null }) {
  if (!data || data.rows.length === 0) {
    return (
      <div className="bg-surface-container-lowest brutalist-border p-10">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[22px]">local_fire_department</span>
          </div>
          <p className="mt-4 text-[12px] font-black tracking-[0.16em] uppercase text-on-surface">
            Heat list is warming up
          </p>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            We have not generated today&apos;s ranked hot-stock signal yet. Check back
            after the next market refresh.
          </p>
        </div>
      </div>
    );
  }

  const rows = data.rows.slice(0, 10);

  return (
    <div className="overflow-hidden brutalist-border bg-surface-container-lowest">
      <div className="border-b border-outline-variant/20 bg-surface-container-low px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.18em] uppercase text-primary">
              Today&apos;s shortlist
            </p>
            <p className="mt-1 text-sm text-on-surface-variant">
              Showing the top {rows.length} ranked names by heat score.
            </p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black tracking-[0.14em] uppercase text-primary">
            Max 10
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface">
              <th className="px-5 py-3 text-left text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">Stock</th>
              <th className="px-5 py-3 text-right text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">Price</th>
              <th className="px-5 py-3 text-center text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">
                Momentum
              </th>
              <th className="px-5 py-3 text-center text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">
                RSI (14)
              </th>
              <th className="px-5 py-3 text-right text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">Heat</th>
              <th className="px-5 py-3 text-left text-[10px] font-black tracking-[0.16em] uppercase text-on-surface-variant">Why it&apos;s hot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TableRow key={row.instrument_id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
