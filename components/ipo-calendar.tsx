"use client";

import { useState, useEffect, useMemo } from "react";
import type { IpoEvent } from "@/lib/ipos";
import { StockLogo } from "@/components/stock-logo";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function exchangeLabel(exchange: string) {
  if (exchange === "NASDAQ") return "Nasdaq";
  if (exchange === "NYSE") return "NYSE";
  return exchange || "-";
}

function DayModal({
  dateStr,
  events,
  onClose,
}: {
  dateStr: string;
  events: IpoEvent[];
  onClose: () => void;
}) {
  const d = new Date(dateStr + "T12:00:00");
  const heading = `${DAYS_FULL[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-oa-card rounded-[24px] shadow-2xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--oa-bg)]">
          <div>
            <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-[var(--oa-muted-fg)]">
              IPO
            </p>
            <h3 className="text-[18px] font-medium tracking-[-0.02em] text-[var(--oa-fg)]">
              {heading}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--oa-bg)] flex items-center justify-center text-[var(--oa-muted-fg)] hover:bg-[var(--oa-border)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-1">
          {events.map((ipo) => (
            <div
              key={ipo.ticker}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-[var(--oa-bg)] transition-colors"
            >
              <StockLogo ticker={ipo.ticker} size={36} market="US" />
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-[13px] font-medium text-[var(--oa-fg)] leading-tight">
                  {ipo.ticker}
                </span>
                <span className="text-[11px] text-[var(--oa-muted-fg)] leading-tight truncate">
                  {ipo.company}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className="text-[11px] text-[var(--oa-muted-fg)]">
                  {exchangeLabel(ipo.exchange)}
                </span>
                {ipo.price_range_low != null && (
                  <span className="text-[13px] font-medium tabular-nums text-[var(--oa-fg)]">
                    ${ipo.price_range_low}–${ipo.price_range_high}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IpoCalendar() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [events, setEvents] = useState<IpoEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/ipos?start_date=${startDate}&end_date=${endDate}`)
      .then((r) => r.json())
      .then((data) => { setEvents(data.events || []); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [startDate, endDate]);

  useEffect(() => { setSelectedDate(null); }, [startDate]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, IpoEvent[]> = {};
    for (const e of events) {
      if (!map[e.ipo_date]) map[e.ipo_date] = [];
      map[e.ipo_date].push(e);
    }
    return map;
  }, [events]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().slice(0, 10);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <>
      <div className="flex flex-col gap-5 w-full">

        {/* Nav */}
        <div className="flex items-center justify-between w-full">
          <button
            onClick={prevMonth}
            className="flex items-center gap-1.5 rounded-full border border-[var(--oa-border)] px-4 py-2 text-[13px] font-medium text-[var(--oa-muted-fg)] hover:border-[var(--oa-fg)] hover:text-[var(--oa-fg)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Prev
          </button>

          <h2 className="text-[20px] font-medium tracking-[-0.02em] text-[var(--oa-fg)]">
            {MONTHS[month]} {year}
          </h2>

          <button
            onClick={nextMonth}
            className="flex items-center gap-1.5 rounded-full border border-[var(--oa-border)] px-4 py-2 text-[13px] font-medium text-[var(--oa-muted-fg)] hover:border-[var(--oa-fg)] hover:text-[var(--oa-fg)] transition-colors"
          >
            Next
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[14px] text-[var(--oa-muted-fg)]">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[14px] text-[var(--oa-muted-fg)] gap-2">
            <span className="text-[32px]">🎯</span>
            <p>No IPOs scheduled for {MONTHS[month]} {year}.</p>
          </div>
        ) : (
          <div className="w-full rounded-2xl border border-[var(--oa-border)] overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-[var(--oa-border)]">
              {DAYS.map((d) => (
                <div key={d} className="py-2.5 text-center text-[11px] font-medium tracking-[0.07em] uppercase text-[var(--oa-muted-fg)] bg-oa-bg">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[110px] bg-oa-bg border-r border-b border-[var(--oa-bg)]" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] || [];
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const col = (firstDayOfWeek + i) % 7;
                const isWeekend = col === 0 || col === 6;
                const hasEvents = dayEvents.length > 0;
                const MAX_SHOW = 3;
                const overflow = dayEvents.length - MAX_SHOW;

                return (
                  <div
                    key={dateStr}
                    onClick={() => hasEvents && setSelectedDate(dateStr)}
                    className={`min-h-[110px] p-2 flex flex-col gap-1 border-r border-b border-[var(--oa-bg)] transition-colors ${
                      isWeekend ? "bg-oa-bg" : "bg-oa-card"
                    } ${hasEvents ? "cursor-pointer hover:bg-oa-accent" : ""} ${
                      isSelected ? "bg-oa-accent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-end mb-0.5">
                      <span
                        className={`text-[12px] font-medium leading-none w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday
                            ? "bg-[var(--oa-primary)] text-white"
                            : isWeekend
                            ? "text-oa-muted-fg/50"
                            : "text-[var(--oa-muted-fg)]"
                        }`}
                      >
                        {day}
                      </span>
                    </div>

                    {dayEvents.slice(0, MAX_SHOW).map((ipo) => (
                      <div key={ipo.ticker} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md">
                        <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-oa-primary" />
                        <span className="text-[11px] font-medium text-[var(--oa-fg)] leading-none truncate flex-1">
                          {ipo.ticker}
                        </span>
                        <span className="text-[10px] text-[var(--oa-muted-fg)] leading-none tabular-nums shrink-0">
                          {exchangeLabel(ipo.exchange)}
                        </span>
                      </div>
                    ))}

                    {overflow > 0 && (
                      <span className="text-[10px] font-medium text-[var(--oa-primary)] px-1.5">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Day detail modal */}
      {selectedDate && (
        <DayModal
          dateStr={selectedDate}
          events={selectedEvents}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}
