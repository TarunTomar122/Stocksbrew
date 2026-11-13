"use client";

import Link from "next/link";
import * as React from "react";

import { ProMark } from "@/components/oa/gate";
import { KindIcon, type KindIconName } from "@/components/oa/nav-icon";
import { SectorIcon } from "@/components/oa/sector-icon";

/**
 * The small pieces of the screener's plain-words box: the chips a sentence
 * turns into, and the examples under an empty box. Each chip looks like the
 * range chips beside it, so a sentence's screen reads and edits like any other.
 */

const CHIP = "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-oa-fg/70 bg-oa-card text-[13px] text-oa-fg";

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-6 shrink-0 items-center justify-center rounded text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent"
    >
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
      </svg>
    </button>
  );
}

/** A removable chip: a sector, a size, our call, a search word. */
export function TokenChip({ icon, children, removeLabel, onRemove }: { icon?: React.ReactNode; children: React.ReactNode; removeLabel: string; onRemove: () => void }) {
  return (
    <span className={`${CHIP} pl-2.5 pr-1`}>
      {icon}
      <span className="min-w-0 truncate whitespace-nowrap font-medium">{children}</span>
      <RemoveButton label={removeLabel} onClick={onRemove} />
    </span>
  );
}

/** The order the table is in. Tapping the words flips it; the cross goes back to biggest first. */
export function SortChip({ label, dir, onFlip, onRemove }: { label: string; dir: "asc" | "desc"; onFlip: () => void; onRemove: () => void }) {
  return (
    <span className={`${CHIP} pr-1`}>
      <button
        type="button"
        onClick={onFlip}
        title="Flip the order"
        className="inline-flex h-full min-w-0 items-center gap-1.5 rounded-l-md pl-2.5 font-medium outline-none hover:text-oa-primary focus-visible:underline"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-oa-primary">
          {dir === "asc" ? <path d="M8 13V3M4 7l4-4 4 4" /> : <path d="M8 3v10M4 9l4 4 4-4" />}
        </svg>
        <span className="min-w-0 truncate whitespace-nowrap">{label}</span>
      </button>
      <RemoveButton label="Go back to biggest first" onClick={onRemove} />
    </span>
  );
}

/** A part of the sentence that screens by our call, on a plan without it: named, locked, and one tap from what Pro is. */
export function LockedChip({ children }: { children: React.ReactNode }) {
  return (
    <Link
      prefetch={false}
      href="/pricing#screener_call_filters"
      title="Screening by our call is part of Pro"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] px-2.5 text-[13px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
    >
      <span className="whitespace-nowrap">{children}</span>
      <ProMark />
    </Link>
  );
}

/** Words we could not turn into a filter. When nothing at all could be read, it says the table stayed as it was. */
export function MissChip({ phrase, unchanged = false }: { phrase: string; unchanged?: boolean }) {
  return (
    <span className="inline-flex h-8 max-w-full items-center rounded-md border border-dashed border-oa-border px-2.5 text-[13px] text-oa-muted-fg">
      <span className="min-w-0 truncate">
        {unchanged ? "Table unchanged: couldn't map" : "Couldn't map"} “{phrase}”
      </span>
    </span>
  );
}

export type PlainExample = { text: string; icon: { kind: KindIconName } | { sector: string } };

/** What an empty box offers: real sentences, each one read fully by the rules (lib/screener-plain.test.ts). */
export const PLAIN_EXAMPLES: PlainExample[] = [
  { text: "Lowest P/E vs its history", icon: { kind: "tag" } },
  { text: "Cheap chips growing 20%+", icon: { sector: "Technology" } },
  { text: "Biggest companies down this year", icon: { kind: "movers" } },
  { text: "Small caps near a one-year low", icon: { kind: "target" } },
];

export function PlainExamples({ onPick, className = "" }: { onPick: (text: string) => void; className?: string }) {
  return (
    <div className={`flex-wrap items-center gap-2 ${className}`}>
      {PLAIN_EXAMPLES.map((example, index) => (
        <button
          key={example.text}
          type="button"
          // Keeps the box focused, so on a phone the examples do not vanish before the tap lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(example.text)}
          // Two on a phone, where the keyboard already takes half the screen.
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-oa-border bg-oa-card px-3 text-[13px] text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent max-sm:h-9 ${index >= 2 ? "max-sm:hidden" : ""}`}
        >
          <span className="shrink-0 text-oa-muted-fg">
            {"kind" in example.icon ? <KindIcon name={example.icon.kind} className="size-[14px]" /> : <SectorIcon id={example.icon.sector} size={14} />}
          </span>
          <span className="whitespace-nowrap">{example.text}</span>
        </button>
      ))}
    </div>
  );
}
