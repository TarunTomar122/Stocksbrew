import type { EssentialCard } from "@/lib/types";

type Props = {
  cards: EssentialCard[] | null | undefined;
};

const EVENT_META: Record<
  string,
  { label: string; accent: string }
> = {
  macro: { label: "Macro", accent: "var(--primary)" },
  earnings: { label: "Earnings", accent: "var(--signal-bullish)" },
  guidance: { label: "Guidance", accent: "var(--signal-neutral)" },
  policy: { label: "Policy", accent: "var(--primary)" },
  flow: { label: "Flows", accent: "var(--signal-bullish)" },
  technical: { label: "Technical", accent: "var(--signal-neutral)" },
  sentiment: { label: "Sentiment", accent: "var(--primary)" },
};

function directionArrow(dir?: string): string {
  const d = (dir ?? "").toLowerCase();
  if (d === "up") return "↑";
  if (d === "down") return "↓";
  if (d === "mixed") return "↔";
  return "·";
}

function directionColor(dir?: string): string {
  const d = (dir ?? "").toLowerCase();
  if (d === "up") return "text-signal-bullish";
  if (d === "down") return "text-signal-bearish";
  return "text-on-surface-variant";
}

function confidenceDot(conf?: string): string {
  const c = (conf ?? "").toLowerCase();
  if (c === "high") return "●●●";
  if (c === "med") return "●●○";
  if (c === "low") return "●○○";
  return "";
}

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const width = 120;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-[100px] h-[28px] flex-shrink-0"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EssentialCards({ cards }: Props) {
  if (!cards || cards.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-primary rounded-full" />
        <h2 className="text-[13px] font-bold text-on-surface tracking-tight">
          Essential Signals
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const meta =
            EVENT_META[card.event_type] ?? {
              label: card.event_type,
              accent: "var(--outline)",
            };
          const arrow = directionArrow(card.direction);
          const dirColor = directionColor(card.direction);
          const conf = confidenceDot(card.confidence);

          const body = (
            <div
              className="bg-surface rounded-2xl p-5 flex flex-col gap-3 h-full shadow-card border border-outline-variant/30 hover:shadow-card-hover hover:border-outline/50 transition-all"
              style={{ borderLeft: `3px solid ${meta.accent}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold tracking-[0.12em] uppercase"
                    style={{ color: meta.accent }}
                  >
                    {meta.label}
                  </span>
                  {card.symbol && (
                    <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-on-surface bg-surface-container-high px-1.5 py-px rounded">
                      {card.symbol}
                    </span>
                  )}
                </div>
                <span className={`text-[14px] font-bold ${dirColor}`}>
                  {arrow}
                </span>
              </div>

              <p className="text-[13px] font-semibold text-on-surface leading-snug">
                {card.sentence}
              </p>

              <div className="mt-auto flex items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5 text-[10px] font-bold tracking-[0.1em] uppercase text-outline">
                  {conf && <span>Confidence {conf}</span>}
                  {typeof card.impact_score === "number" && (
                    <span>Impact {card.impact_score.toFixed(1)}</span>
                  )}
                </div>
                {card.series && card.series.length > 1 && (
                  <MiniSpark data={card.series} color={meta.accent} />
                )}
              </div>
            </div>
          );

          return card.href ? (
            <a key={card.id} href={card.href} className="block">
              {body}
            </a>
          ) : (
            <div key={card.id}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
