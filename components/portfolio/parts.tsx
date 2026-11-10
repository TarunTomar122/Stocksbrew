import * as React from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";

import {
  fmtDay,
  fmtSignedPct,
  type EarningsDate,
  type PortfolioPosition,
  type Tone,
} from "@/lib/portfolio-shared";

/** Small pieces every Portfolio tab draws. No state, safe on either side. */

export const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";
export const TH = "oa-caption h-9 whitespace-nowrap bg-oa-bg px-2 py-0";
export const TD = "whitespace-nowrap px-2 py-0 align-middle";
export const NUM = "oa-mono tabular-nums";
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";

export function Dash() {
  return (
    <span aria-label="not available" className="text-oa-muted-fg/60">
      –
    </span>
  );
}

export function signTone(value: number): string {
  return value >= 0 ? "text-signal-bullish" : "text-signal-bearish";
}

export function Pct({ value, digits = 2, className = "" }: { value: number | null; digits?: number; className?: string }) {
  if (value === null) return <Dash />;
  return <span className={`${NUM} ${signTone(value)} ${className}`}>{fmtSignedPct(value, digits)}</span>;
}

function stanceTone(stance: string): Tone {
  const lower = stance.toLowerCase();
  if (lower === "accumulate") return "bull";
  if (lower === "trim" || lower === "avoid") return "bear";
  return "neutral";
}

const TONE_TEXT: Record<Tone, string> = {
  bull: "text-signal-bullish",
  bear: "text-signal-bearish",
  neutral: "text-oa-fg",
};

/** Our call and its price zone on one line: "Hold · Add below $180". */
export function CallCell({ position }: { position: Pick<PortfolioPosition, "stance" | "zone" | "needsAttention"> }) {
  if (!position.stance) return <Dash />;
  const tone = stanceTone(position.stance);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex h-[20px] items-center rounded border px-1.5 text-[12px] font-medium capitalize ${TONE_TEXT[tone]} ${
          position.needsAttention ? "border-current" : "border-oa-border"
        }`}
        title={position.needsAttention ? "The price is inside this call's zone now" : undefined}
      >
        {position.stance}
      </span>
      {position.zone ? (
        <span className={`${NUM} whitespace-nowrap text-[12px] text-oa-muted-fg`}>{position.zone.label}</span>
      ) : null}
    </span>
  );
}

const TIME_LABEL: Record<NonNullable<EarningsDate["time"]>, string> = {
  bmo: "before open",
  amc: "after close",
  during: "",
};

export function EarningsCell({ next, today }: { next: EarningsDate | null; today: string }) {
  if (!next) return <Dash />;
  const days = Math.round((Date.parse(`${next.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const soon = days >= 0 && days <= 7;
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`;
  const time = next.time ? TIME_LABEL[next.time] : "";
  return (
    <span className={`${NUM} text-[12px] ${soon ? "text-oa-primary" : "text-oa-fg"}`} title={time ? `Reports ${time}` : undefined}>
      {fmtDay(next.date)}
      <span className="ml-1 text-[11px] text-oa-muted-fg">{when}</span>
    </span>
  );
}

export function Stat({
  label,
  value,
  note,
  title,
  mark,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  title?: string;
  /** Good or bad, from `markFor` in lib/tone. Neutral gets no mark: a gray one beside a number reads as a minus sign. */
  mark?: "up" | "down";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-oa-card px-3 py-2.5" title={title}>
      <span className="oa-caption">{label}</span>
      <span className={`${NUM} flex items-center gap-1.5 text-[18px] font-medium leading-6 text-oa-fg`}>
        {value}
        {mark ? <ToneGlyph tone={mark} /> : null}
      </span>
      {note ? <span className="text-[11.5px] leading-4 text-oa-muted-fg">{note}</span> : null}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-oa-border px-3 py-2">
      <h2 className="oa-label">{children}</h2>
      {aside ? <div className="oa-mono text-[11px] text-oa-muted-fg">{aside}</div> : null}
    </div>
  );
}

export function EmptyNote({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-[14px] font-medium text-oa-fg">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-oa-muted-fg">{children}</div> : null}
    </div>
  );
}
