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
      <div>
        <p className="landing-section-kicker text-landing-brand">Market pulse</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">What is worth opening today?</h1>

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
        ) : null}
        {topline ? <div className="pulse-facts"><span>{topline.gainers} gainers</span><span>{topline.losers} losers</span>{topline.crowd ? <span>Crowd {topline.crowd}</span> : null}</div> : null}
      </div>
    </section>
  );
}
