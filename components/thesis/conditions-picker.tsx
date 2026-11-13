"use client";

import { useEffect, useState } from "react";

import type { ConditionMenu, MetricOption } from "@/app/api/thesis/conditions/route";
import { barScale, cleanNumber, figureText, formatValue, MAX_CONDITIONS, METRICS, type Condition, type ConditionMetric, type ConditionOp } from "@/lib/thesis-watch/conditions";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/* ── the bar ────────────────────────────────────────────────────────────── */

/**
 * Where the stock is against the person's line, on one honest scale (lib/thesis-watch/conditions.ts barScale): a thin
 * track from zero (or a round number under it, with zero marked) to a round end, both ends labelled once; the figure
 * as a fill from zero (green while the line holds, red once it breaks) and the line as a tick. The words beside it
 * say the same.
 */
export function ConditionBar({ metric, now, line, holds, className = "" }: { metric: ConditionMetric; now: number; line: number; holds: boolean; className?: string }) {
  const scale = barScale(metric, now, line);
  const base = scale.zero ?? 0;
  const left = Math.min(base, scale.value);
  const width = Math.abs(scale.value - base);
  return (
    <span aria-hidden="true" className={`flex flex-col gap-0.5 ${className}`}>
      <span className="relative block h-1.5 rounded-full bg-oa-bg">
        <span className={`absolute inset-y-0 rounded-full ${holds ? "bg-signal-bullish" : "bg-signal-bearish"}`} style={{ left: `${left * 100}%`, width: `${width * 100}%` }} />
        {scale.zero !== null ? <span className="absolute -inset-y-0.5 w-px bg-oa-muted-fg" style={{ left: `${scale.zero * 100}%` }} /> : null}
        <span className="absolute -inset-y-1 w-[2px] rounded-full bg-oa-fg" style={{ left: `calc(${scale.line * 100}% - 1px)` }} />
      </span>
      <span className="oa-type-fixed oa-mono flex justify-between text-[11px] leading-[13px] tabular-nums text-oa-muted-fg">
        <span>{formatValue(metric, scale.from)}</span>
        <span>{formatValue(metric, scale.to)}</span>
      </span>
    </span>
  );
}

/* ── one line, edited ───────────────────────────────────────────────────── */

/** A condition being typed: the number stays text until it is saved. */
export type DraftCondition = { metric: ConditionMetric; op: ConditionOp; text: string };

export function draftOf(condition: Condition): DraftCondition {
  return { metric: condition.metric, op: condition.op, text: String(condition.value) };
}

/** The drafts as conditions, or null when a number is missing or outside its bounds. */
export function parseDrafts(drafts: readonly DraftCondition[]): Condition[] | null {
  const out: Condition[] = [];
  for (const draft of drafts) {
    const value = Number(draft.text.replace(/[$,%\s]/g, ""));
    const spec = METRICS[draft.metric];
    if (!draft.text.trim() || !Number.isFinite(value) || value < spec.min || value > spec.max) return null;
    out.push({ metric: draft.metric, op: draft.op, value: cleanNumber(draft.metric, value) });
  }
  return out;
}

function holdsAt(op: ConditionOp, now: number, line: number): boolean {
  return op === "above" ? now >= line : now <= line;
}

