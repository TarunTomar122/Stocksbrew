import type { OpenCall, RadarScoreboard } from "@/lib/radar-scoreboard";

function pct(v: number | null, digits = 0): string {
  if (v === null) return "-";
  return `${v.toFixed(digits)}%`;
}

function signed(v: number | null, digits = 1): string {
  if (v === null) return "-";
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(v).toFixed(digits)}%`;
}

function FlameIcon({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2c1 3-1.5 4.5-1.5 7A2.5 2.5 0 0012 11c1 0 1.8-.7 2-1.7 1 1.2 2 2.9 2 4.7a6 6 0 11-9.4-4.9C8.5 7.5 11 6 12 2z"
        fill={color}
      />
    </svg>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rn-inset flex flex-col justify-between gap-1.5 p-3.5">
      <span className="rn-kick">{label}</span>
      <span className="rn-stat text-[26px] font-extrabold" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {sub ? <span className="text-[11px] leading-tight text-[var(--rn-muted)]">{sub}</span> : null}
    </div>
  );
}

function OpenReceipt({ call }: { call: OpenCall }) {
  const up = call.sinceCallPct >= 0;
  const color = up ? "var(--rn-bull)" : "var(--rn-bear)";
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 shadow-[inset_0_0_0_1px_var(--rn-line)]">
      <span className="text-[12px] font-bold tracking-tight text-[var(--rn-ink)]">{call.ticker}</span>
      <span className="font-mono text-[10px] uppercase text-[var(--rn-muted)]">{call.stance}</span>
      <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color }}>
        {signed(call.sinceCallPct)}
      </span>
    </div>
  );
}

export function Scoreboard({ board }: { board: RadarScoreboard }) {
  if (!board.hasData) {
    return (
      <section aria-labelledby="rn-score">
        <h2 id="rn-score" className="rn-kick mb-3">
          // scoreboard · your track record
        </h2>
        <div className="rn-card p-5">
          <p className="text-[13px] leading-relaxed text-[var(--rn-muted)]">
            Your scoreboard lights up the moment Radar makes its first call on one of your stocks.
            It tracks how each call performs from the price it was issued at.
          </p>
        </div>
      </section>
    );
  }

  const avgAccent =
    board.avgSinceCallPct !== null && board.avgSinceCallPct >= 0 ? "var(--rn-bull)" : "var(--rn-bear)";

  return (
    <section aria-labelledby="rn-score">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="rn-score" className="rn-kick">
          // scoreboard · your track record
        </h2>
        <span className="font-mono text-[11px] text-[var(--rn-muted)]">
          {board.openCalls} open · {board.resolved} resolved
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="avg since our call"
          value={signed(board.avgSinceCallPct)}
          sub="across your open calls"
          accent={board.hasLive ? avgAccent : undefined}
        />
        <Stat
          label="in the green"
          value={board.openCalls > 0 ? `${board.greenCalls}/${board.openCalls}` : "-"}
          sub="open calls in your favor"
          accent={board.greenCalls > 0 ? "var(--rn-bull)" : undefined}
        />
        <Stat
          label="open loops"
          value={String(board.pendingCount)}
          sub={board.pendingCount === 1 ? "waiting on a trigger" : "waiting on triggers"}
          accent={board.pendingCount > 0 ? "var(--signal-neutral)" : undefined}
        />
        {board.hasResolved ? (
          <div className="rn-inset flex flex-col justify-between gap-1.5 p-3.5">
            <span className="rn-kick">7-day hit rate</span>
            <span className="flex items-center gap-1.5">
              <span
                className="rn-stat text-[26px] font-extrabold"
                style={{ color: board.hitRate !== null && board.hitRate >= 0.5 ? "var(--rn-bull)" : "var(--rn-ink)" }}
              >
                {board.hitRate !== null ? pct(board.hitRate * 100) : "-"}
              </span>
              {board.streak > 0 ? (
                <span className="flex items-center gap-0.5 font-mono text-[11px] font-bold" style={{ color: "var(--rn-bull)" }}>
                  {board.streak}
                  <FlameIcon color="var(--rn-bull)" />
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-tight text-[var(--rn-muted)]">
              {board.hits}/{board.resolved} calls hit
            </span>
          </div>
        ) : (
          <Stat label="7-day hit rate" value="soon" sub="unlocks as calls mature" />
        )}
      </div>

      {board.bestOpen || board.openReceipts.length > 0 ? (
        <div className="mt-3 rn-card p-4">
          {board.bestOpen ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rn-kick">best open call</span>
              <span className="font-bold tracking-tight text-[var(--rn-ink)]">{board.bestOpen.ticker}</span>
              <span className="font-mono text-[11px] uppercase text-[var(--rn-muted)]">{board.bestOpen.stance}</span>
              <span
                className="font-mono font-bold"
                style={{ color: board.bestOpen.sinceCallPct >= 0 ? "var(--rn-bull)" : "var(--rn-bear)" }}
              >
                {signed(board.bestOpen.sinceCallPct)}
              </span>
              <span className="text-[var(--rn-muted)]">since we called it</span>
            </div>
          ) : null}

          {board.openReceipts.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {board.openReceipts.map((call) => (
                <OpenReceipt key={call.ticker} call={call} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
