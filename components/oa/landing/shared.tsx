import * as React from "react";

import { Reveal } from "@/components/reveal";

/** Layout and type constants shared by every landing section. */
export const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";
export const H2 =
  "text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight";
export const LEDE = "text-pretty mt-3 max-w-xl text-base leading-7 text-oa-muted-fg";
export const LABEL = "oa-caption";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-05" -> "Nov 5". Parsed by hand so the server timezone cannot shift the day. */
export function fmtDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : "";
}

export function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function fmtPrice(price: number): string {
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** Disclosure filings report a bracket, never an exact amount. */
export function fmtAmountRange(low: number | null, high: number | null): string {
  if (low != null && high != null) return `${fmtMoneyShort(low)} to ${fmtMoneyShort(high)}`;
  if (low != null) return `${fmtMoneyShort(low)}+`;
  return "Amount not disclosed";
}

export function ChangeText({ pct, className = "" }: { pct: number; className?: string }) {
  const tone =
    pct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
  return <span className={`tabular-nums ${tone} ${className}`}>{fmtPct(pct)}</span>;
}

export function toneClass(tone: "up" | "down" | "flat"): string {
  if (tone === "up") return "text-emerald-700 dark:text-emerald-400";
  if (tone === "down") return "text-red-700 dark:text-red-400";
  return "text-oa-muted-fg";
}

/** Section heading with an optional supporting line and a right-aligned link. */
export function SectionHead({
  title,
  lede,
  href,
  hrefLabel,
  align = "left",
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  align?: "left" | "center";
}) {
  return (
    <Reveal>
      <div
        className={`mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between ${
          align === "center" ? "sm:justify-center sm:text-center" : ""
        }`}
      >
        <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
          <h2 className={H2}>{title}</h2>
          {lede ? <p className={`${LEDE} ${align === "center" ? "mx-auto" : ""}`}>{lede}</p> : null}
        </div>
        {href && hrefLabel ? (
          <a
            href={href}
            className="group/more inline-flex h-10 w-fit shrink-0 items-center gap-1.5 rounded-full border border-oa-border bg-oa-card px-4 text-[15px] font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
          >
            {hrefLabel}
            <span aria-hidden="true" className="transition-transform duration-200 group-hover/more:translate-x-0.5">
              →
            </span>
          </a>
        ) : null}
      </div>
    </Reveal>
  );
}

/** A full-bleed row inside a card inset: label block on the left, value block on the right. */
export function RowLink({
  href,
  label,
  value,
  external = false,
}: {
  href: string;
  label: React.ReactNode;
  value?: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3 text-[15px] leading-6 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
    >
      <span className="flex min-w-0 flex-col gap-0.5">{label}</span>
      {value !== undefined ? (
        <span className="flex flex-col items-end justify-start gap-0.5 whitespace-nowrap tabular-nums text-oa-muted-fg">
          {value}
        </span>
      ) : null}
    </a>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-3 text-[15px] leading-6 text-oa-muted-fg">{children}</p>;
}

/** Two letters for people who have no logo. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