function ConditionRow({
  draft,
  options,
  taken,
  onChange,
  onRemove,
}: {
  draft: DraftCondition;
  options: MetricOption[];
  taken: Set<ConditionMetric>;
  onChange: (next: DraftCondition) => void;
  onRemove: () => void;
}) {
  const spec = METRICS[draft.metric];
  const option = options.find((item) => item.metric === draft.metric) ?? null;
  const value = Number(draft.text.replace(/[$,%\s]/g, ""));
  const valid = draft.text.trim() !== "" && Number.isFinite(value) && value >= spec.min && value <= spec.max;
  const pick = (metric: ConditionMetric) => {
    const next = options.find((item) => item.metric === metric);
    const op = METRICS[metric].defaultOp;
    onChange({ metric, op, text: next?.prefill[op] !== undefined ? String(next.prefill[op]) : "" });
  };
  const flip = (op: ConditionOp) => {
    if (op === draft.op) return;
    // A new side starts from its own sensible number, so "<" does not keep a line the stock is already under.
    onChange({ ...draft, op, text: option?.prefill[op] !== undefined ? String(option.prefill[op]) : draft.text });
  };
  const holds = option && valid ? holdsAt(draft.op, option.now, value) : null;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <select
          value={draft.metric}
          onChange={(event) => pick(event.target.value as ConditionMetric)}
          aria-label="Figure"
          className={`h-9 min-w-0 flex-1 rounded border border-oa-border bg-oa-card px-2 text-[14px] text-oa-fg ${FOCUS}`}
        >
          {/* A figure the stock has no value for is not offered; one saved earlier and no longer stored stays readable. */}
          {(option ? options : [...options, { metric: draft.metric } as MetricOption])
            .filter((item) => item.metric === draft.metric || !taken.has(item.metric))
            .map((item) => (
              <option key={item.metric} value={item.metric}>
                {METRICS[item.metric].label}
              </option>
            ))}
        </select>
        {spec.ops.length > 1 ? (
          <span role="radiogroup" aria-label="Above or below" className="inline-flex h-9 shrink-0 overflow-hidden rounded border border-oa-border">
            {(["above", "below"] as const).map((op) => (
              <button
                key={op}
                type="button"
                role="radio"
                aria-checked={draft.op === op}
                aria-label={op}
                onClick={() => flip(op)}
                className={`oa-mono w-8 text-[14px] ${FOCUS} ${draft.op === op ? "bg-[color-mix(in_srgb,var(--oa-primary)_14%,transparent)] font-medium text-oa-fg" : "bg-oa-card text-oa-muted-fg hover:text-oa-fg"}`}
              >
                {op === "above" ? ">" : "<"}
              </button>
            ))}
          </span>
        ) : (
          <span className="oa-mono inline-flex h-9 w-8 shrink-0 items-center justify-center text-[14px] text-oa-muted-fg" aria-label="at least">
            ≥
          </span>
        )}
        <span className={`inline-flex h-9 w-[5.5rem] shrink-0 items-center rounded border bg-oa-card px-2 ${valid ? "border-oa-border" : "border-signal-bearish"}`}>
          {spec.unit === "usd" ? <span className="oa-mono text-[14px] text-oa-muted-fg">$</span> : null}
          <input
            value={draft.text}
            inputMode="decimal"
            aria-label={`${spec.label} line`}
            aria-invalid={!valid}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
            className="oa-mono w-full min-w-0 bg-transparent text-right text-[14px] tabular-nums text-oa-fg outline-none"
          />
          {spec.unit === "pct" ? <span className="oa-mono text-[14px] text-oa-muted-fg">%</span> : null}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the ${spec.label.toLowerCase()} line`}
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded text-[18px] leading-none text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}
        >
          ×
        </button>
      </div>
      {option ? (
        <div className="flex items-start gap-2.5 pl-0.5" title={`${spec.about} ${option.source}, ${option.asOf}.`}>
          <span className="oa-mono shrink-0 text-[12.5px] leading-[18px] tabular-nums text-oa-muted-fg">
            now <span className={holds === false ? "text-signal-bearish" : "text-oa-fg"}>{valid ? figureText(draft.metric, option.now, value) : formatValue(draft.metric, option.now)}</span>
          </span>
          {valid ? <ConditionBar metric={draft.metric} now={option.now} line={value} holds={holds !== false} className="min-w-[4rem] flex-1 pt-[6px]" /> : null}
        </div>
      ) : null}
    </li>
  );
}

/* ── the picker ─────────────────────────────────────────────────────────── */

type MenuState = { status: "loading" } | { status: "ready"; menu: ConditionMenu } | { status: "failed" };

/**
 * "Holds if…": up to two measurable lines on a reason, from the figures we store for this stock, each prefilled from
 * the stock's own value and shown against it on a small bar. The drafts live in the editor; this only edits them.
 */
export function ConditionsPicker({ instrumentId, drafts, onChange }: { instrumentId: string; drafts: DraftCondition[]; onChange: (next: DraftCondition[]) => void }) {
  const [state, setState] = useState<MenuState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fetch(`/api/thesis/conditions?id=${encodeURIComponent(instrumentId)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<ConditionMenu>) : null))
      .then((menu) => {
        if (live) setState(menu ? { status: "ready", menu } : { status: "failed" });
      })
      .catch(() => {
        if (live) setState({ status: "failed" });
      });
    return () => {
      live = false;
    };
  }, [instrumentId]);

  // Only US stocks have the figures; a stock with none says nothing (owner rule: no card without data).
  const options = state.status === "ready" ? state.menu.metrics : [];
  // A failed read still shows saved lines, so they can be read and removed; it only cannot offer new ones.
  if (drafts.length === 0 && (state.status === "failed" || (state.status === "ready" && options.length === 0))) return null;

  const taken = new Set(drafts.map((draft) => draft.metric));
  const next = options.find((option) => !taken.has(option.metric)) ?? null;
  const add = () => {
    if (!next) return;
    const op = METRICS[next.metric].defaultOp;
    onChange([...drafts, { metric: next.metric, op, text: next.prefill[op] !== undefined ? String(next.prefill[op]) : "" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <span className="text-[13px] text-oa-muted-fg">Holds if…</span>
        {drafts.length < MAX_CONDITIONS && next ? (
          <button type="button" onClick={add} className={`inline-flex h-9 items-center rounded px-1 text-[13.5px] font-medium text-oa-primary hover:underline ${FOCUS}`}>
            {drafts.length === 0 ? "Add a line" : "Add another"}
          </button>
        ) : null}
      </div>
      {state.status === "loading" && drafts.length === 0 ? null : drafts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <ConditionRow
              key={`${index}:${draft.metric}`}
              draft={draft}
              options={options}
              taken={taken}
              onChange={(changed) => onChange(drafts.map((item, at) => (at === index ? changed : item)))}
              onRemove={() => onChange(drafts.filter((_, at) => at !== index))}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
