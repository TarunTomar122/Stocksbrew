"use client";

import { useId, useState } from "react";

import { SectorIcon } from "@/components/oa/sector-icon";
import { FOCUS, NUM } from "@/components/portfolio/parts";
import {
  activeCount,
  anyOptions,
  CALL_CHOICES,
  NO_FILTERS,
  SIZE_CHOICES,
  TYPE_CHOICES,
  type Choice,
  type FilterOptions,
  type PositionFilters,
} from "@/lib/portfolio-filters";

/**
 * The filter bar over the Holdings and Watching lists: one Filter button, the count of rows showing ("12 of 41") and
 * Clear all, with the choices in a panel under it. Only filters that split the rows are offered (lib/portfolio-filters).
 * On a phone the bar sticks under the top bar while its list scrolls by; the open panel scrolls away with the page.
 */

function chipClass(active: boolean): string {
  return `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13.5px] transition-colors ${FOCUS} ${
    active
      ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-accent font-medium text-oa-fg"
      : "border-oa-border bg-oa-card text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
  }`;
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={id}>
      <span id={id} className="oa-caption">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={chipClass(active)}>
      {children}
      <span className={`${NUM} text-[12px] text-oa-muted-fg`}>{count}</span>
    </button>
  );
}

function FunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" />
    </svg>
  );
}

/** What is on, as short words for the closed bar: "Technology, Buy more". */
function summary(filters: PositionFilters, options: FilterOptions): string {
  const words: string[] = [];
  const label = <T extends string>(choices: Array<Choice<T>>, value: T) => choices.find((choice) => choice.value === value)?.label ?? value;
  for (const slug of filters.sectors) words.push(label(options.sectors, slug));
  for (const call of filters.calls) words.push(label(options.calls, call));
  for (const size of filters.sizes) words.push(`${label(options.sizes, size)} cap`);
  for (const type of filters.types) words.push(label(options.types, type));
  if (filters.near) words.push("Near our level");
  if (filters.reports) words.push("Reports in 14 days");
  if (filters.moving) words.push("Moving today");
  return words.join(", ");
}

export function PositionFilterBar({
  filters,
  options,
  onChange,
  shown,
  total,
  noun,
}: {
  /** The filters in force (already cut to what `options` offers). */
  filters: PositionFilters;
  options: FilterOptions;
  onChange: (next: PositionFilters) => void;
  shown: number;
  total: number;
  /** "holdings" or "stocks", for the count's screen-reader words. */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!anyOptions(options)) return null;
  const active = activeCount(filters);
  const on = summary(filters, options);
  return (
    <>
      <div className="sticky top-[52px] z-20 -mx-2 border-b border-oa-border bg-oa-page px-2 py-1.5 sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex min-h-8 items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className={`${chipClass(open || active > 0)} !px-3`}
          >
            <FunnelIcon />
            Filter
            {active > 0 ? (
              <span className={`${NUM} inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-oa-primary px-1 text-[11px] font-medium text-oa-primary-fg`}>
                {active}
              </span>
            ) : null}
          </button>
          {on ? (
            <span className="min-w-0 flex-1 truncate text-[13px] text-oa-muted-fg" title={on}>
              {on}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <span className={`${NUM} shrink-0 text-[13px] text-oa-muted-fg`} aria-live="polite">
            {active > 0 ? (
              <>
                <span className="text-oa-fg">{shown}</span> of {total}
                <span className="sr-only"> {noun} showing</span>
              </>
            ) : (
              `${total} ${total === 1 ? noun.replace(/s$/, "") : noun}`
            )}
          </span>
          {active > 0 ? (
            <button
              type="button"
              onClick={() => onChange(NO_FILTERS)}
              className={`h-8 shrink-0 rounded px-1.5 text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-current ${FOCUS}`}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div id={panelId} className="oa-surface flex flex-col gap-3 border border-oa-border bg-oa-card px-3 py-3">
          {options.sectors.length > 0 ? (
            <Group label="Sector">
              {options.sectors.map((sector) => (
                <ChipButton
                  key={sector.value}
                  active={filters.sectors.includes(sector.value)}
                  count={sector.count}
                  onClick={() => onChange({ ...filters, sectors: toggle(filters.sectors, sector.value) })}
                >
                  <SectorIcon id={sector.label} size={15} className="shrink-0" />
                  {sector.label}
                </ChipButton>
              ))}
            </Group>
          ) : null}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {options.calls.length > 0 ? (
              <Group label="Our call">
                {options.calls.map((call) => (
                  <ChipButton
                    key={call.value}
                    active={filters.calls.includes(call.value)}
                    count={call.count}
                    onClick={() => onChange({ ...filters, calls: toggle(filters.calls, call.value) })}
                  >
                    <span className={call.value === "buy" ? "text-signal-bullish" : call.value === "sell" ? "text-signal-bearish" : undefined}>
                      {CALL_CHOICES.find((choice) => choice.value === call.value)?.label}
                    </span>
                  </ChipButton>
                ))}
              </Group>
            ) : null}
            {options.near > 0 || options.reports > 0 || options.moving > 0 ? (
              <Group label="Show only">
                {options.near > 0 ? (
                  <ChipButton active={filters.near} count={options.near} onClick={() => onChange({ ...filters, near: !filters.near })}>
                    Near our level
                  </ChipButton>
                ) : null}
                {options.reports > 0 ? (
                  <ChipButton active={filters.reports} count={options.reports} onClick={() => onChange({ ...filters, reports: !filters.reports })}>
                    Reports in 14 days
                  </ChipButton>
                ) : null}
                {options.moving > 0 ? (
                  <ChipButton active={filters.moving} count={options.moving} onClick={() => onChange({ ...filters, moving: !filters.moving })}>
                    Moving today
                  </ChipButton>
                ) : null}
              </Group>
            ) : null}
            {options.sizes.length > 0 ? (
              <Group label="Company size">
                {options.sizes.map((size) => (
                  <ChipButton
                    key={size.value}
                    active={filters.sizes.includes(size.value)}
                    count={size.count}
                    onClick={() => onChange({ ...filters, sizes: toggle(filters.sizes, size.value) })}
                  >
                    {SIZE_CHOICES.find((choice) => choice.value === size.value)?.label}
                  </ChipButton>
                ))}
              </Group>
            ) : null}
            {options.types.length > 0 ? (
              <Group label="Kind">
                {options.types.map((type) => (
                  <ChipButton
                    key={type.value}
                    active={filters.types.includes(type.value)}
                    count={type.count}
                    onClick={() => onChange({ ...filters, types: toggle(filters.types, type.value) })}
                  >
                    {TYPE_CHOICES.find((choice) => choice.value === type.value)?.label}
                  </ChipButton>
                ))}
              </Group>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
