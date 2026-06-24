import type { VisualCards } from "@/lib/stock";

type Props = {
  cards: VisualCards | null | undefined;
};

function Strength({ value, color }: { value: number; color: string }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-sm"
          style={{ backgroundColor: i < clamped ? color : "var(--surface-container-high)" }}
        />
      ))}
    </div>
  );
}

function ColumnHeader({
  label,
  accent,
  emoji,
  count,
}: {
  label: string;
  accent: string;
  emoji: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[18px] leading-none" aria-hidden>
        {emoji}
      </span>
      <h4 className="text-[14px] font-semibold tracking-[-0.01em]" style={{ color: accent }}>
        {label}
      </h4>
      {typeof count === "number" && count > 0 && (
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-surface-container text-[11px] font-semibold tabular-nums text-on-surface-variant">
          {count}
        </span>
      )}
    </div>
  );
}

function parseWindowDate(windowLabel?: string): Date | null {
  if (!windowLabel) return null;
  const text = windowLabel.trim();
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const short = text.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\b/i);
  if (!short) return null;
  const monthMap: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const month = monthMap[short[1].toUpperCase()];
  const day = Number(short[2]);
  if (!Number.isFinite(day)) return null;
  const year = new Date().getUTCFullYear();
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPastCatalyst(windowLabel?: string): boolean {
  const dt = parseWindowDate(windowLabel);
  if (!dt) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return dt < today;
}

export function CatalystsDriversRisks({ cards }: Props) {
  const catalysts = (cards?.catalyst_cards ?? []).filter((c) => !isPastCatalyst(c.window));
  const drivers = cards?.drivers ?? [];
  const risks = cards?.risk_cards ?? [];

  return (
    <section className="flex flex-col gap-6">
      <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
        Catalysts, drivers &amp; risks
      </h3>

      <div className="flex flex-col gap-8">
        {/* Catalysts */}
        <div className="flex flex-col gap-3">
          <ColumnHeader label="Catalysts" emoji="⚡" accent="#10b981" count={catalysts.length} />
          {catalysts.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">Nothing tracked yet.</p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {catalysts.map((c, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
                >
                  <span className="text-[14px] font-semibold text-on-surface leading-snug">
                    {c.event}
                  </span>
                  {c.detail && (
                    <p className="text-[12px] text-on-surface leading-snug">{c.detail}</p>
                  )}
                  {(c.window || c.priced_in) && (
                    <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
                      {c.window && <span>{c.window}</span>}
                      {c.priced_in && <span>Priced in: {c.priced_in}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Drivers */}
        <div className="flex flex-col gap-3">
          <ColumnHeader label="Drivers" emoji="📈" accent="#0052ff" count={drivers.length} />
          {drivers.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">Nothing tracked yet.</p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {drivers.map((d, i) => {
                const color = d.direction === "down" ? "#ef4444" : "#10b981";
                return (
                  <li
                    key={i}
                    className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[14px] font-semibold text-on-surface leading-snug">
                        {d.label}
                      </span>
                      {typeof d.strength === "number" && (
                        <Strength value={d.strength} color={color} />
                      )}
                    </div>
                    {d.detail && (
                      <p className="text-[12px] text-on-surface leading-snug">{d.detail}</p>
                    )}
                    {d.horizon && (
                      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
                        {d.horizon}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Risks */}
        <div className="flex flex-col gap-3">
          <ColumnHeader label="Risks" emoji="⚠️" accent="#ef4444" count={risks.length} />
          {risks.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">Nothing tracked yet.</p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {risks.map((r, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[14px] font-semibold text-on-surface leading-snug">
                      {r.risk ?? r.label}
                    </span>
                    {typeof r.severity === "number" && (
                      <Strength value={r.severity} color="#ef4444" />
                    )}
                  </div>
                  {r.detail && (
                    <p className="text-[12px] text-on-surface leading-snug">{r.detail}</p>
                  )}
                  {(r.trigger || r.horizon) && (
                    <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
                      {r.horizon && <span>{r.horizon}</span>}
                      {r.trigger && <span>Trigger: {r.trigger}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
