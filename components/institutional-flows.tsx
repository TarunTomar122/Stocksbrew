import type { InstitutionalFlowsDoc } from "@/lib/market-signals";

type Props = {
  flows?: InstitutionalFlowsDoc | null;
};

function formatCr(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}k Cr`;
  return `${value.toFixed(0)} Cr`;
}

function directionClasses(direction: string): {
  text: string;
  bar: string;
  badge: string;
} {
  if (direction === "inflow") {
    return {
      text: "text-signal-bullish",
      bar: "bg-signal-bullish",
      badge: "bg-signal-bullish/15 text-signal-bullish",
    };
  }
  if (direction === "outflow") {
    return {
      text: "text-signal-bearish",
      bar: "bg-signal-bearish",
      badge: "bg-signal-bearish/15 text-signal-bearish",
    };
  }
  return {
    text: "text-on-surface",
    bar: "bg-signal-neutral",
    badge: "bg-signal-neutral/20 text-on-surface",
  };
}

function headline(flows: InstitutionalFlowsDoc["flows"]): {
  title: string;
  subtitle: string;
} {
  if (!flows.length) {
    return { title: "No data yet", subtitle: "" };
  }
  const fii = flows.find((f) => f.category === "FII");
  const dii = flows.find((f) => f.category === "DII");
  if (!fii || !dii) {
    const row = fii || dii!;
    return {
      title: `${row.category} net ₹${row.net_cr >= 0 ? "+" : ""}${row.net_cr.toFixed(0)} Cr`,
      subtitle: "",
    };
  }
  const fiiDir = fii.net_cr >= 0 ? "bought" : "sold";
  const diiDir = dii.net_cr >= 0 ? "bought" : "sold";
  // Use the directional combo to decode what it *means*, not just what happened.
  // FII+ / DII+ → broad risk-on. FII− / DII+ → locals absorbing foreign selling
  // (classic IN pattern). FII+ / DII− → foreign-led rally, often fragile. Both
  // sellers → broad risk-off.
  if (fii.direction === "inflow" && dii.direction === "inflow") {
    return {
      title: "Both sides buying",
      subtitle: "Foreign and domestic funds net buyers — broad risk-on tape.",
    };
  }
  if (fii.direction === "outflow" && dii.direction === "outflow") {
    return {
      title: "Both sides selling",
      subtitle: "Foreign and domestic funds net sellers — broad risk-off.",
    };
  }
  if (fii.direction === "outflow" && dii.direction === "inflow") {
    return {
      title: "Locals absorbing foreign selling",
      subtitle: `FIIs ${fiiDir} while DIIs ${diiDir} — domestic support cushioning the tape.`,
    };
  }
  return {
    title: "Foreign-led, locals fading",
    subtitle: `FIIs ${fiiDir} while DIIs ${diiDir} — watch for follow-through.`,
  };
}

export function InstitutionalFlows({ flows }: Props) {
  const rows = flows?.flows ?? [];
  const mocked = !flows;

  // Scale bars to whichever absolute flow is largest so the visual compares
  // FII vs DII on the same axis rather than padding them to 100%.
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net_cr)));

  const head = headline(rows);

  return (
    <div className="bg-surface-container-lowest brutalist-border rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-on-surface">
          Institutional flows
        </h3>
        {mocked && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm">
            Mock
          </span>
        )}
      </div>
      <p className="text-[11px] text-on-surface-variant leading-snug mb-4">
        <strong className="text-on-surface">FII</strong> = foreign funds (global
        macro money);{" "}
        <strong className="text-on-surface">DII</strong> = domestic funds (MFs,
        insurers, pensions). When they disagree, the split tells you who's
        really driving price.
      </p>

      <div className="mb-4">
        <div className="text-[15px] font-bold text-on-surface leading-tight">
          {head.title}
        </div>
        {head.subtitle && (
          <p className="text-[11px] text-on-surface-variant leading-snug mt-1">
            {head.subtitle}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const cls = directionClasses(row.direction);
          const fraction = Math.min(1, Math.abs(row.net_cr) / maxAbs);
          const sign = row.net_cr >= 0 ? "+" : "−";
          return (
            <div key={row.category} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-on-surface">
                  {row.category}
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase rounded-sm ${cls.badge}`}>
                    {row.direction}
                  </span>
                </span>
                <span className={`text-[14px] font-bold tabular-nums ${cls.text}`}>
                  ₹{sign}
                  {formatCr(Math.abs(row.net_cr))}
                </span>
              </div>
              <div className="relative h-1.5 bg-surface-container-high">
                <div
                  className={`absolute inset-y-0 ${row.net_cr >= 0 ? "left-1/2" : "right-1/2"} ${cls.bar}`}
                  style={{ width: `${fraction * 50}%` }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-on-surface/30" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                <span>Buy ₹{formatCr(row.buy_cr)}</span>
                <span>Sell ₹{formatCr(row.sell_cr)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {flows && (
        <div className="mt-auto pt-3 border-t border-outline-variant text-[10px] text-on-surface-variant">
          {flows.source} · {flows.snapshot_date}
        </div>
      )}
    </div>
  );
}
