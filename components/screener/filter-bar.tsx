"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { LockCard, ProMark } from "@/components/oa/gate";
import { Menu, MenuCheck, MenuLabel } from "@/components/screener/menu";
import { CONTROL } from "@/components/screener/controls";
import type { Plan } from "@/lib/entitlements";
import { trackScreenerFilterApplied } from "@/lib/product-analytics";
import {
  ALL_COLUMN_IDS,
  ZONE_COLUMN_IDS,
  CALL_WORDS,
  CAP_TIERS,
  EMPTY_FILTERS,
  FIELD_BY_ID,
  FIELD_GROUPS,
  MAX_COLUMNS,
  NUMERIC_FIELDS,
  TEXT_COLUMNS,
  ZONES,
  countActiveFilters,
  viewHref,
  type CallWord,
  type CapTier,
  type NumericField,
  type Range,
  type ScreenerFilters,
  type ScreenerView,
  type Zone,
} from "@/lib/screener-shared";

/**
 * The screener's controls. Every change is written to the URL, the server
 * re-runs the screen, and the link in the address bar is the screen.
 */

export type SectorOption = { slug: string; name: string; count: number };

type Props = {
  view: ScreenerView;
  sectors: SectorOption[];
  /** Which numeric fields the snapshot actually carries. */
  availableFields: string[];
  capCounts: Partial<Record<CapTier, number>>;
  plan: Plan;
  canCallFilters: boolean;
  trialEligible: boolean;
};

const UNIT_SUFFIX: Record<NumericField["unit"], string> = {
  pct: "%",
  signed_pct: "%",
  multiple: "",
  price: "$",
  money: "$B",
  number: "",
  count_change: "",
  days: "d",
  score: "",
};

/** Market cap and net cash are typed in billions; everything else in its own unit. */
function toInput(field: NumericField, value: number | undefined): string {
  if (value === undefined) return "";
  return String(field.unit === "money" ? Math.round((value / 1e9) * 1000) / 1000 : value);
}

function fromInput(field: NumericField, text: string): number | undefined {
  const trimmed = text.trim().replace(/[$,%×x\s]/gi, "");
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  return field.unit === "money" ? value * 1e9 : value;
}

function toggle<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((entry) => entry !== item) : [...items, item];
}

