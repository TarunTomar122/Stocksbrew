import type { VisualCards } from "@/lib/stock";

type Props = {
  cards: VisualCards | null | undefined;
};

function Strength({
  value,
  color,
}: {
  value: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-2 h-2"
          style={{
            backgroundColor:
              i < clamped ? color : "var(--surface-container-high)",
          }}
        />
      ))}
    </div>
  );
}

function Column({
  title,
  accent,
  children,
  empty,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <div className="bg-surface-container-lowest brutalist-border p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase text-outline">
          {title}
        </h3>
      </div>
      {children || (
        <div className="text-[13px] text-on-surface-variant py-2">
          {empty ?? "Nothing tracked yet."}
        </div>
      )}
    </div>
  );
}

export function CatalystsDriversRisks({ cards }: Props) {
  const catalysts = cards?.catalyst_cards ?? [];
  const drivers = cards?.drivers ?? [];
  const risks = cards?.risk_cards ?? [];

  return (
    <section>
      <h2 className="text-[14px] font-semibold text-on-surface mb-3">
        Catalysts, Drivers & Risks
      </h2>
      <div className="grid grid-cols-1 gap-4">
        <Column title="Catalysts" accent="var(--signal-bullish)">
          {catalysts.length > 0 && (
            <div className="flex flex-col gap-4">
              {catalysts.map((c, i) => (
                <div key={i}>
                  <div className="text-[14px] font-semibold text-on-surface leading-snug">
                    {c.event}
                  </div>
                  {c.detail && (
                    <p className="mt-1 text-[12px] text-on-surface-variant leading-snug">
                      {c.detail}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
                    {c.window && <span>{c.window}</span>}
                    {c.priced_in && <span>Priced in: {c.priced_in}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Column>

        <Column title="Drivers" accent="var(--primary)">
          {drivers.length > 0 && (
            <div className="flex flex-col gap-4">
              {drivers.map((d, i) => {
                const color =
                  d.direction === "down"
                    ? "var(--signal-bearish)"
                    : "var(--signal-bullish)";
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-semibold text-on-surface leading-snug">
                        {d.label}
                      </span>
                      {typeof d.strength === "number" && (
                        <Strength value={d.strength} color={color} />
                      )}
                    </div>
                    {d.detail && (
                      <p className="mt-1 text-[12px] text-on-surface-variant leading-snug">
                        {d.detail}
                      </p>
                    )}
                    {d.horizon && (
                      <div className="mt-2 text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
                        {d.horizon}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Column>

        <Column title="Risks" accent="var(--signal-bearish)">
          {risks.length > 0 && (
            <div className="flex flex-col gap-4">
              {risks.map((r, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-on-surface leading-snug">
                      {r.risk ?? r.label}
                    </span>
                    {typeof r.severity === "number" && (
                      <Strength
                        value={r.severity}
                        color="var(--signal-bearish)"
                      />
                    )}
                  </div>
                  {r.detail && (
                    <p className="mt-1 text-[12px] text-on-surface-variant leading-snug">
                      {r.detail}
                    </p>
                  )}
                  {(r.trigger || r.horizon) && (
                    <div className="mt-2 flex items-center gap-3 text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
                      {r.horizon && <span>{r.horizon}</span>}
                      {r.trigger && <span>Trigger: {r.trigger}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Column>
      </div>
    </section>
  );
}
