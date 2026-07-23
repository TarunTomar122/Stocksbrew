import type { PulseTopline } from "@/components/pulse-hub";

function pctEl(v: number) {
  const up = v >= 0;
  return (
    <span style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

export function PulseHubHero({ topline }: { topline?: PulseTopline | null }) {
  return (
    <section className="pulse-hero">
      <svg
        className="pulse-hero-chart"
        viewBox="0 0 320 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M0 88 C40 72, 70 96, 110 68 S190 42, 250 58 S300 34, 320 28"
          stroke="var(--outline-variant)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M0 98 C35 84, 80 102, 125 78 S205 62, 265 72 S305 54, 320 48"
          stroke="color-mix(in srgb, var(--signal-bullish) 35%, var(--outline-variant))"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M0 72 C50 58, 95 82, 140 52 S220 36, 280 44 S310 30, 320 22"
          stroke="color-mix(in srgb, var(--signal-bullish) 55%, transparent)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative">
        <p className="landing-section-kicker text-landing-brand">// Market Today</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">
            US stock market analysis, right now.
          </h1>
          <span className="pulse-live-badge shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-landing-mint" />
            Live
          </span>
        </div>

        {topline?.lead ? (
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-on-surface-variant">
            <b style={{ color: topline.lead.avg >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
              {topline.lead.avg >= 0 ? "Risk-on." : "Risk-off."}
            </b>{" "}
            {topline.lead.label} leading {pctEl(topline.lead.avg)}
            {topline.lag ? (
              <>
                , {topline.lag.label} lagging {pctEl(topline.lag.avg)}
              </>
            ) : null}
            .
          </p>
        ) : (
          <div className="mt-3 h-4 w-full max-w-xl rounded-md landing-bone" aria-hidden />
        )}
      </div>
    </section>
  );
}
