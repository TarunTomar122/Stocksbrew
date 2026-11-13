import { levelScale, type ProposalLevel } from "@/lib/proposals";

/* Shared by the proposal cards (/agent) and the landing's agent strip: plain markup, no state, so either can render it. */

function price(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The price against the level the proposal is about, as a small bar (owner rule 4: two numbers get a visual). The
 * scale is fixed around the price (at least ±10%, wider for a far level), so the distance between the dot (now) and
 * the tick (the level) reads true from card to card; each label sits on its own mark's side. The figures themselves
 * are in the card's line, or with `withPrice` (a level card, whose line has no figures) the level's price is here.
 */
export function LevelBar({ now, level, withPrice = false }: { now: number; level: ProposalLevel; withPrice?: boolean }) {
  const { nowAt, levelAt, gapPct } = levelScale(now, level.price);
  const gapWords =
    Math.abs(gapPct) < 0.05
      ? "at today's price"
      : `${Math.abs(gapPct).toFixed(1)}% ${gapPct < 0 ? "below" : "above"} now`;
  const nowLabel = (
    <span>
      <span aria-hidden="true" className="mr-1 inline-block size-2 rounded-full bg-oa-primary align-[1px]" />
      Now
    </span>
  );
  const levelLabel = (
    <span>
      {level.label}
      {/* A card whose line leaves the figure out (a level crossed) says it here, once, beside how far it is. */}
      {withPrice ? <span className="oa-mono tabular-nums text-oa-fg">{` ${price(level.price)}`}</span> : null}
      {withPrice ? `, ${gapWords}` : ` ${gapWords}`}
    </span>
  );
  const levelLeft = levelAt < nowAt;
  return (
    <span className="mt-2.5 block">
      <span aria-hidden="true" className="relative block h-1.5 rounded-full bg-oa-accent">
        <span
          className="absolute top-0 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--oa-primary)_30%,transparent)]"
          style={{
            left: `${Math.min(nowAt, levelAt)}%`,
            width: `${Math.abs(nowAt - levelAt)}%`,
          }}
        />
        <span
          className="absolute -top-[3px] h-3 w-0.5 -translate-x-1/2 rounded-full bg-oa-fg"
          style={{ left: `${levelAt}%` }}
        />
        <span
          className="absolute -top-[2px] size-2.5 -translate-x-1/2 rounded-full border-2 border-oa-card bg-oa-primary"
          style={{ left: `${nowAt}%` }}
        />
      </span>
      <span className="mt-1 flex justify-between gap-3 text-[12px] leading-4 text-oa-muted-fg">
        {levelLeft ? levelLabel : nowLabel}
        {levelLeft ? nowLabel : levelLabel}
      </span>
    </span>
  );
}

/**
 * A report coming up: where its usual report move would take the price, as a band around the price now (the same
 * height as the level bar, so cards side by side keep their shape). Real figures: the stock's own past reports.
 */
export function MoveRange({ now, pct }: { now: number; pct: number }) {
  const low = now * (1 - pct / 100);
  const high = now * (1 + pct / 100);
  // The band sits on the same fixed scale as the level bar (at least ±10%), so a wide usual move looks wide.
  const half = Math.max(10, pct * 1.25);
  const left = 50 - (pct * 50) / half;
  const width = (pct * 100) / half;
  return (
    <span className="mt-2.5 block">
      <span aria-hidden="true" className="relative block h-1.5 rounded-full bg-oa-accent">
        <span
          className="absolute top-0 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--oa-primary)_30%,transparent)]"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <span className="absolute -top-[2px] left-1/2 size-2.5 -translate-x-1/2 rounded-full border-2 border-oa-card bg-oa-primary" />
      </span>
      <span className="mt-1 flex justify-between gap-3 text-[12px] leading-4 text-oa-muted-fg">
        <span className="oa-mono tabular-nums">{price(low)}</span>
        <span>Usual report move ±{pct.toFixed(1)}%</span>
        <span className="oa-mono tabular-nums">{price(high)}</span>
      </span>
    </span>
  );
}
