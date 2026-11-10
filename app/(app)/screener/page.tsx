import type { Metadata } from "next";
import Link from "next/link";
import * as React from "react";

import { LockCard, ProMark } from "@/components/oa/gate";
import {
  AppPage,
  Chips,
  Delta,
  Empty,
  NUM,
  PageHead,
  Panel,
  SourceLine,
  Sparkline,
  Segmented,
  StatStrip,
  Ticker,
  fmtCompact,
  fmtStampET,
} from "@/components/oa/kit";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { ColumnPicker, FilterBar, type SectorOption } from "@/components/screener/filter-bar";
import { Menu, MenuLabel } from "@/components/screener/menu";
import { MyScreens, SaveScreen } from "@/components/screener/save-screen";
import { HeatLegend, SectorHeatGrid, SectorMap } from "@/components/screener/sector-map";
import { RowCheck, SelectAllCheck, SelectionBar, SelectionProvider } from "@/components/screener/selection";
import { CONTROL, CallTag, EarningsDate, FieldValue, Unknown, ZoneTag } from "@/components/screener/shared";
import { can, limitFor } from "@/lib/entitlements";
import { canSeeLevels, getViewer } from "@/lib/entitlements-server";
import { getScreenerSnapshot } from "@/lib/screener";
import { readSavedScreens, type SavedScreen } from "@/lib/screener-saved";
import {
  CALL_COLUMN_IDS,
  ZONE_COLUMN_IDS,
  CAP_TIERS,
  DEFAULT_SORT,
  FIELD_BY_ID,
  SECTOR_PERIODS,
  TEXT_COLUMNS,
  applyFilters,
  availablePresets,
  countActiveFilters,
  describeRange,
  hasCallFilters,
  isFiniteNumber,
  parseView,
  sectorSlug,
  sectorStats,
  sortHref,
  sortRows,
  viewHref,
  viewToQuery,
  withoutZones,
  EMPTY_FILTERS,
  ZONES,
  type CapTier,
  type ScreenPreset,
  type ScreenerRow,
  type ScreenerView,
  type SectorStat,
} from "@/lib/screener-shared";
import { StockLogo } from "@/components/stock-logo";
import { TheRead } from "@/components/oa/insight";
import { buildScreenerRead, buildSectorsRead } from "@/lib/screener-insights";
import { getUserDoc } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

type SearchParams = Record<string, string | string[] | undefined>;

