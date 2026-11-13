"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { LockCard, ProMark } from "@/components/oa/gate";
import { SectorIcon } from "@/components/oa/sector-icon";
import { Menu, MenuCheck, MenuLabel } from "@/components/screener/menu";
import { CONTROL } from "@/components/screener/controls";
import { LockedChip, MissChip, PlainExamples, SortChip, TokenChip } from "@/components/screener/plain-parts";
import { CALL_PLAIN } from "@/lib/plain-copy";
import type { Plan } from "@/lib/entitlements";
import { trackScreenerFilterApplied } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";
import {
  PLAIN_MAX_CHARS,
  PLAIN_SECTORS,
  chipName,
  cleanPlainScreen,
  hasName,
  isWholeRange,
  describeSort,
  looksLikeScreen,
  normalizePlain,
  parsePlainScreen,
  plainHasScreen,
  plainHref,
  plainView,
  withSaid,
  withoutCallParts,
  type PlainNote,
  type PlainReply,
  type PlainScreen,
} from "@/lib/screener-plain";
import {
  ALL_COLUMN_IDS,
  ZONE_COLUMN_IDS,
  CALL_WORDS,
  CAP_TIERS,
  DEFAULT_COLUMNS,
  DEFAULT_SORT,
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
import { AppLink } from "@/components/oa/app-link";

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
  /** The sentence this screen was made from (the URL's `say`), shown in the box and as "Understood" before the chips. */
  said?: string | null;
  /** The result count and table controls, at the end of the menus row. */
  right?: React.ReactNode;
};

/** Our zones in the call words (Buy more / Keep / Sell some), for chips. */
const ZONE_WORDS: Record<Zone, string> = { add: "At our buy-more price", between: "Between our prices", trim: "At our sell-some price" };

/** A sentence waiting for its reader across a sign-in reload. */
const PENDING_KEY = "screener-say-pending";

/** What the box read last, for the notes beside the chips: words it could not map, call parts the plan leaves out, and why the rest went unread. */
type Heard = { text: string; leftover: string[]; locked: string[]; note: PlainNote; applied: boolean; via: PlainReply["via"] };

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
      className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-oa-fg/70 bg-oa-card pl-2.5 pr-1 text-[13px] text-oa-fg"
      title={field.label}
    >
      <span className="min-w-0 truncate whitespace-nowrap font-medium">{chipName(field.id)}</span>
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
        className={`${input} shrink-0`}
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
        className={`${input} shrink-0`}
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

