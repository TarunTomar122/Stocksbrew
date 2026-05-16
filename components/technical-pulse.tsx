type Props = {
  weekHigh?: number;
  weekLow?: number;
  currentPrice?: number;
  rsi?: number;
  rsiLabel?: string;
  rsiMocked?: boolean;
  // Trend card inputs - 50D / 200D moving averages come pre-computed from
  // Yahoo's `.info`, so we don't have to warehouse deep price history. Beta
  // is a bonus volatility gauge from the same payload.
  sma50?: number;
  sma200?: number;
  beta?: number;
  currency?: string;
};

function toneForRsi(rsi: number): {
  label: string;
  color: string;
  accent: string;
  hint: string;
} {
  if (rsi >= 70)
    return {
      label: "Overbought",
      color: "text-signal-bearish",
      accent: "var(--signal-bearish)",
      hint: "Pullback risk rising.",
    };
  if (rsi >= 55)
    return {
      label: "Bullish",
      color: "text-signal-bullish",
      accent: "var(--signal-bullish)",
      hint: "Momentum leaning up.",
    };
  if (rsi >= 45)
    return {
      label: "Neutral",
      color: "text-on-surface-variant",
      accent: "var(--signal-neutral)",
      hint: "No clear momentum.",
    };
  if (rsi >= 30)
    return {
      label: "Bearish",
      color: "text-signal-bearish",
      accent: "var(--signal-bearish)",
      hint: "Momentum leaning down.",
    };
  return {
    label: "Oversold",
    color: "text-signal-bullish",
    accent: "var(--signal-bullish)",
    hint: "Bounce zone.",
  };
}

function formatPrice(v: number): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MaRow({
  label,
  value,
  gapPct,
  currency,
}: {
  label: string;
  value: number | undefined;
  gapPct: number | null;
  currency: string;
}) {
  const has = typeof value === "number" && value > 0;
  return (
    <div className="flex justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-semibold tabular-nums text-on-surface">
        {has ? `${currency}${formatPrice(value!)}` : "-"}
        {gapPct !== null && (
          <span
            className={`ml-2 ${
              gapPct >= 0 ? "text-signal-bullish" : "text-signal-bearish"
            }`}
          >
            {gapPct >= 0 ? "+" : ""}
            {gapPct.toFixed(2)}%
          </span>
        )}
      </span>
    </div>
  );
}

