"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { IdeaCard, IdeaLens } from "@/components/radar-next/types";

function scoreColor(v: number | null): string {
  if (v === null) return "var(--rn-muted)";
  if (v >= 70) return "var(--rn-bull)";
  if (v >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function currencySymbol(code: string | null): string {
  if (code === "INR") return "₹";
  if (code === "USD") return "$";
  return code ?? "";
}

function fmtPrice(price: number | null, currency: string | null): string | null {
  if (price === null) return null;
  return `${currencySymbol(currency)}${price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function IdeaTile({ idea }: { idea: IdeaCard }) {
  const price = fmtPrice(idea.price, idea.currency);
  const chg = idea.dayChangePct;
  const up = (chg ?? 0) >= 0;
  const moveColor = chg === null ? "var(--rn-muted)" : up ? "var(--rn-bull)" : "var(--rn-bear)";
  const target = idea.targetUpsidePct;

  return (
    <Link href={idea.href} className="rn-card rn-card--hover flex flex-col gap-2.5 p-3.5 no-underline">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={idea.ticker} market={idea.market} size={28} className="shrink-0" />
          <div className="min-w-0">
            <span className="block text-[14px] font-bold leading-tight tracking-tight text-[var(--rn-ink)]">
              {idea.ticker}
            </span>
            {idea.name ? (
              <span className="block max-w-[10rem] truncate text-[11px] leading-tight text-[var(--rn-muted)]">
                {idea.name}
              </span>
            ) : null}
          </div>
        </div>
        {idea.score !== null ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
            style={{ color: scoreColor(idea.score), background: `color-mix(in srgb, ${scoreColor(idea.score)} 12%, transparent)` }}
          >
            <span className="font-medium opacity-70">score</span>
            {Math.round(idea.score)}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="rn-stat text-[19px] font-extrabold text-[var(--rn-ink)]">{price ?? "-"}</span>
          {chg !== null ? (
            <span
              className="flex items-baseline gap-0.5 font-mono text-[11.5px] font-bold tabular-nums"
              style={{ color: moveColor }}
            >
              <span aria-hidden className="text-[8px]">
                {up ? "▲" : "▼"}
              </span>
              {Math.abs(chg).toFixed(2)}%
            </span>
          ) : null}
        </div>
        {target !== null ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
            style={{
              color: target >= 0 ? "var(--rn-bull)" : "var(--rn-bear)",
              background: `color-mix(in srgb, ${target >= 0 ? "var(--rn-bull)" : "var(--rn-bear)"} 12%, transparent)`,
            }}
          >
            <span className="font-medium opacity-70">target</span>
            {target >= 0 ? "+" : ""}
            {Math.round(target)}%
          </span>
        ) : null}
      </div>

      {idea.reason ? (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--rn-muted)]">{idea.reason}</p>
      ) : null}

      {idea.tag ? (
        <span className="mt-auto inline-flex w-fit rounded-full px-2 py-0.5 font-mono text-[9.5px] font-medium text-[var(--rn-muted)] shadow-[inset_0_0_0_1px_var(--rn-line)]">
          {idea.tag}
        </span>
      ) : null}
    </Link>
  );
}

const LENSES: Array<{ id: IdeaLens; label: string }> = [
  { id: "fits", label: "fits your book" },
  { id: "top", label: "top rated" },
  { id: "unusual", label: "unusual moves" },
];

export function Ideas({
  fits,
  top,
  unusual,
}: {
  fits: IdeaCard[];
  top: IdeaCard[];
  unusual: IdeaCard[];
}) {
  const byLens: Record<IdeaLens, IdeaCard[]> = { fits, top, unusual };
  const available = LENSES.filter((l) => byLens[l.id].length > 0);
  const [lens, setLens] = useState<IdeaLens>(available[0]?.id ?? "fits");

  if (available.length === 0) return null;
  const ideas = byLens[lens] ?? [];

  return (
    <section aria-labelledby="rn-ideas">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="rn-ideas" className="rn-kick">
          // ideas · stocks to buy next
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {available.map((l) => {
            const active = lens === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLens(l.id)}
                className="rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-colors"
                style={
                  active
                    ? { color: "var(--rn-ink)", background: "var(--rn-card-2)", boxShadow: "inset 0 0 0 1px var(--rn-line)" }
                    : { color: "var(--rn-muted)" }
                }
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <IdeaTile key={`${idea.market}-${idea.ticker}`} idea={idea} />
        ))}
      </div>
    </section>
  );
}