const BASE = "https://www.stocksbrew.online";
const PAGE_ROWS = 50;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const view = parseView(searchParams);
  const snapshot = await getScreenerSnapshot().catch(() => null);
  const presets = availablePresets(snapshot?.meta.coverage);
  const preset = view.preset ? presets.find((item) => item.slug === view.preset) ?? null : null;
  const custom = !preset && countActiveFilters(view.filters) > 0;
  const oneSector = custom && countActiveFilters(view.filters) === 1 && view.filters.sectors.length === 1;
  // A sector view is a page of its own only for a sector we actually cover. Any
  // other ?sector= value would otherwise make an indexable "Foo Stocks" page.
  // When the snapshot cannot be read we cannot tell, so the view keeps its own
  // canonical rather than being dropped from the index on a bad read.
  const sectorStat = oneSector && snapshot
    ? sectorStats(snapshot.rows).find((stat) => stat.slug === view.filters.sectors[0]) ?? null
    : null;
  const unknownSector = oneSector && snapshot !== null && sectorStat === null;

  let title = "Stock Screener: Filter US Stocks by Valuation, Growth and Price Action";
  let description =
    "Screen US stocks by sector, size, valuation, growth, margins, dividends, analyst targets, volatility and distance from the 52-week range. Every screen is a link you can share.";
  let canonical = "/screener";
  if (view.tab === "sectors") {
    title = "Stock Market Map by Sector: Every Stock We Cover, Sized by Market Value";
    description = "Every stock we cover as a tile sized by market value and coloured by its change, grouped by sector. Pick a sector to screen it.";
    canonical = "/screener?tab=sectors";
  } else if (preset) {
    title = `${preset.name}: stock screen`;
    description = preset.description;
    canonical = `/screener?preset=${preset.slug}`;
  } else if (oneSector && !unknownSector) {
    const name = sectorStat?.name ?? view.filters.sectors[0]!.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    title = `${name} Stocks: Screen by Valuation, Growth and Price Action`;
    description = `Screen US ${name.toLowerCase()} stocks by valuation, growth, margins, analyst targets and price action.`;
    canonical = `/screener?sector=${view.filters.sectors[0]}`;
  }
  const shareImage = ogImage(["page", "screener"], "The US stock screener: today's read of the market", { daily: true });
  return {
    title,
    description,
    alternates: { canonical },
    // A hand-built filter combination is somebody's working state, not a page to index.
    robots: (custom && !oneSector) || unknownSector ? { index: false, follow: true } : undefined,
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${canonical}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

function SortLabel({ view, id, numeric, locked = false, children }: { view: ScreenerView; id: string; numeric: boolean; locked?: boolean; children: React.ReactNode }) {
  const active = view.sort.id === id && !locked;
  // Sorting the market by our call is the same list as filtering by it, so it follows the same rule.
  if (locked) return <span className="uppercase tracking-[inherit]">{children}</span>;
  return (
    <Link
      href={sortHref(view, id, numeric)}
      scroll={false}
      prefetch={false}
      aria-label={`Sort by this column${active ? (view.sort.dir === "desc" ? ", now highest first" : ", now lowest first") : ""}`}
      className={`inline-flex items-center gap-1 rounded uppercase tracking-[inherit] outline-none hover:text-oa-fg focus-visible:underline ${active ? "text-oa-fg" : ""}`}
    >
      {children}
      <span aria-hidden="true" className={active ? "text-oa-primary" : "opacity-0"}>
        {view.sort.dir === "asc" ? "↑" : "↓"}
      </span>
    </Link>
  );
}

function cellFor(id: string, row: ScreenerRow): React.ReactNode {
  switch (id) {
    case "sector":
      return row.sector ? <span className="text-oa-muted-fg">{row.sector}</span> : <Unknown />;
    case "industry":
      return row.industry ? <span className="block max-w-[12rem] truncate text-oa-muted-fg">{row.industry}</span> : <Unknown />;
    case "spark":
      return row.spark && row.spark.length > 1 ? <Sparkline values={row.spark} width={72} height={22} className="inline-block align-middle" /> : <Unknown />;
    case "earnings_date":
      return <EarningsDate row={row} />;
    case "analyst_label":
      return row.analyst_label ? <span className="text-oa-fg">{row.analyst_label}</span> : <Unknown />;
    case "call":
      return row.call ? <CallTag call={row.call} /> : null;
    case "zone":
      return row.zone ? <ZoneTag zone={row.zone} /> : null;
    default: {
      const value = (row as Record<string, unknown>)[id];
      if (ZONE_COLUMN_IDS.has(id) && !isFiniteNumber(value)) return null;
      return <FieldValue id={id} value={value} row={row} />;
    }
  }
}

function columnMeta(id: string): { short: string; hint: string; numeric: boolean; sortable: boolean } {
  const field = FIELD_BY_ID.get(id);
  if (field) return { short: field.short, hint: field.label, numeric: true, sortable: true };
  const text = TEXT_COLUMNS.find((column) => column.id === id);
  return { short: text?.short ?? id, hint: text?.label ?? id, numeric: id === "spark", sortable: true };
}

const PRESET_CHIP =
  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** A ready-made screen as one chip: its name and how many stocks match now (or the Pro mark). */
function PresetChip({ preset, count, active, locked }: { preset: ScreenPreset; count: number; active: boolean; locked: boolean }) {
  return (
    <a
      href={`/screener?preset=${preset.slug}`}
      title={preset.description}
      aria-current={active ? "true" : undefined}
      className={`${PRESET_CHIP} ${
        active ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg" : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
      }`}
    >
      {preset.name}
      {locked ? <ProMark /> : <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{count}</span>}
    </a>
  );
}

/** The same screen as a menu line, with the sentence that says what it looks for. */
function PresetLine({ preset, count, active, locked }: { preset: ScreenPreset; count: number; active: boolean; locked: boolean }) {
  return (
    <a
      href={`/screener?preset=${preset.slug}`}
      aria-current={active ? "true" : undefined}
      className={`block px-3 py-2 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent ${active ? "bg-oa-accent" : ""}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[14px] font-medium leading-5 text-oa-fg">{preset.name}</span>
        {locked ? <ProMark /> : <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{count}</span>}
      </span>
      <span className="mt-0.5 block text-[12.5px] leading-[18px] text-oa-muted-fg">{preset.description}</span>
    </a>
  );
}

function describeScreen(view: ScreenerView, sectors: SectorOption[]): string[] {
  const { filters } = view;
  const parts: string[] = [];
  if (filters.q) parts.push(`“${filters.q}”`);
  if (filters.sectors.length) parts.push(filters.sectors.map((slug) => sectors.find((sector) => sector.slug === slug)?.name ?? slug).join(" or "));
  if (filters.caps.length) parts.push(`${filters.caps.map((id) => CAP_TIERS.find((tier) => tier.id === id)?.label ?? id).join(" or ")} cap`);
  if (filters.calls.length) parts.push(`Our call ${filters.calls.join(" or ")}`);
  if (filters.zones.length) parts.push(filters.zones.map((id) => ZONES.find((zone) => zone.id === id)?.label ?? id).join(" or "));
  for (const [id, range] of Object.entries(filters.ranges)) {
    const field = FIELD_BY_ID.get(id);
    if (field) parts.push(describeRange(field, range));
  }
  return parts;
}

function SectorStrip({ stat }: { stat: SectorStat }) {
  return (
    <StatStrip
      className="mb-4"
      stats={[
        { label: stat.name, value: `${stat.count}`, sub: "stocks" },
        { label: "Market value", value: fmtCompact(stat.marketCap, "$") },
        { label: "Today", value: <Delta value={stat.change.day_pct} />, sub: stat.advancing === null ? undefined : `${stat.advancing.toFixed(0)}% of names up` },
        { label: "1 month", value: <Delta value={stat.change.ret_1m} /> },
        { label: "This year", value: <Delta value={stat.change.ret_ytd} /> },
      ]}
    />
  );
}

export default async function ScreenerPage({ searchParams }: { searchParams: SearchParams }) {
  const [snapshot, viewer] = await Promise.all([getScreenerSnapshot().catch(() => null), getViewer()]);

  if (!snapshot) {
    return (
      <AppPage>
        <PageHead label="Explore" title="Stock screener" />
        <Panel>
          <Empty title="The screener is unavailable right now">Try again in a few minutes.</Empty>
        </Panel>
      </AppPage>
    );
  }

  const { meta } = snapshot;
  const plan = viewer.plan;
  const presets = availablePresets(meta.coverage);
  const view = parseView(searchParams, presets);
  const activePreset = view.preset ? presets.find((preset) => preset.slug === view.preset) ?? null : null;

  // The call is open to everyone. Price zones belong to covered stocks (every stock on Pro),
  // so strip them before anything else touches the rows: no filter or sort can leak them.
  const rows = snapshot.rows.map((row) => (canSeeLevels(viewer, row.symbol) ? row : withoutZones(row)));
  // Listing the whole market by our call or zones is Pro: filtering on them, and sorting by them.
  const canCallFilters = can("screener_call_filters", plan);
  const lockedByCall = hasCallFilters(view.filters) && !canCallFilters;
  const sort = CALL_COLUMN_IDS.has(view.sort.id) && !canCallFilters ? DEFAULT_SORT : view.sort;

  const sectorOptions: SectorOption[] = sectorStats(rows)
    .map((stat) => ({ slug: stat.slug, name: stat.name, count: stat.count }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const capCounts: Partial<Record<CapTier, number>> = {};
  for (const row of rows) if (row.cap_tier) capCounts[row.cap_tier] = (capCounts[row.cap_tier] ?? 0) + 1;
  const availableFields = Object.entries(meta.coverage ?? {})
    .filter(([id, count]) => FIELD_BY_ID.has(id) && count >= 20)
    .map(([id]) => id);

  const asOf = fmtStampET(meta.generated_at);
  const tabs = [
    { id: "screen", label: "Screen", href: viewHref({ ...view, tab: "screen" }), count: meta.row_count },
    { id: "sectors", label: "Sectors", href: viewHref({ ...view, tab: "sectors" }), count: sectorOptions.length },
  ];

  // The lede and the as-of time are printed in full in the page note; the title row carries the view switch.
  const head = (
    <PageHead
      title={view.tab === "sectors" ? "Stock sectors" : "Stock screener"}
      lede={
        view.tab === "sectors"
          ? "Sized by market value, coloured by the move. Pick a sector to screen it."
          : "Filter by price action, valuation, growth, quality and our call."
      }
      meta={<SourceLine asOf={asOf} />}
      inline
      className={`max-sm:[&_.oa-head-compact]:hidden ${view.tab === "sectors" ? "" : "[&_.oa-head-lede]:hidden"}`}
      actions={<Segmented items={tabs} current={view.tab} label="Screener view" />}
    />
  );

  /* ── Sectors tab ─────────────────────────────────────────────────────── */
  if (view.tab === "sectors") {
    const stats = sectorStats(rows, view.period);
    const sectorHref = (slug: string) => viewHref({ ...view, tab: "screen", preset: null, filters: { ...EMPTY_FILTERS, sectors: [slug] }, sort: DEFAULT_SORT });
    const periodLabel = SECTOR_PERIODS.find((item) => item.id === view.period)?.label ?? "Today";
    const sectorsRead = buildSectorsRead({ stats: sectorStats(rows), priceDay: meta.price_history_to ?? null });
    const sectorColumns: DataColumn[] = [
      { id: "sector", label: "Sector" },
      { id: "count", label: "Stocks", align: "right", hideOnMobile: true },
      { id: "cap", label: "Mkt value", align: "right", hideOnMobile: true },
      { id: "day", label: "Today", align: "right" },
      { id: "week", label: "1W", align: "right", hideOnMobile: true },
      { id: "month", label: "1M", align: "right" },
      { id: "ytd", label: "YTD", align: "right", hideOnMobile: true },
      { id: "adv", label: "Up today", align: "right", hideOnMobile: true, hint: "Share of the sector's stocks that are up today" },
      { id: "best", label: "Best", hideOnMobile: true, sortable: false },
      { id: "worst", label: "Worst", hideOnMobile: true, sortable: false },
    ];
    const sectorRows: DataRow[] = stats.map((stat) => ({
      key: stat.slug,
      href: sectorHref(stat.slug),
      sort: [stat.name, stat.count, stat.marketCap, stat.change.day_pct ?? null, stat.change.ret_1w ?? null, stat.change.ret_1m ?? null, stat.change.ret_ytd ?? null, stat.advancing, null, null],
      cells: [
        <a key="s" href={sectorHref(stat.slug)} className="font-medium text-oa-fg hover:underline">
          {stat.name}
        </a>,
        <span key="c" className={NUM}>{stat.count}</span>,
        <span key="m" className={NUM}>{fmtCompact(stat.marketCap, "$")}</span>,
        <Delta key="d" value={stat.change.day_pct} />,
        <Delta key="w" value={stat.change.ret_1w} />,
        <Delta key="mo" value={stat.change.ret_1m} />,
        <Delta key="y" value={stat.change.ret_ytd} />,
        stat.advancing === null ? <Unknown key="a" /> : <span key="a" className={NUM}>{stat.advancing.toFixed(0)}%</span>,
        stat.best ? (
          <span key="b" className="inline-flex items-center gap-2">
            <a href={`/stock/${stat.best.symbol}`} className={`${NUM} text-[13px] font-medium text-oa-fg hover:underline`}>{stat.best.symbol}</a>
            <Delta value={stat.best.pct} digits={1} className="text-[12.5px]" />
          </span>
        ) : null,
        stat.worst ? (
          <span key="wo" className="inline-flex items-center gap-2">
            <a href={`/stock/${stat.worst.symbol}`} className={`${NUM} text-[13px] font-medium text-oa-fg hover:underline`}>{stat.worst.symbol}</a>
            <Delta value={stat.worst.pct} digits={1} className="text-[12.5px]" />
          </span>
        ) : null,
      ],
    }));

    return (
      <AppPage>
        {head}
        <TheRead read={sectorsRead} label="Sectors, in short" className="mb-4" />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Chips
            current={view.period}
            items={SECTOR_PERIODS.map((item) => ({ id: item.id, label: item.label, href: viewHref({ ...view, period: item.id }) }))}
          />
          <HeatLegend period={view.period} />
        </div>
        <Panel flush className="mb-5">
          <div className="hidden p-1.5 sm:block">
            <SectorMap rows={rows} stats={stats} period={view.period} sectorHref={sectorHref} />
          </div>
          <div className="sm:hidden">
            <SectorHeatGrid stats={stats} period={view.period} sectorHref={sectorHref} />
          </div>
        </Panel>
        <Panel
          flush
          label="Sectors"
          right={<span className="hidden sm:inline">Weighted by market value. Best and worst: {periodLabel.toLowerCase()}</span>}
        >
          <DataTable columns={sectorColumns} rows={sectorRows} initialSort={{ id: "cap", dir: "desc" }} stickyHeader={false} />
        </Panel>
      </AppPage>
    );
  }

  /* ── Screen tab ──────────────────────────────────────────────────────── */
  const matched = lockedByCall ? [] : sortRows(applyFilters(rows, view.filters), sort);
  // Rows are rendered on the server, so the page carries only the rows it shows.
  const requested = Number(Array.isArray(searchParams.n) ? searchParams.n[0] : searchParams.n);
  const shownCount = Number.isFinite(requested) ? Math.min(Math.max(PAGE_ROWS, Math.floor(requested)), 1000) : PAGE_ROWS;
  const shown = matched.slice(0, shownCount);
  const remaining = matched.length - shown.length;
  const moreHref = (count: number) => {
    const href = viewHref(view);
    return `${href}${href.includes("?") ? "&" : "?"}n=${count}`;
  };
  const presetCounts = new Map(presets.map((preset) => [preset.slug, applyFilters(snapshot.rows, { ...EMPTY_FILTERS, ...preset.filters }).length]));

  let saved: SavedScreen[] = [];
  if (viewer.uid) {
    const doc = await getUserDoc(viewer.uid).catch(() => null);
    saved = readSavedScreens((doc as { saved_screens?: unknown } | null)?.saved_screens);
  }
  const savedLimit = limitFor("saved_screens", plan);
  const hasScreen = activePreset !== null || countActiveFilters(view.filters) > 0;
  const currentQuery = hasScreen ? viewToQuery(view) : "";
  const description = describeScreen(view, sectorOptions);
  const onlySector =
    view.filters.sectors.length === 1 ? sectorStats(rows).find((stat) => stat.slug === view.filters.sectors[0]) ?? null : null;

  const screenRead = lockedByCall
    ? null
    : buildScreenerRead({
        matched,
        universe: rows,
        narrowed: hasScreen,
        priceDay: meta.price_history_to ?? null,
        spy: snapshot.extras.find((row) => row.symbol === "SPY") ?? null,
      });
  const columns: DataColumn[] = [
    { id: "_select", label: <SelectAllCheck symbols={shown.map((row) => row.symbol)} />, sortable: false },
    { id: "symbol", label: <SortLabel view={{ ...view, sort }} id="symbol" numeric={false}>Stock</SortLabel>, sortable: false },
    ...view.columns.map((id): DataColumn => {
      const info = columnMeta(id);
      const callColumn = CALL_COLUMN_IDS.has(id);
      return {
        id,
        align: info.numeric || FIELD_BY_ID.has(id) ? "right" : "left",
        hint: info.hint,
        sortable: false,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <SortLabel view={{ ...view, sort }} id={id} numeric={info.numeric} locked={callColumn && !canCallFilters}>
              {info.short}
            </SortLabel>
            {ZONE_COLUMN_IDS.has(id) && plan !== "pro" ? <ProMark /> : null}
          </span>
        ),
      };
    }),
  ];
  const tableRows: DataRow[] = shown.map((row) => ({
    key: row.symbol,
    href: `/stock/${encodeURIComponent(row.symbol)}`,
    cells: [
      <RowCheck key="_select" symbol={row.symbol} />,
      <div key="symbol" className="sm:max-w-[11.5rem] xl:max-w-[13rem]">
        <Ticker symbol={row.symbol} name={row.name} className="max-w-full" />
      </div>,
      ...view.columns.map((id) => <React.Fragment key={id}>{cellFor(id, row)}</React.Fragment>),
    ],
  }));

  const screensMenu = (label: string, align: "left" | "right") => (
    <Menu label={label} align={align} width="w-[22rem]">
      <div className="pb-1.5">
        {saved.length > 0 ? (
          <div className="border-b border-oa-border px-3 py-2.5">
            <MyScreens screens={saved} currentQuery={currentQuery} />
          </div>
        ) : null}
        <MenuLabel>Ready-made</MenuLabel>
        {presets.map((preset) => (
          <PresetLine
            key={preset.slug}
            preset={preset}
            count={presetCounts.get(preset.slug) ?? 0}
            active={activePreset?.slug === preset.slug}
            locked={Boolean(preset.pro) && !canCallFilters}
          />
        ))}
      </div>
    </Menu>
  );

  // Phone: a list, not a squeezed table. Ticker and name, price over the day's change, our call.
  const PHONE_FIXED = new Set(["symbol", "price", "day_pct", "call", "spark"]);
  const phoneExtra = PHONE_FIXED.has(sort.id) ? null : sort.id;
  const phoneList = (
    <div className="sm:hidden">
      <div className="oa-caption flex h-9 items-center gap-2 border-b border-oa-border bg-oa-bg pl-2 pr-3">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <SelectAllCheck symbols={shown.map((row) => row.symbol)} />
        </span>
        <span className="min-w-0 flex-1">
          <SortLabel view={{ ...view, sort }} id="symbol" numeric={false}>Stock</SortLabel>
        </span>
        <span className="flex items-center gap-2">
          <SortLabel view={{ ...view, sort }} id="price" numeric>Price</SortLabel>
          <SortLabel view={{ ...view, sort }} id="day_pct" numeric>Day</SortLabel>
        </span>
        <span className="w-12 text-right">Call</span>
      </div>
      <ul>
        {shown.map((row) => (
          <li key={row.symbol} className="flex items-center gap-2 border-b border-oa-border pl-2 pr-3 last:border-b-0">
            <span className="flex size-10 shrink-0 items-center justify-center">
              <RowCheck symbol={row.symbol} />
            </span>
            <a href={`/stock/${encodeURIComponent(row.symbol)}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 outline-none focus-visible:bg-oa-accent">
              <StockLogo ticker={row.symbol} size={28} />
              <span className="min-w-0 flex-1">
                <span className={`${NUM} block text-[15px] font-semibold leading-5 text-oa-fg`}>{row.symbol}</span>
                <span className="flex gap-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
                  <span className="min-w-0 truncate">{row.name}</span>
                  {phoneExtra ? <span className="shrink-0 [&_*]:!text-[12.5px]">· {cellFor(phoneExtra, row)}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[14px] leading-5">
                  <FieldValue id="price" value={row.price} />
                </span>
                <span className="block text-[12.5px] leading-[18px]">
                  <FieldValue id="day_pct" value={row.day_pct} />
                </span>
              </span>
              <span className="flex w-12 shrink-0 justify-end">{row.call ? <CallTag call={row.call} /> : null}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );

  const showDirectory = !hasScreen;
  const directory = showDirectory
    ? sectorOptions.map((sector) => ({ ...sector, rows: rows.filter((row) => sectorSlug(row.sector) === sector.slug) }))
    : [];
  const unsectored = showDirectory ? rows.filter((row) => !row.sector) : [];

  return (
    <AppPage>
      {head}
      {!hasScreen ? (
        <DirectorySchema
          total={meta.row_count}
          rows={[...snapshot.rows].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).slice(0, 150)}
        />
      ) : null}

      {/* Desktop: one row of chips, as many as fit, with the full list behind "All screens". Phones get the list inside the results bar. */}
      <nav aria-label="Saved screens" className="mb-3 hidden items-center gap-2 lg:flex">
        <span className="oa-caption shrink-0">Saved screens</span>
        <div className="flex h-8 min-w-0 flex-1 flex-wrap gap-x-2 gap-y-4 overflow-hidden">
          {saved.length > 0 ? <MyScreens screens={saved} currentQuery={currentQuery} className="shrink-0 !flex-nowrap [&>.oa-caption]:hidden" /> : null}
          {presets.map((preset) => (
            <PresetChip
              key={preset.slug}
              preset={preset}
              count={presetCounts.get(preset.slug) ?? 0}
              active={activePreset?.slug === preset.slug}
              locked={Boolean(preset.pro) && !canCallFilters}
            />
          ))}
        </div>
        {screensMenu(`All ${presets.length + saved.length}`, "right")}
      </nav>

      {activePreset ? (
        <p className="mb-3 max-w-[70ch] text-[14px] leading-5 text-oa-muted-fg">
          <span className="font-medium text-oa-fg">{activePreset.name}.</span> {activePreset.description}
        </p>
      ) : null}

      <TheRead read={screenRead} label={hasScreen ? "What this screen says" : "The market we cover"} className="mb-4" />

      {onlySector ? <SectorStrip stat={onlySector} /> : null}

      <SelectionProvider resetKey={currentQuery}>
        <Panel flush className="!overflow-visible">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-oa-border p-3">
            <div className="min-w-0 flex-1 basis-full lg:basis-0">
              <FilterBar
                view={view}
                sectors={sectorOptions}
                availableFields={availableFields}
                capCounts={capCounts}
                plan={plan}
                canCallFilters={canCallFilters}
                trialEligible={viewer.trialEligible}
              />
            </div>
            <div className="flex min-h-8 basis-full items-center gap-2 max-sm:[&_button]:h-10 lg:basis-auto">
              <span className="lg:hidden">{screensMenu("Screens", "left")}</span>
              <p className="mr-auto min-w-0 whitespace-nowrap text-[14px] leading-5 text-oa-muted-fg lg:mr-1">
                <span className={`${NUM} font-medium text-oa-fg`}>{lockedByCall ? "" : matched.length.toLocaleString("en-US")}</span>{" "}
                {lockedByCall ? "" : !hasScreen ? (matched.length === 1 ? "match" : "matches") : `of ${meta.row_count}`}
              </p>
              <ColumnPicker view={view} availableFields={availableFields} zonesEverywhere={plan === "pro"} />
              <SaveScreen
                query={currentQuery}
                canSave={can("saved_screens", plan)}
                plan={plan}
                limit={savedLimit}
                count={saved.length}
                trialEligible={viewer.trialEligible}
                suggestedName={activePreset?.name ?? description.slice(0, 2).join(", ").slice(0, 60)}
              />
              {can("export_data", plan) ? (
                <a href={`/api/screener/export${currentQuery ? `?${currentQuery}` : ""}`} className={`${CONTROL} max-sm:h-10`} download>
                  <span className="max-sm:hidden">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
                </a>
              ) : null}
            </div>
            {!lockedByCall && description.length > 0 ? (
              <p className="hidden basis-full text-[12.5px] leading-[18px] text-oa-muted-fg sm:block">Showing: {description.join(" · ")}</p>
            ) : null}
          </div>

          {lockedByCall ? (
            <div className="p-4">
              <LockCard feature="screener_call_filters" plan={plan} trialEligible={viewer.trialEligible} />
              <p className="mt-3 text-[13.5px] leading-5 text-oa-muted-fg">
                This screen filters on our call or price zones.{" "}
                <a href="/screener" className="text-oa-primary underline underline-offset-2">
                  Start a screen without them
                </a>
                .
              </p>
            </div>
          ) : matched.length === 0 ? (
            <Empty title="Nothing matches this screen right now">
              {description.length > 0 ? `No covered stock fits ${description.join(", ")}. ` : ""}
              Loosen a range or remove a filter.
            </Empty>
          ) : (
            <>
              <div className="hidden sm:block">
                <DataTable columns={columns} rows={tableRows} stickyHeader={false} />
              </div>
              {phoneList}
              {remaining > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-oa-border px-4 py-2.5 text-[13px]">
                  <span className={`${NUM} text-oa-muted-fg`}>
                    Showing {shown.length} of {matched.length.toLocaleString("en-US")}
                  </span>
                  <Link href={moreHref(shown.length + PAGE_ROWS)} scroll={false} prefetch={false} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
                    Show {Math.min(PAGE_ROWS, remaining)} more
                  </Link>
                  {remaining > PAGE_ROWS ? (
                    <Link href={moreHref(matched.length)} scroll={false} prefetch={false} className="text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                      Show all
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <SelectionBar order={shown.map((row) => row.symbol)} compareLimit={limitFor("compare", plan)} />
            </>
          )}
        </Panel>
      </SelectionProvider>


      {showDirectory ? (
        <details className="oa-surface mt-6 border border-oa-border bg-oa-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent [&::-webkit-details-marker]:hidden">
            All stocks, A to Z by sector
            <span className={`${NUM} text-[12px] text-oa-muted-fg`}>{meta.row_count} stocks</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-oa-border p-4">
            {[...directory, ...(unsectored.length ? [{ slug: "other", name: "Not classified", count: unsectored.length, rows: unsectored }] : [])].map((group) => (
              <section key={group.slug}>
                <h3 className="oa-caption mb-1.5">
                  {group.slug === "other" ? group.name : <a href={`/screener?sector=${group.slug}`} className="hover:underline">{group.name}</a>}{" "}
                  <span className="text-oa-muted-fg">{group.rows.length}</span>
                </h3>
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {group.rows.map((row) => (
                    <li key={row.symbol}>
                      <a href={`/stock/${encodeURIComponent(row.symbol)}`} title={row.name} className={`${NUM} text-[12.5px] text-oa-fg hover:underline`}>
                        {row.symbol}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      ) : null}
    </AppPage>
  );
}

/** Carries over the old /stocks directory's structured data: the covered universe as an item list. */
function DirectorySchema({ rows, total }: { rows: readonly ScreenerRow[]; total: number }) {
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "US stock screener",
    description: "Screen and browse the US stocks covered by stocksbrew.",
    url: `${BASE}/screener`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: rows.map((row, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${row.name ?? row.symbol} (${row.symbol})`,
        url: `${BASE}/stock/${row.symbol}`,
      })),
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Screener", item: `${BASE}/screener` },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collection) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
    </>
  );
}
