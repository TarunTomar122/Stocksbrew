import type { ShareBars, ShareCard, ShareTone } from "@/lib/share/types";

/**
 * A share card on a page: the same parts as the image (lib/share/og.tsx),
 * laid out for the screen. Used by the preview before sharing and by the
 * public page at /s/{id}. No hooks, so it renders on either side.
 */

function toneText(tone: ShareTone): string {
  return tone === "up" ? "text-signal-bullish" : tone === "down" ? "text-signal-bearish" : "text-oa-fg";
}

function toneFill(tone: ShareTone): string {
  return tone === "up" ? "bg-signal-bullish" : tone === "down" ? "bg-signal-bearish" : "bg-oa-fg";
}

function Glyph({ tone }: { tone: ShareTone }) {
  if (tone === "flat") return <span aria-hidden className="mt-[7px] inline-block size-1.5 shrink-0 rounded-full bg-oa-primary" />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`mt-[3px] size-3.5 shrink-0 ${toneText(tone)}`}>
      <path d={tone === "up" ? "M12 4 L21 19 L3 19 Z" : "M3 5 L21 5 L12 20 Z"} fill="currentColor" />
    </svg>
  );
}

function Bars({ bars }: { bars: ShareBars }) {
  if (bars.style === "months") {
    const max = Math.max(...bars.rows.map((row) => row.value), 0) || 1;
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="oa-caption">{bars.title}</figcaption>
        <div className="flex h-28 items-end gap-1" role="list">
          {bars.rows.map((row, index) => (
            <div key={index} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-label={`${row.label}${row.display ? ` ${row.display}` : ""}`}>
              <div
                className={`w-full rounded-[3px] ${row.value > 0 ? "bg-oa-primary" : "bg-oa-border"}`}
                style={{ height: `${Math.max(row.value > 0 ? 5 : 2, Math.round((row.value / max) * 100))}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1" aria-hidden>
          {bars.rows.map((row, index) => (
            <span key={index} className="oa-mono min-w-0 flex-1 text-center text-[11px] text-oa-muted-fg">
              {row.label}
            </span>
          ))}
        </div>
      </figure>
    );
  }
  const max = Math.max(...bars.rows.map((row) => Math.abs(row.value)), 0) || 1;
  const versus = bars.style === "versus";
  return (
    <figure className="flex flex-col gap-2.5">
      <figcaption className="oa-caption">{bars.title}</figcaption>
      <ul className={`flex flex-col ${versus ? "gap-3" : "gap-2"}`}>
        {bars.rows.slice(0, versus ? 2 : 5).map((row, index) => (
          <li key={index} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 text-[14px] leading-5 text-oa-fg ${row.highlight ? "font-semibold" : ""}`}>{row.label}</span>
              {row.display ? (
                <span className={`oa-mono shrink-0 tabular-nums ${versus ? `text-[16px] ${toneText(row.tone)}` : "text-[13px] text-oa-fg"}`}>{row.display}</span>
              ) : null}
            </div>
            <div className={`w-full overflow-hidden rounded-full bg-oa-bg ${versus ? "h-2.5" : "h-1.5"}`}>
              <div
                className={`h-full rounded-full ${versus ? toneFill(row.tone) : row.highlight ? "bg-oa-primary" : "bg-oa-muted-fg"}`}
                style={{ width: `${Math.max(3, Math.round((Math.abs(row.value) / max) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function ShareCardView({ card, path, className = "" }: { card: ShareCard; path?: string | null; className?: string }) {
  return (
    <article className={`relative flex flex-col overflow-hidden rounded-xl border border-oa-border bg-oa-page ${className}`} aria-label="Share card">
      <div aria-hidden className="h-1.5 w-full bg-oa-primary" />
      <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] text-oa-fg">
          <svg aria-hidden viewBox="0 0 56 56" fill="none" className="size-[18px]">
            <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
            <path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
          </svg>
          stocksbrew
        </span>
        <span className="oa-label truncate">{card.topic}</span>
      </div>
      <div className={`grid gap-5 px-4 py-5 sm:px-6 sm:py-6 ${card.bars ? "md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-center" : ""}`}>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-balance text-[22px] font-bold leading-[1.15] tracking-[-0.02em] text-oa-fg sm:text-[28px]">{card.headline}</p>
          {card.lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {card.lines.map((line, index) => (
                <li key={index} className="flex items-start gap-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:text-[15px]">
                  <Glyph tone={line.tone} />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {card.bars ? (
          <div className="min-w-0 rounded-lg border border-oa-border bg-oa-card p-3 sm:p-4">
            <Bars bars={card.bars} />
          </div>
        ) : null}
      </div>
      <div className="mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-oa-border py-2.5 sm:mx-6">
        <span className="oa-mono text-[12px] text-oa-fg">stocksbrew.online{path ?? ""}</span>
        <span className="oa-mono text-[11.5px] leading-4 text-oa-muted-fg">{card.footnote}</span>
      </div>
    </article>
  );
}
