"use client";

import { useEffect, useState } from "react";

import { extendedDropAt, extendedMoveWords, extendedPct, extendedTime, sessionLabel, sessionWords, type ExtendedSession } from "@/lib/extended-quotes";

import { NUM, TONE_COLOR } from "./primitives";

export type ExtendedLine = {
  session: ExtendedSession;
  /** "after the close", "after the close yesterday": the report this move reacts to, when there is one. */
  reported: string | null;
  /** A few words from the release, for the hover title only (the line keeps its word budget). */
  reason: string | null;
  price: number;
  changePct: number;
  asOf: string;
  /** False when `reported` already names the print's day. */
  timeWithDay: boolean;
  title: string;
};

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The line itself. It hides itself at the next regular open, so a page left open (or served from a cache) never keeps
 * an after-hours price into the session.
 */
export function ExtendedHoursText({ line }: { line: ExtendedLine }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const drop = extendedDropAt(line);
    if (drop === null) return;
    const wait = drop - Date.now();
    if (wait <= 0) {
      setGone(true);
      return;
    }
    // setTimeout caps at about 24.8 days; an extended quote never lives that long.
    const timer = window.setTimeout(() => setGone(true), Math.min(wait + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [line]);
  if (gone) return null;

  const rounded = Math.round(line.changePct * 10) / 10;
  const tone = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const time = extendedTime(line.asOf, Date.now(), line.timeWithDay);
  const title = line.reported && line.reason ? `Reported ${line.reported}: ${line.reason}. ${line.title}` : line.title;
  // Plain inline text, so a phone wraps it between words; the price and the time never break inside.
  return (
    <p className="mt-1 min-w-0 text-pretty text-[13px] leading-5 text-oa-muted-fg" title={title} data-extended-hours={line.session}>
      {line.reported ? (
        <span className="text-oa-fg">
          Reported {line.reported};{" "}
          <span className="font-medium" style={{ color: TONE_COLOR[tone] }}>
            {extendedMoveWords(line.changePct)}
          </span>{" "}
          {sessionWords(line.session)} at <span className={`${NUM} whitespace-nowrap`}>{money(line.price)}</span>
        </span>
      ) : (
        <>
          {sessionLabel(line.session)} <span className={`${NUM} whitespace-nowrap font-medium text-oa-fg`}>{money(line.price)}</span>{" "}
          <span className={`${NUM} whitespace-nowrap font-medium`} style={{ color: TONE_COLOR[tone] }}>
            {extendedPct(line.changePct)}
          </span>
        </>
      )}
      {time ? (
        <span className={`${NUM} whitespace-nowrap`} suppressHydrationWarning>
          {" "}
          · {time}
        </span>
      ) : null}
    </p>
  );
}
