"use client";

import Link from "next/link";
import { useState } from "react";

type EventItem = {
  sentence: string;
  event_type: string;
  scope: string;
  direction: string;
  symbol: string;
};

type ChangeItem = {
  ticker: string;
  sentence: string;
  delta: number | null;
};

type Props = {
  events: EventItem[];
  changes: {
    summary: string;
    hasPrevious: boolean;
    changedCount: number;
    scoreChanges: ChangeItem[];
    newTickers: string[];
  };
  refreshing?: boolean;
};

type Tab = "events" | "changes";

export function RadarActivity({ events, changes, refreshing }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("events");
  const totalCount = events.length + changes.changedCount + changes.newTickers.length;

  return (
    <section className="flex flex-col gap-4">
      {/* Section opener */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-baseline justify-between gap-3 border-t border-[#e5e7eb] pt-8 text-left"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
            § 04
          </span>
          <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#111111]">
            Activity
          </h2>
          {refreshing && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fcd34d] bg-[#fffbeb] px-2.5 py-1 text-[10px] font-semibold tracking-[0.06em] uppercase text-[#92400e] shadow-[0_0_0_3px_rgba(251,191,36,0.15)]">
              <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f59e0b]" />
              </span>
              Updating
            </span>
          )}
          {totalCount > 0 && (
            <span className="text-[12px] font-semibold tabular-nums text-[#9ca3af]">
              {totalCount}
            </span>
          )}
        </div>
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b7280] group-hover:text-[#111111]">
          {open ? "Collapse −" : "Expand +"}
        </span>
      </button>

      {open && (
        <>
          <div className="flex items-center gap-1.5">
            <TabButton
              active={tab === "events"}
              onClick={() => setTab("events")}
              label="Events"
              count={events.length}
            />
            <TabButton
              active={tab === "changes"}
              onClick={() => setTab("changes")}
              label="Changes"
              count={changes.changedCount + changes.newTickers.length}
            />
          </div>

          {tab === "events" ? (
            <EventList events={events} />
          ) : (
            <ChangesList changes={changes} />
          )}
        </>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-[#111111] text-white"
          : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-semibold tabular-nums ${
          active ? "text-white/70" : "text-[#9ca3af]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function EventList({ events }: { events: EventItem[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-6 py-10 text-center text-[13px] text-[#6b7280] italic">
        All quiet. No tracked-stock events this session.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {events.map((event, i) => {
        const eventType = (event.event_type || "event").replaceAll("_", " ");
        return (
          <li
            key={`event-${i}-${event.symbol || "na"}`}
            className="grid grid-cols-[minmax(72px,_auto)_1fr_auto] items-start gap-4 border-b border-[#f3f4f6] py-3"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
              {eventType}
            </span>
            <p className="text-[13px] leading-relaxed text-[#111111]">
              {event.symbol ? (
                <>
                  <Link
                    href={`/stock/${encodeURIComponent(event.symbol)}`}
                    className="font-semibold hover:text-[#0052ff] transition-colors"
                  >
                    {event.symbol}
                  </Link>
                  {" · "}
                  {event.sentence}
                </>
              ) : (
                event.sentence
              )}
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6b7280]">
              {event.scope || "stock"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ChangesList({ changes }: { changes: Props["changes"] }) {
  const hasAny =
    changes.scoreChanges.length > 0 || changes.newTickers.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] leading-relaxed text-[#111111] max-w-[760px]">
        {changes.summary ||
          "No previous snapshot yet; this build sets the baseline."}
      </p>
      {hasAny && (
        <ul className="flex flex-col">
          {changes.scoreChanges.map((item, i) => {
            const delta = item.delta;
            const tone =
              typeof delta === "number" && delta > 0
                ? "text-[#10b981]"
                : typeof delta === "number" && delta < 0
                ? "text-[#ef4444]"
                : "text-[#6b7280]";
            const deltaStr =
              delta === null
                ? "—"
                : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
            return (
              <li
                key={`score-${i}`}
                className="grid grid-cols-[minmax(56px,_auto)_1fr_auto] items-baseline gap-4 border-b border-[#f3f4f6] py-2.5"
              >
                <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                  {item.ticker}
                </span>
                <span className="text-[13px] text-[#6b7280]">{item.sentence}</span>
                <span className={`text-[13px] font-semibold tabular-nums ${tone}`}>
                  {deltaStr}
                </span>
              </li>
            );
          })}
          {changes.newTickers.map((ticker) => (
            <li
              key={`new-${ticker}`}
              className="grid grid-cols-[minmax(56px,_auto)_1fr_auto] items-baseline gap-4 border-b border-[#f3f4f6] py-2.5"
            >
              <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                {ticker}
              </span>
              <span className="text-[13px] text-[#6b7280]">
                Baseline established for future score, alert, and event changes.
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                new
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