function CardShell({
  label,
  mocked,
  accent,
  children,
}: {
  label: string;
  mocked?: boolean;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-surface-container-low p-5 brutalist-border relative flex flex-col overflow-hidden"
    >
      {mocked && (
        <span
          title="Mocked - not yet persisted in Firestore."
          className="absolute top-3 right-3 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
        >
          Mock
        </span>
      )}
      <div
        className="text-[11px] font-bold tracking-[0.2em] uppercase mb-3"
        style={{ color: accent }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RsiGauge({ value, markerColor }: { value: number; markerColor: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-4">
      <div className="relative h-1.5 bg-surface-container-high overflow-visible">
        <div
          className="absolute top-0 bottom-0 left-0 bg-signal-bullish/40"
          style={{ width: "30%" }}
        />
        <div
          className="absolute top-0 bottom-0 bg-signal-bearish/40"
          style={{ left: "70%", width: "30%" }}
        />
        <div
          className="absolute -top-1 -bottom-1 w-[3px]"
          style={{
            left: `calc(${clamped}% - 1.5px)`,
            backgroundColor: markerColor,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-bold tracking-[0.15em] uppercase text-outline mt-1.5 tabular-nums">
        <span>0</span>
        <span>30</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  );
}

export function TechnicalPulse({
  weekHigh,
  weekLow,
  currentPrice,
  rsi,
  rsiLabel,
  rsiMocked,
  sma50,
  sma200,
  beta,
  currency = "$",
}: Props) {
  const hasRsi = typeof rsi === "number";
  const rsiValue = hasRsi ? rsi! : 58;
  const rsiTone = toneForRsi(rsiValue);

  // ─── Trend card: price vs 50D & 200D MA + beta ──────────────────────
  const has50 = typeof sma50 === "number" && sma50 > 0;
  const has200 = typeof sma200 === "number" && sma200 > 0;
  const hasPrice = typeof currentPrice === "number" && currentPrice > 0;
  const gap50 = has50 && hasPrice ? ((currentPrice! - sma50!) / sma50!) * 100 : null;
  const gap200 = has200 && hasPrice ? ((currentPrice! - sma200!) / sma200!) * 100 : null;
  const above50 = gap50 !== null ? gap50 >= 0 : null;
  const above200 = gap200 !== null ? gap200 >= 0 : null;
  // Headline state for the trend card - both MAs above = Uptrend,
  // both below = Downtrend, mixed = Transition.
  let trendHeadline: "Uptrend" | "Downtrend" | "Transition" | "-" = "-";
  let trendAccent = "var(--signal-neutral)";
  if (above50 !== null && above200 !== null) {
    if (above50 && above200) {
      trendHeadline = "Uptrend";
      trendAccent = "var(--signal-bullish)";
    } else if (!above50 && !above200) {
      trendHeadline = "Downtrend";
      trendAccent = "var(--signal-bearish)";
    } else {
      trendHeadline = "Transition";
      trendAccent = "var(--signal-neutral)";
    }
  } else if (above50 !== null) {
    trendHeadline = above50 ? "Uptrend" : "Downtrend";
    trendAccent = above50 ? "var(--signal-bullish)" : "var(--signal-bearish)";
  }
  const trendMocked = !has50 && !has200;

  const distHighPct =
    typeof weekHigh === "number" &&
    typeof currentPrice === "number" &&
    weekHigh > 0
      ? ((currentPrice - weekHigh) / weekHigh) * 100
      : null;
  const distLowPct =
    typeof weekLow === "number" &&
    typeof currentPrice === "number" &&
    weekLow > 0
      ? ((currentPrice - weekLow) / weekLow) * 100
      : null;
  const distMocked = distHighPct === null;

  const rangePosition =
    typeof currentPrice === "number" &&
    typeof weekHigh === "number" &&
    typeof weekLow === "number" &&
    weekHigh > weekLow
      ? ((currentPrice - weekLow) / (weekHigh - weekLow)) * 100
      : null;

  const rangeAccent =
    distHighPct === null
      ? "var(--outline)"
      : distHighPct >= -5
        ? "var(--signal-bullish)"
        : distHighPct >= -15
          ? "var(--signal-neutral)"
          : "var(--signal-bearish)";

  return (
    <section>
      <h2 className="text-[14px] font-semibold text-on-surface mb-3">
        Technical Pulse
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CardShell
          label="RSI (14)"
          mocked={rsiMocked ?? !hasRsi}
          accent={rsiTone.accent}
        >
          <div className="flex items-baseline gap-3">
            <span
              className="text-[32px] font-bold tracking-[-0.02em] tabular-nums leading-none"
              style={{ color: rsiTone.accent }}
            >
              {rsiValue.toFixed(1)}
            </span>
            <span className={`text-[13px] font-bold ${rsiTone.color}`}>
              {rsiLabel ?? rsiTone.label}
            </span>
          </div>
          <RsiGauge value={rsiValue} markerColor={rsiTone.accent} />
          <div className="mt-3 text-[11px] text-on-surface-variant leading-relaxed">
            {rsiTone.hint} 14-day relative strength; {">70"} is overbought,{" "}
            {"<30"} is oversold.
          </div>
        </CardShell>

        <CardShell label="Trend" mocked={trendMocked} accent={trendAccent}>
          <div className="flex items-baseline gap-3">
            <span
              className="text-[32px] font-bold tracking-[-0.02em] leading-none"
              style={{ color: trendAccent }}
            >
              {trendHeadline}
            </span>
            {typeof beta === "number" && (
              <span className="text-[12px] font-semibold text-on-surface-variant tabular-nums">
                β {beta.toFixed(2)}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-1 text-[11px]">
            <MaRow
              label="50-day avg"
              value={sma50}
              gapPct={gap50}
              currency={currency}
            />
            <MaRow
              label="200-day avg"
              value={sma200}
              gapPct={gap200}
              currency={currency}
            />
          </div>
          <div className="mt-3 text-[11px] text-on-surface-variant leading-relaxed">
            Price vs. its 50- and 200-day averages. Above both = established
            uptrend; below both = established downtrend.
          </div>
        </CardShell>

        <CardShell
          label="52W Range"
          mocked={distMocked}
          accent={rangeAccent}
        >
          <div className="flex items-baseline gap-3">
            <span
              className="text-[32px] font-bold tracking-[-0.02em] tabular-nums leading-none"
              style={{ color: rangeAccent }}
            >
              {distHighPct === null
                ? "-"
                : `${distHighPct > 0 ? "+" : ""}${distHighPct.toFixed(1)}%`}
            </span>
            <span className="text-[13px] font-semibold text-on-surface-variant">
              from 52W high
            </span>
          </div>

          {rangePosition !== null && (
            <div className="mt-4">
              <div
                className="relative h-1.5"
                style={{
                  background:
                    "linear-gradient(to right, var(--signal-bearish), var(--signal-neutral), var(--signal-bullish))",
                }}
              >
                <div
                  className="absolute -top-1 -bottom-1 w-[3px]"
                  style={{
                    left: `calc(${Math.max(0, Math.min(100, rangePosition))}% - 1.5px)`,
                    backgroundColor: "var(--on-surface)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-bold tracking-[0.15em] uppercase text-outline mt-1.5">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1 text-[11px]">
            {typeof weekLow === "number" && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">52W low</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {currency}{formatPrice(weekLow)}
                  {distLowPct !== null && (
                    <span className="text-signal-bullish ml-2">
                      +{distLowPct.toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
            )}
            {typeof weekHigh === "number" && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">52W high</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {currency}{formatPrice(weekHigh)}
                </span>
              </div>
            )}
          </div>
        </CardShell>
      </div>
    </section>
  );
}
