"use client";

import * as React from "react";

import { FollowButton } from "@/components/follow/follow-button";
import {
  HoldingChip,
  PartyDot,
  ReturnCell,
  Sparkline,
} from "@/components/follow/bits";
import {
  PERF_WINDOWS,
  excess,
  fmtDate,
  fmtMonthYear,
  fmtWeight,
  sortSources,
  sourceHref,
  type FollowSource,
  type PerfKey,
  type SortKey,
} from "@/lib/follow-shared";
import { oneRowPerCompany } from "@/lib/share-class";

export type DirectoryTab = "funds" | "congress" | "insiders";

const GRID =
  "lg:grid-cols-[minmax(160px,1.5fr)_56px_repeat(6,minmax(62px,76px))_minmax(118px,1fr)_50px_72px]";
const PAGE = 40;
// A phone shows the first few; the rest wait behind the same "Show all" button.
const PHONE_PAGE = 10;

function SortHeader({
  label,
  title,
  active,
  direction,
  onClick,
  align = "right",
}: {
  label: string;
  title?: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`oa-caption flex h-9 items-center gap-1 outline-none transition-colors hover:text-oa-fg focus-visible:text-oa-fg ${
        align === "right" ? "justify-end text-right" : "justify-start text-left"
      } ${active ? "text-oa-fg" : "text-oa-muted-fg"}`}
    >
      {label}
      <span
        aria-hidden="true"
        className={`text-[9px] ${active ? "opacity-100" : "opacity-0"}`}
      >
        {direction === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
}

export function FollowDirectory({
  tab,
  sources,
  followed: followedInitial,
  note,
  bar,
}: {
  /** The page's tab row. It shares the directory's top line with the search on a desktop. */
  bar?: React.ReactNode;
  tab: "funds" | "congress";
  sources: FollowSource[];
  followed: string[];
  /** What the numbers are and where they come from. */
  note: React.ReactNode;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("r_1y");
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc");
  const [query, setQuery] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [followed, setFollowed] = React.useState<Set<string>>(
    () => new Set(followedInitial),
  );

  function pickSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    // Names read A to Z; a drawdown reads best with the shallowest first, which is also "desc".
    setDirection(key === "name" ? "asc" : "desc");
  }

  function handleFollow(slug: string, next: boolean) {
    setFollowed((current) => {
      const copy = new Set(current);
      if (next) copy.add(slug);
      else copy.delete(slug);
      return copy;
    });
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? sources.filter(
        (source) =>
          source.name.toLowerCase().includes(needle) ||
          source.person.toLowerCase().includes(needle) ||
          source.top_holdings.some(
            (holding) => (holding.ticker ?? "").toLowerCase() === needle,
          ),
      )
    : sources;
  const sorted = sortSources(filtered, sortKey, direction, followed);
  const visible = showAll || needle ? sorted : sorted.slice(0, PAGE);
  const mobileKey: PerfKey =
    sortKey === "name" || sortKey === "latest_date" || sortKey === "stock_value"
      ? "r_1y"
      : sortKey;
  const followedCount = sources.filter((source) =>
    followed.has(source.slug),
  ).length;

  return (
    <div className="flex flex-col">
      {/* One row of controls: the tabs, and the search at the right end on a desktop. On a phone the search sits under the list, so the ranking starts sooner. */}
      <div className="max-lg:contents lg:mb-3 lg:flex lg:items-center lg:gap-6 lg:border-b lg:border-oa-border">
        {bar}
        <div className="max-lg:order-last max-lg:mt-3">
        <label className="relative block w-full lg:w-64 lg:shrink-0">
          <span className="sr-only">
            Search {tab === "funds" ? "funds and managers" : "members"}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "funds"
                ? "Fund, manager or ticker"
                : "Member or ticker"
            }
            className="h-10 w-full rounded-md border border-oa-border bg-oa-card px-3 text-[14px] text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-oa-primary lg:h-8"
          />
        </label>
        </div>
      </div>

      <>
        {/* Phones show one window at a time; this picks it and sorts by it. */}
        <div
          className="oa-scroll-fade mt-2 flex gap-1.5 overflow-x-auto pr-9 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
          aria-label="Window"
        >
          {PERF_WINDOWS.map((window) => (
            <button
              key={window.key}
              type="button"
              onClick={() => pickSort(window.key)}
              aria-pressed={mobileKey === window.key}
              className={`h-10 shrink-0 rounded-md border px-3 text-[14px] ${
                mobileKey === window.key
                  ? "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg"
                  : "border-oa-border text-oa-muted-fg"
              }`}
            >
              {window.label}
            </button>
          ))}
        </div>

        {message ? (
          <p
            role="status"
            className="oa-surface mt-3 border border-oa-primary/40 bg-[color-mix(in_srgb,var(--oa-primary)_8%,transparent)] px-4 py-2 text-[13px] leading-5 text-oa-fg"
          >
            {message}{" "}
            <a
              href="/pricing"
              className="underline decoration-oa-primary/50 underline-offset-[3px] hover:text-oa-primary"
            >
              See plans
            </a>
          </p>
        ) : null}

        <div className="oa-surface mt-3 overflow-hidden border border-oa-border bg-oa-card lg:mt-0">
          <div
            className={`hidden items-center gap-x-2 border-b border-oa-border bg-oa-bg px-4 lg:grid ${GRID}`}
          >
            <SortHeader
              label={tab === "funds" ? "Fund" : "Member"}
              active={sortKey === "name"}
              direction={direction}
              onClick={() => pickSort("name")}
              align="left"
            />
            <span className="oa-caption">
              Record
            </span>
            {PERF_WINDOWS.map((window) => (
              <SortHeader
                key={window.key}
                label={window.label}
                title={window.long}
                active={sortKey === window.key}
                direction={direction}
                onClick={() => pickSort(window.key)}
              />
            ))}
            <span className="oa-caption">
              {tab === "funds" ? "Top holdings" : "Most bought"}
            </span>
            <SortHeader
              label="Filed"
              title="Latest filing"
              active={sortKey === "latest_date"}
              direction={direction}
              onClick={() => pickSort("latest_date")}
            />
            <span />
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-6 text-[14px] text-oa-muted-fg">
              {needle
                ? `Nothing matches "${query.trim()}".`
                : "Nothing here yet."}
            </p>
          ) : (
            <ul className="divide-y divide-oa-border">
              {visible.map((source, rowIndex) => {
                const isFollowed = followed.has(source.slug);
                const card = source.performance;
                return (
                  <li
                    key={source.slug}
                    className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-2 lg:min-h-[48px] lg:gap-x-2 lg:py-1.5 ${GRID} ${
                      !showAll && !needle && rowIndex >= PHONE_PAGE ? "max-lg:hidden" : ""
                    } ${
                      isFollowed
                        ? "bg-[color-mix(in_srgb,var(--oa-primary)_5%,transparent)]"
                        : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <a
                        href={sourceHref(source.slug)}
                        data-track="fund_opened"
                        data-track-slug={source.slug}
                        data-track-list="directory"
                        className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-5 text-oa-fg outline-none hover:text-oa-primary focus-visible:text-oa-primary"
                      >
                        <PartyDot party={source.party} />
                        <span className="text-pretty">{source.name}</span>
                      </a>
                      <p className="text-pretty text-[12px] leading-4 text-oa-muted-fg">
                        {source.person}
                        {!source.active
                          ? ` · last filed ${fmtMonthYear(source.latest_date)}`
                          : ""}
                        <span className="lg:hidden">
                          {source.latest_date
                            ? ` · filed ${fmtDate(source.latest_date, false)}`
                            : ""}
                        </span>
                      </p>
                    </div>

                    <div
                      className="hidden lg:block"
                      title={
                        card
                          ? `Since ${fmtMonthYear(card.start_date)}, against the S&P 500 (grey)`
                          : undefined
                      }
                    >
                      <Sparkline
                        fund={card?.spark}
                        spy={card?.spark_spy}
                        width={54}
                        height={22}
                      />
                    </div>

                    {PERF_WINDOWS.map((window) => (
                      <div
                        key={window.key}
                        className={`${window.key === mobileKey ? "block" : "hidden"} lg:block`}
                      >
                        <ReturnCell
                          value={card?.fund?.[window.key]}
                          versus={excess(card, window.key)}
                          drawdown={window.key === "max_drawdown"}
                          compact
                        />
                      </div>
                    ))}

                    <div className="hidden min-w-0 flex-wrap gap-1 overflow-hidden lg:flex lg:max-h-6">
                      {(({ rows: folded, also }) => folded.slice(0, 3).map((holding, index) => (
                        <HoldingChip
                          key={`${holding.ticker ?? holding.name}-${index}`}
                          ticker={holding.ticker}
                          name={holding.name}
                          also={holding.ticker ? also.get(holding.ticker.toUpperCase()) : undefined}
                          title={
                            source.kind === "fund" && holding.weight != null
                              ? `${holding.name ?? holding.ticker}: ${fmtWeight(holding.weight)} of the stock book`
                              : undefined
                          }
                        />
                      )))(oneRowPerCompany(source.top_holdings, (holding) => holding.ticker))}
                    </div>

                    <span
                      className="oa-mono hidden text-right text-[12px] text-oa-muted-fg lg:block"
                      title={fmtDate(source.latest_date)}
                    >
                      {fmtDate(source.latest_date, false)}
                    </span>

                    <div className="flex justify-end">
                      <FollowButton
                        slug={source.slug}
                        name={source.name}
                        followed={isFollowed}
                        onChange={handleFollow}
                        onMessage={setMessage}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!showAll && !needle && sorted.length > PHONE_PAGE ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`${sorted.length > PAGE ? "" : "lg:hidden"} flex h-11 w-full items-center justify-center border-t border-oa-border text-[13px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent`}
            >
              Show all {sorted.length}
            </button>
          ) : null}
        </div>

        <div className="mt-2 max-w-[90ch] px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-0">
          <span>Hypothetical returns from each filing date, against the S&amp;P 500. </span>
          {followedCount > 0 ? (
            <span>You follow {followedCount} here; they stay at the top. </span>
          ) : null}
          {note}
        </div>
      </>
    </div>
  );
}
