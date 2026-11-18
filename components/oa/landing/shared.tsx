import * as React from "react";

import { Reveal } from "@/components/reveal";
import { AppLink } from "@/components/oa/app-link";

/** Layout and type constants shared by every landing section. */
export const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6 xl:px-12";
export const H2 =
  "text-balance font-medium tracking-[-0.02em] text-oa-fg text-[30px] leading-[1.12] sm:text-[44px] sm:leading-[1.08]";
export const LEDE = "text-pretty mt-3 max-w-xl text-base leading-7 text-oa-muted-fg";
export const LABEL = "oa-caption";
/** Hover for a whole card that is a link: a slightly darker edge and a soft shadow, never a darker fill (owner, Nov 15:
 * the beige fill on hover was "too intense"). */
export const CARD_HOVER =
  "transition-[border-color,box-shadow] duration-200 hover:border-[color-mix(in_srgb,var(--oa-fg)_18%,transparent)] hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.22)] motion-reduce:transition-none";

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

/**
 * Section heading, centred, with an optional link under it. The title may carry a muted second half
 * (<Muted>followed all the way through.</Muted>), the one two-tone touch the council kept from tradytics (Nov 18). No line
 * under the title (owner rule 8): `lede` stays for the rare section that says something its content does not.
 */
export function SectionHead({
  title,
  lede,
  href,
  hrefLabel,
}: {
  title: React.ReactNode;
  lede?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <Reveal>
      <div className="mb-8 flex flex-col items-center gap-5 text-center sm:mb-10">
        <div className="max-w-3xl">
          <h2 className={H2}>{title}</h2>
          {lede ? <p className={`${LEDE} mx-auto`}>{lede}</p> : null}
        </div>
        {href && hrefLabel ? (
          <AppLink
            href={href}
            className="inline-flex h-10 w-fit shrink-0 items-center rounded-full border border-oa-border bg-oa-card px-4 text-[15px] font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
          >
            {/* No arrow: every section head carries one of these, and the same "→" on each read as repeated decoration (owner rule 1). */}
            {hrefLabel}
          </AppLink>
        ) : null}
      </div>
    </Reveal>
  );
}

/** A band's vertical rhythm: room for each section to read on its own, without a heading eating a third of the screen. */
export const BAND_PAD = "py-12 sm:py-[72px]";

/** The muted second half of a two-tone heading, on its own line from sm so a heading never splits mid-phrase. */
export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-oa-muted-fg sm:block">{children}</span>;
}

/**
 * One band of the page: a full-bleed hairline on top (none on the first), the content in the frame, and the frame's own
 * edges drawn as hairlines from xl, where the page is wider than the frame. Together they are the page's grid.
 */
export function Band({
  children,
  first = false,
  className = "",
  id,
}: {
  children: React.ReactNode;
  first?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${first ? "" : "border-t border-oa-border"}`}>
      <div className={`${FRAME} xl:border-x xl:border-oa-border ${className}`}>{children}</div>
    </section>
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
    <AppLink
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
    </AppLink>
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