export function FilterBar({ view, sectors, availableFields, capCounts, plan, canCallFilters, trialEligible, said = null, right = null }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const filters = view.filters;

  // Fields the person picked but has not given a bound yet; they are not in the URL until they have one.
  const [drafts, setDrafts] = React.useState<string[]>([]);
  const [focusField, setFocusField] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState(said ?? filters.q);
  const [fieldSearch, setFieldSearch] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [heard, setHeard] = React.useState<Heard | null>(null);
  const typing = React.useRef(false);
  const box = React.useRef<HTMLInputElement>(null);
  // The newest submit: a slow model read must not land over a later one.
  const latest = React.useRef(0);
  // One reading of the box per keystroke, shared by everything below that needs it.
  const parsed = React.useMemo(() => parsePlainScreen(query), [query]);
  const screenMode = React.useMemo(() => looksLikeScreen(query, parsed), [query, parsed]);
  // Phone: the filter menus fold behind one button so the results start sooner. Open once anything is set.
  const [filtersOpen, setFiltersOpen] = React.useState(countActiveFilters(filters) - (filters.q ? 1 : 0) > 0);

  React.useEffect(() => {
    if (!typing.current) setQuery(said ?? filters.q);
  }, [said, filters.q]);

  // Back from signing in to have Ask read a sentence: read it now, once.
  React.useEffect(() => {
    if (plan === "anon") return;
    let pendingText: string | null = null;
    try {
      pendingText = window.sessionStorage.getItem(PENDING_KEY);
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // storage can be blocked; the person can press Enter again
    }
    if (pendingText) {
      setQuery(pendingText);
      void submit(pendingText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  // Edits to a sentence's chips keep the sentence in the link, so the box still says what was asked.
  const go = React.useCallback(
    (next: ScreenerView, keepSaid = true) => {
      startTransition(() => {
        router.replace(said && keepSaid ? plainHref(next, said) : viewHref(next), { scroll: false });
      });
    },
    [router, said],
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

  const available = React.useMemo(() => new Set(availableFields), [availableFields]);

  /** Back to the plain list: what clearing the box means once it held a sentence. */
  const resetScreen = React.useCallback(() => {
    setDrafts([]);
    setHeard(null);
    go({ ...view, preset: null, filters: EMPTY_FILTERS, sort: DEFAULT_SORT, columns: DEFAULT_COLUMNS }, false);
  }, [go, view]);

  // Names and tickers are searched as you type. A sentence waits for Enter, and so does anything typed over one.
  React.useEffect(() => {
    if (!typing.current) return;
    const text = query.trim();
    const sentence = text !== "" && screenMode;
    if (said && text) return;
    if (!said && !sentence && text === filters.q) return;
    if (sentence && !filters.q) return;
    const timer = window.setTimeout(() => {
      // Still typing a sentence: keep the box as it is while the stale name search clears.
      if (!sentence) typing.current = false;
      if (said) resetScreen();
      // A sentence on its way in: drop the half-typed name search so the table is not "nothing matches" meanwhile.
      else setFilters({ q: sentence ? "" : text });
    }, 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /** Run a reading: the screen's link with the sentence, pushed so Back returns to the screen before it. */
  function applyPlain(text: string, raw: PlainScreen, via: PlainReply["via"], note: PlainNote) {
    let screen = cleanPlainScreen(raw, { available });
    const locked: string[] = [];
    if (!canCallFilters) {
      const out = withoutCallParts(screen);
      screen = out.plain;
      locked.push(...out.dropped.calls.map((word) => CALL_PLAIN[word]), ...out.dropped.zones.map((id) => ZONE_WORDS[id]));
    }
    const applied = plainHasScreen(screen);
    setHeard({ text, leftover: screen.leftover, locked, note, applied, via });
    if (!applied) return;
    // The sentence reads from its start again, and a phone's keyboard gets out of the way of the table.
    if (box.current) {
      box.current.scrollLeft = 0;
      if (window.matchMedia("(max-width: 639px)").matches) box.current.blur();
    }
    setDrafts([]);
    trackScreenerFilterApplied({ fields: [`plain:${via}`, ...Object.keys(screen.filters.ranges).map((id) => `range:${id}`)], active_count: countActiveFilters(screen.filters), preset: null });
    const href = plainHref(plainView(screen, view), text);
    const here = `${window.location.pathname}${window.location.search}`;
    startTransition(() => {
      // The same sentence again is the same page: no second Back step for it.
      if (href === here) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  async function submit(raw: string) {
    const text = raw.replace(/\s+/g, " ").trim().slice(0, PLAIN_MAX_CHARS);
    typing.current = false;
    const ticket = ++latest.current;
    if (!text) {
      if (said || filters.q) resetScreen();
      return;
    }
    const rules = parsePlainScreen(text);
    if (!looksLikeScreen(text, rules) && !plainHasScreen(rules)) {
      // A name or a ticker: the search the box always was.
      setHeard(null);
      go({ ...view, preset: null, filters: said ? { ...EMPTY_FILTERS, q: text } : { ...filters, q: text }, ...(said ? { sort: DEFAULT_SORT, columns: DEFAULT_COLUMNS } : {}) }, false);
      return;
    }
    if (rules.leftover.length === 0 || plan === "anon") {
      applyPlain(text, rules, "rules", rules.leftover.length > 0 ? "sign_in" : null);
      return;
    }
    setReading(true);
    try {
      const res = await fetch("/api/screener/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = res.ok ? ((await res.json()) as PlainReply) : null;
      if (ticket !== latest.current) return;
      if (data?.screen) applyPlain(text, data.screen, data.via, data.note);
      else applyPlain(text, rules, "rules", "unavailable");
    } catch {
      if (ticket === latest.current) applyPlain(text, rules, "rules", "unavailable");
    } finally {
      if (ticket === latest.current) setReading(false);
    }
  }

  async function signInToRead() {
    try {
      if (heard?.text) window.sessionStorage.setItem(PENDING_KEY, heard.text);
    } catch {
      // without storage the sentence is still in the link when part of it ran
    }
    try {
      await signInWithGoogle({ surface: "paywall" });
      window.location.reload();
    } catch {
      // the sign-in sheet reports its own errors
    }
  }
  const activeRangeIds = Object.keys(filters.ranges);
  const shownRangeIds = [...activeRangeIds, ...drafts.filter((id) => !activeRangeIds.includes(id))];
  const total = countActiveFilters(filters);
  // The chips read as what the sentence was understood as while the box still holds that sentence.
  const understood = Boolean(said) && (total > 0 || view.sort.id !== DEFAULT_SORT.id || view.sort.dir !== DEFAULT_SORT.dir);
  const customSort = view.sort.id !== DEFAULT_SORT.id || view.sort.dir !== DEFAULT_SORT.dir;
  const heardHere = heard && normalizePlain(heard.text) === normalizePlain(query) ? heard : null;
  const notes = heardHere && (heardHere.leftover.length > 0 || heardHere.locked.length > 0 || heardHere.note === "limit") ? heardHere : null;
  // Words the rules will leave over go to Ask on Enter, which costs a question: say so before, not after.
  const needsAsk = plan !== "anon" && screenMode && parsed.leftover.length > 0 && normalizePlain(query) !== normalizePlain(said ?? "") && !heardHere;
  const showEnter = !reading && !pending && screenMode && normalizePlain(query) !== normalizePlain(said ?? "") && !heardHere;
  // Part of this screen is the model's reading, not a fixed rule: say whose reading it is.
  const askRead = heardHere !== null && heardHere.via !== "rules";

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
    setHeard(null);
    setQuery("");
    go({ ...view, preset: null, filters: EMPTY_FILTERS }, false);
  }

  const fieldMatches = (field: NumericField) => {
    const text = fieldSearch.trim().toLowerCase();
    return !text || `${field.short} ${field.label} ${field.group}`.toLowerCase().includes(text);
  };

  return (
    <div className="flex flex-col gap-2.5" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-0 sm:basis-full"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(query);
          }}
        >
          <label htmlFor="screener-say" className="sr-only">
            Search a company, or describe the stocks you want
          </label>
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-oa-muted-fg">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          {/* Always mounted, so screen readers hear the change when it fills. */}
          <span className="sr-only" aria-live="polite">
            {reading ? "Reading your words" : ""}
          </span>
          <input
            id="screener-say"
            ref={box}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={PLAIN_MAX_CHARS}
            value={query}
            placeholder="Ticker, or “lowest P/E vs history”"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              typing.current = true;
              setQuery(event.target.value);
            }}
            className={`h-10 w-full rounded-md border border-oa-border bg-oa-card pl-8 ${reading || pending || showEnter ? "pr-[5.5rem]" : query ? "pr-9" : "pr-2.5"} text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary focus-visible:!outline-none sm:h-9 [&::-webkit-search-cancel-button]:hidden`}
          />
          {reading || pending ? (
            <span aria-hidden="true" className="oa-mono pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-oa-muted-fg">
              {reading ? "reading…" : "screening…"}
            </span>
          ) : showEnter ? (
            <button
              type="submit"
              aria-label="Screen for these words"
              className="oa-mono absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded border border-oa-border bg-oa-page px-2 text-[11.5px] text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:border-oa-primary"
            >
              Enter <span aria-hidden="true">↵</span>
            </button>
          ) : query ? (
            <button
              type="button"
              aria-label="Clear the box"
              onClick={() => {
                typing.current = false;
                setQuery("");
                setHeard(null);
                if (said || filters.q) resetScreen();
              }}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent"
            >
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          ) : null}
        </form>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
          className={`${CONTROL} !h-10 shrink-0 sm:hidden ${filtersOpen ? "border-oa-fg" : ""}`}
        >
          Filters
          {total - (filters.q ? 1 : 0) > 0 ? <span className="oa-mono text-[12.5px] text-oa-primary">{total - (filters.q ? 1 : 0)}</span> : null}
        </button>

        {needsAsk && !reading ? (
          <p className="basis-full text-[12.5px] leading-[18px] text-oa-muted-fg">Part of this needs Ask: Enter uses one of today&apos;s questions.</p>
        ) : null}

        {!query && !said && total === 0 && !view.preset ? (
          // Under the box: on a phone while it is focused, on wider screens while it is empty.
          <PlainExamples
            onPick={(text) => {
              setQuery(text);
              void submit(text);
            }}
            className={`basis-full ${focused ? "flex" : "hidden sm:flex"}`}
          />
        ) : null}

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
                <span className="inline-flex items-center gap-1.5">
                  <SectorIcon id={sector.name} size={14} />
                  {sector.name}
                </span>
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
                  {CALL_PLAIN[word]}
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
        </div>

        {right ? <div className="flex min-h-8 basis-full items-center gap-2 max-sm:[&_button]:h-10 sm:ml-auto sm:basis-auto">{right}</div> : null}
      </div>

      {understood || shownRangeIds.length > 0 || notes ? (
        <div className={`${understood || notes || filtersOpen ? "flex" : "hidden"} flex-wrap items-center gap-2 sm:flex`}>
          {understood ? (
            <span className="oa-caption mr-0.5" title={askRead ? "Part of this was read by Ask. Check the numbers on each chip." : undefined}>
              {askRead ? "Ask read it as" : "Understood"}
            </span>
          ) : null}
          {understood && customSort ? (
            <SortChip
              label={describeSort(view.sort)}
              dir={view.sort.dir}
              onFlip={() => go({ ...view, preset: null, sort: { ...view.sort, dir: view.sort.dir === "asc" ? "desc" : "asc" } })}
              onRemove={() => go({ ...view, preset: null, sort: DEFAULT_SORT })}
            />
          ) : null}
          {understood && filters.q ? (
            <TokenChip removeLabel={`Remove the search for ${filters.q}`} onRemove={() => setFilters({ q: "" })}>
              “{filters.q}”
            </TokenChip>
          ) : null}
          {understood
            ? filters.sectors.map((slug) => {
                const name = sectors.find((sector) => sector.slug === slug)?.name ?? PLAIN_SECTORS.find((sector) => sector.slug === slug)?.name ?? slug;
                return (
                  <TokenChip key={slug} icon={<SectorIcon id={name} size={14} />} removeLabel={`Remove ${name}`} onRemove={() => setFilters({ sectors: filters.sectors.filter((item) => item !== slug) })}>
                    {name}
                  </TokenChip>
                );
              })
            : null}
          {understood
            ? filters.caps.map((id) => (
                <TokenChip key={id} removeLabel={`Remove ${id} cap`} onRemove={() => setFilters({ caps: filters.caps.filter((item) => item !== id) })}>
                  {CAP_TIERS.find((tier) => tier.id === id)?.label ?? id} cap
                </TokenChip>
              ))
            : null}
          {understood && canCallFilters
            ? [
                ...filters.calls.map((word) => (
                  <TokenChip key={word} removeLabel={`Remove our call ${CALL_PLAIN[word]}`} onRemove={() => setFilters({ calls: filters.calls.filter((item) => item !== word) })}>
                    Our call: {CALL_PLAIN[word]}
                  </TokenChip>
                )),
                ...filters.zones.map((id) => (
                  <TokenChip key={id} removeLabel="Remove the zone" onRemove={() => setFilters({ zones: filters.zones.filter((item) => item !== id) })}>
                    {ZONE_WORDS[id]}
                  </TokenChip>
                )),
              ]
            : null}
          {notes ? notes.locked.map((label) => <LockedChip key={label}>Our call: {label}, not applied</LockedChip>) : null}
          {shownRangeIds.map((id) => {
            const field = FIELD_BY_ID.get(id);
            if (!field) return null;
            const range = filters.ranges[id];
            // A sentence's "only stocks that have this figure" reads as that, not as a 0 to 100 range.
            if (understood && range && isWholeRange(id, range)) {
              return (
                <TokenChip key={id} removeLabel={`Keep stocks without ${chipName(id)} too`} onRemove={() => removeRange(id)}>
                  {hasName(id)}
                </TokenChip>
              );
            }
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
          {notes ? notes.leftover.map((phrase, index) => <MissChip key={phrase} phrase={phrase} unchanged={!notes.applied && index === 0} />) : null}
          {notes?.note === "sign_in" && notes.leftover.length > 0 ? (
            <button type="button" onClick={signInToRead} className="text-[13px] text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] underline-offset-2 hover:decoration-oa-primary">
              Sign in to have Ask read it
            </button>
          ) : null}
          {notes?.note === "limit" ? (
            <span className="text-[13px] text-oa-muted-fg">
              Today&apos;s Ask questions are used.{" "}
              {plan !== "pro" ? (
                <AppLink href="/pricing#ask" className="text-oa-primary underline underline-offset-2">
                  Pro has 50 a day
                </AppLink>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Column picker ─────────────────────────────────────────────────────── */

export function ColumnPicker({
  view,
  availableFields,
  zonesEverywhere,
  said = null,
}: {
  view: ScreenerView;
  availableFields: string[];
  zonesEverywhere: boolean;
  said?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const available = React.useMemo(() => new Set([...availableFields, ...TEXT_COLUMNS.map((column) => column.id)]), [availableFields]);
  const columns = view.columns;
  const full = columns.length >= MAX_COLUMNS;

  function set(next: string[]) {
    // Keep the catalogue's order so columns do not jump around as they are ticked.
    const ordered = next.length > 0 ? next : columns;
    startTransition(() => {
      router.replace(withSaid(viewHref({ ...view, columns: ordered }), said), { scroll: false });
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
    <AppLink href={href} className={CONTROL}>
      {children}
    </AppLink>
  );
}