function RangeChip({
  field,
  range,
  onChange,
  onRemove,
  autoFocus,
}: {
  field: NumericField;
  range: Range;
  onChange: (range: Range) => void;
  onRemove: () => void;
  autoFocus: boolean;
}) {
  const [min, setMin] = React.useState(toInput(field, range.min));
  const [max, setMax] = React.useState(toInput(field, range.max));
  React.useEffect(() => {
    setMin(toInput(field, range.min));
    setMax(toInput(field, range.max));
  }, [field, range.min, range.max]);

  function commit() {
    const next: Range = {};
    const low = fromInput(field, min);
    const high = fromInput(field, max);
    if (low !== undefined) next.min = low;
    if (high !== undefined) next.max = high;
    if (next.min === range.min && next.max === range.max) return;
    onChange(next);
  }

  const input =
    "oa-mono h-6 w-[4.25rem] rounded border border-oa-border bg-oa-page px-1.5 text-right text-[12.5px] tabular-nums text-oa-fg outline-none placeholder:text-oa-muted-fg/60 focus:border-oa-primary";
  const suffix = UNIT_SUFFIX[field.unit];
  return (
    <div
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-oa-fg/70 bg-oa-card pl-2.5 pr-1 text-[13px] text-oa-fg"
      title={field.label}
    >
      <span className="whitespace-nowrap font-medium">{field.short}</span>
      <input
        aria-label={`${field.label}, at least`}
        inputMode="decimal"
        placeholder="min"
        value={min}
        autoFocus={autoFocus}
        onChange={(event) => setMin(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className={input}
      />
      <span className="text-oa-muted-fg">to</span>
      <input
        aria-label={`${field.label}, at most`}
        inputMode="decimal"
        placeholder="max"
        value={max}
        onChange={(event) => setMax(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        className={input}
      />
      {suffix ? <span className="oa-mono text-[11.5px] text-oa-muted-fg">{suffix}</span> : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove the ${field.short} filter`}
        className="flex size-6 items-center justify-center rounded text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}

export function FilterBar({ view, sectors, availableFields, capCounts, plan, canCallFilters, trialEligible }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const filters = view.filters;

  // Fields the person picked but has not given a bound yet; they are not in the URL until they have one.
  const [drafts, setDrafts] = React.useState<string[]>([]);
  const [focusField, setFocusField] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState(filters.q);
  const [fieldSearch, setFieldSearch] = React.useState("");
  const typing = React.useRef(false);
  // Phone: the filter menus fold behind one button so the results start sooner. Open once anything is set.
  const [filtersOpen, setFiltersOpen] = React.useState(countActiveFilters(filters) - (filters.q ? 1 : 0) > 0);

  React.useEffect(() => {
    if (!typing.current) setQuery(filters.q);
  }, [filters.q]);

  const go = React.useCallback(
    (next: ScreenerView) => {
      startTransition(() => {
        router.replace(viewHref(next), { scroll: false });
      });
    },
    [router],
  );

  const setFilters = React.useCallback(
    (patch: Partial<ScreenerFilters>) => {
      const next = { ...filters, ...patch };
      // Which kinds of filter changed (range fields by id), never the typed search text.
      const fields = Object.keys(patch).flatMap((key) =>
        key === "ranges" && patch.ranges ? Object.keys(patch.ranges).map((id) => `range:${id}`) : key === "q" ? ["search"] : [key],
      );
      trackScreenerFilterApplied({ fields, active_count: countActiveFilters(next), preset: view.preset ?? null });
      go({ ...view, preset: null, filters: next });
    },
    [go, view, filters],
  );

  // Debounced text search.
  React.useEffect(() => {
    if (query.trim() === filters.q) return;
    const timer = window.setTimeout(() => {
      typing.current = false;
      setFilters({ q: query.trim() });
    }, 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const available = React.useMemo(() => new Set(availableFields), [availableFields]);
  const activeRangeIds = Object.keys(filters.ranges);
  const shownRangeIds = [...activeRangeIds, ...drafts.filter((id) => !activeRangeIds.includes(id))];
  const total = countActiveFilters(filters);

  function setRange(id: string, range: Range) {
    const ranges = { ...filters.ranges };
    if (range.min === undefined && range.max === undefined) {
      delete ranges[id];
      if (!drafts.includes(id)) setDrafts((current) => [...current, id]);
    } else {
      ranges[id] = range;
      setDrafts((current) => current.filter((entry) => entry !== id));
    }
    setFilters({ ranges });
  }

  function removeRange(id: string) {
    setDrafts((current) => current.filter((entry) => entry !== id));
    if (filters.ranges[id]) {
      const ranges = { ...filters.ranges };
      delete ranges[id];
      setFilters({ ranges });
    }
  }

  function clearAll() {
    setDrafts([]);
    setQuery("");
    go({ ...view, preset: null, filters: EMPTY_FILTERS });
  }

  const fieldMatches = (field: NumericField) => {
    const text = fieldSearch.trim().toLowerCase();
    return !text || `${field.short} ${field.label} ${field.group}`.toLowerCase().includes(text);
  };

  return (
    <div className="flex flex-col gap-2.5" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-0 sm:max-w-[15rem] sm:basis-auto">
          <span className="sr-only">Search by ticker, company or industry</span>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-oa-muted-fg">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input
            type="search"
            value={query}
            placeholder="Ticker, company or industry"
            onChange={(event) => {
              typing.current = true;
              setQuery(event.target.value);
            }}
            className="h-10 w-full rounded-md border border-oa-border bg-oa-card pl-8 pr-2.5 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary sm:h-8"
          />
        </label>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
          className={`${CONTROL} !h-10 shrink-0 sm:hidden ${filtersOpen ? "border-oa-fg" : ""}`}
        >
          Filters
          {total - (filters.q ? 1 : 0) > 0 ? <span className="oa-mono text-[12.5px] text-oa-primary">{total - (filters.q ? 1 : 0)}</span> : null}
        </button>

        <div className={`${filtersOpen ? "flex" : "hidden"} basis-full flex-wrap items-center gap-2 max-sm:[&_button]:h-10 sm:contents`}>

        <Menu
          label={
            <>
              Sector
              {filters.sectors.length ? <span className="oa-mono text-[11.5px] text-oa-primary">{filters.sectors.length}</span> : null}
            </>
          }
          active={filters.sectors.length > 0}
        >
          <div className="py-1.5" role="menu">
            {sectors.map((sector) => (
              <MenuCheck
                key={sector.slug}
                checked={filters.sectors.includes(sector.slug)}
                onChange={() => setFilters({ sectors: toggle(filters.sectors, sector.slug) })}
                hint={sector.count}
              >
                {sector.name}
              </MenuCheck>
            ))}
          </div>
        </Menu>

        <Menu
          label={
            <>
              Size
              {filters.caps.length ? <span className="oa-mono text-[11.5px] text-oa-primary">{filters.caps.length}</span> : null}
            </>
          }
          active={filters.caps.length > 0}
          width="w-60"
        >
          <div className="py-1.5" role="menu">
            {CAP_TIERS.map((tier) => (
              <MenuCheck
                key={tier.id}
                checked={filters.caps.includes(tier.id)}
                onChange={() => setFilters({ caps: toggle(filters.caps, tier.id) })}
                hint={capCounts[tier.id] ?? 0}
              >
                {tier.label} <span className="text-oa-muted-fg">{tier.hint}</span>
              </MenuCheck>
            ))}
          </div>
        </Menu>

        <Menu
          label={
            <>
              Our call
              {canCallFilters ? (
                filters.calls.length + filters.zones.length > 0 ? (
                  <span className="oa-mono text-[11.5px] text-oa-primary">{filters.calls.length + filters.zones.length}</span>
                ) : null
              ) : (
                <ProMark />
              )}
            </>
          }
          active={canCallFilters && filters.calls.length + filters.zones.length > 0}
          width={canCallFilters ? "w-60" : "w-[22rem]"}
        >
          {canCallFilters ? (
            <div className="py-1.5" role="menu">
              <MenuLabel>Call</MenuLabel>
              {CALL_WORDS.map((word: CallWord) => (
                <MenuCheck key={word} checked={filters.calls.includes(word)} onChange={() => setFilters({ calls: toggle(filters.calls, word) })}>
                  {word}
                </MenuCheck>
              ))}
              <MenuLabel>Price against our zones</MenuLabel>
              {ZONES.map((zone: { id: Zone; label: string }) => (
                <MenuCheck key={zone.id} checked={filters.zones.includes(zone.id)} onChange={() => setFilters({ zones: toggle(filters.zones, zone.id) })}>
                  {zone.label}
                </MenuCheck>
              ))}
            </div>
          ) : (
            <div className="p-2">
              <LockCard feature="screener_call_filters" plan={plan} trialEligible={trialEligible} className="!flex-col !items-start border-0 bg-transparent !p-2" />
            </div>
          )}
        </Menu>

        <Menu label={<>+ Filter</>} width="w-72">
          {(close) => (
            <div>
              <div className="sticky top-0 border-b border-oa-border bg-oa-card p-2">
                <input
                  autoFocus
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  placeholder="Find a metric"
                  className="h-7 w-full rounded border border-oa-border bg-oa-page px-2 text-[13px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary"
                />
              </div>
              <div className="pb-1.5">
                {FIELD_GROUPS.map((group) => {
                  const fields = NUMERIC_FIELDS.filter((field) => field.group === group && available.has(field.id) && fieldMatches(field));
                  if (fields.length === 0) return null;
                  return (
                    <div key={group}>
                      <MenuLabel>{group}</MenuLabel>
                      {fields.map((field) => {
                        const locked = Boolean(field.call) && !canCallFilters;
                        const on = shownRangeIds.includes(field.id);
                        return (
                          <button
                            key={field.id}
                            type="button"
                            disabled={locked || on}
                            title={field.label}
                            onClick={() => {
                              setDrafts((current) => [...current, field.id]);
                              setFocusField(field.id);
                              setFieldSearch("");
                              close();
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13.5px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
                          >
                            <span className="min-w-0 truncate">{field.label.split(":")[0]!.split("(")[0]!.trim()}</span>
                            {locked ? <ProMark /> : <span className="oa-mono shrink-0 text-[11px] text-oa-muted-fg">{field.short}</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Menu>

        {total > 0 || drafts.length > 0 ? (
          <button type="button" onClick={clearAll} className="text-[13px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            Clear all
          </button>
        ) : null}

        <span
          aria-hidden={!pending}
          className={`oa-mono text-[11.5px] text-oa-muted-fg transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}
        >
          screening…
        </span>
        </div>
      </div>

      {shownRangeIds.length > 0 ? (
        <div className={`${filtersOpen ? "flex" : "hidden"} flex-wrap items-center gap-2 sm:flex`}>
          {shownRangeIds.map((id) => {
            const field = FIELD_BY_ID.get(id);
            if (!field) return null;
            return (
              <RangeChip
                key={id}
                field={field}
                range={filters.ranges[id] ?? {}}
                autoFocus={focusField === id}
                onChange={(range) => setRange(id, range)}
                onRemove={() => removeRange(id)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ── Column picker ─────────────────────────────────────────────────────── */

export function ColumnPicker({ view, availableFields, zonesEverywhere }: { view: ScreenerView; availableFields: string[]; zonesEverywhere: boolean }) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const available = React.useMemo(() => new Set([...availableFields, ...TEXT_COLUMNS.map((column) => column.id)]), [availableFields]);
  const columns = view.columns;
  const full = columns.length >= MAX_COLUMNS;

  function set(next: string[]) {
    // Keep the catalogue's order so columns do not jump around as they are ticked.
    const ordered = next.length > 0 ? next : columns;
    startTransition(() => {
      router.replace(viewHref({ ...view, columns: ordered }), { scroll: false });
    });
  }

  const groups = FIELD_GROUPS.map((group) => ({
    group,
    items: [
      ...TEXT_COLUMNS.filter((column) => column.group === group).map((column) => ({ id: column.id, label: column.label })),
      ...NUMERIC_FIELDS.filter((field) => field.group === group).map((field) => ({ id: field.id, label: field.label.split(":")[0]!.split("(")[0]!.trim() })),
    ].filter((item) => available.has(item.id) && ALL_COLUMN_IDS.includes(item.id)),
  })).filter((entry) => entry.items.length > 0);

  return (
    <Menu
      align="right"
      width="w-72"
      label={
        <>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3.5v9M8 3.5v9M13 3.5v9" />
          </svg>
          <span className="max-sm:sr-only">Columns</span>
          <span className="oa-mono text-[12.5px] text-oa-muted-fg">{columns.length}</span>
        </>
      }
    >
      <div className="pb-1.5" role="menu">
        <p className="border-b border-oa-border px-3 py-2 text-[12.5px] leading-4 text-oa-muted-fg">
          Up to {MAX_COLUMNS} columns. The choice is part of the link.
        </p>
        {groups.map(({ group, items }) => (
          <div key={group}>
            <MenuLabel>{group}</MenuLabel>
            {items.map((item) => {
              const on = columns.includes(item.id);
              const partial = ZONE_COLUMN_IDS.has(item.id) && !zonesEverywhere;
              return (
                <MenuCheck
                  key={item.id}
                  checked={on}
                  disabled={(!on && full) || (on && columns.length === 1)}
                  onChange={(next) => set(next ? [...columns, item.id] : columns.filter((id) => id !== item.id))}
                  hint={partial ? "covered stocks" : undefined}
                >
                  {item.label}
                </MenuCheck>
              );
            })}
          </div>
        ))}
      </div>
    </Menu>
  );
}

/** A plain link styled as a control, for server components that sit beside the menus. */
export function ControlLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={CONTROL}>
      {children}
    </a>
  );
}
