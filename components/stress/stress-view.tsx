import Link from "next/link";
import * as React from "react";

import { NUM, Panel, Ticker, fmtDay } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { EpisodeToggle } from "@/components/stress/episode-toggle";
import type { TheRead as TheReadData } from "@/lib/insights";
import {
  coveredPct,
  episodeSentence,
  episodeTitle,
  lengthWords,
  noFigureShort,
  ratioShort,
  signedPct,
  windowWords,
  type EpisodeResult,
  type HoldingMove,
  type StressResult,
} from "@/lib/stress-test";

/**
 * /portfolio/stress: the read on top, then one row per real market episode
 * with the portfolio's move and the S&P 500's as bars from a shared zero
 * line. A row opens to every holding's move over the same closes.
 */

const MARKET_FILL = "bg-[color-mix(in_srgb,var(--oa-muted-fg)_42%,transparent)]";

function fillFor(value: number): string {
  return value >= 0 ? "bg-signal-bullish" : "bg-signal-bearish";
}

/** A bar from the centre line: left for a loss, right for a gain, scaled to `max`. */
function Diverging({ value, max, fill, height = "h-2.5" }: { value: number | null; max: number; fill: string; height?: string }) {
  const share = value === null || !(max > 0) ? 0 : Math.min(1, Math.abs(value) / max) * 50;
  return (
    <span aria-hidden="true" className={`relative block ${height} w-full`}>
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-oa-border" />
      {value !== null && share > 0 ? (
        <span
          className={`absolute inset-y-0 rounded-[2px] ${fill}`}
          style={value < 0 ? { right: "50%", width: `${Math.max(0.6, share)}%` } : { left: "50%", width: `${Math.max(0.6, share)}%` }}
        />
      ) : null}
    </span>
  );
}

function BarLine({ label, value, max, fill, strong }: { label: string; value: number | null; max: number; fill: string; strong?: boolean }) {
  return (
    <span className="grid grid-cols-[5.25rem_minmax(0,1fr)_3.5rem] items-center gap-2">
      <span className={`whitespace-nowrap text-[12.5px] leading-4 ${strong ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>{label}</span>
      <Diverging value={value} max={max} fill={fill} />
      <span className={`${NUM} text-right text-[13px] leading-4 ${strong ? "font-medium" : ""} ${value === null ? "text-oa-muted-fg" : value < 0 ? "text-signal-bearish" : value > 0 ? "text-signal-bullish" : "text-oa-muted-fg"}`}>
        {value === null ? "n/a" : signedPct(value)}
      </span>
    </span>
  );
}

/** Rounded up to a tidy scale so the bars do not jump between round numbers. */
function niceMax(values: number[]): number {
  const top = Math.max(1, ...values.map((value) => Math.abs(value)));
  const step = top > 40 ? 20 : top > 20 ? 10 : 5;
  return Math.ceil(top / step) * step;
}

function Summary({ result, max, subject }: { result: EpisodeResult; max: number; subject: string }) {
  const { episode } = result;
  const compare = ratioShort(result);
  const partial = result.portfolio !== null && result.moves.some((move) => move.status !== "ok");
  return (
    <span className="grid grid-cols-1 gap-x-6 gap-y-2 pr-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_10.5rem] lg:items-center lg:pr-6">
      <span className="block min-w-0">
        <span className="block text-[15px] font-medium leading-5 text-oa-fg">{episodeTitle(episode)}</span>
        <span className={`${NUM} mt-0.5 block text-[12.5px] leading-4 text-oa-muted-fg`}>
          {windowWords(episode.start, episode.end)} · {lengthWords(episode.start, episode.end)}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <BarLine label={subject} value={result.portfolio} max={max} fill={result.portfolio === null ? "" : fillFor(result.portfolio)} strong />
        <BarLine label="S&P 500" value={result.market} max={max} fill={MARKET_FILL} />
      </span>
      <span className="block min-w-0 text-[12.5px] leading-4 text-oa-muted-fg lg:text-right">
        {result.portfolio === null ? (
          <span>{noFigureShort(result)}</span>
        ) : (
          <>
            {compare ? <span className="text-oa-fg">{compare}</span> : null}
            {partial ? (
              <span className="lg:block">
                {compare ? <span className="lg:hidden"> · </span> : null}
                covers {coveredPct(result)}% of it
              </span>
            ) : null}
          </>
        )}
      </span>
    </span>
  );
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function notTradingWords(move: HoldingMove): string {
  if (move.status === "not-yet") return move.firstDate ? `Not trading until ${fmtDay(move.firstDate, true)}` : "Not trading yet";
  return move.firstDate ? "No prices around these dates" : "We have no price history for it";
}

function MoveRow({ move, max, tag }: { move: HoldingMove; max: number; tag: string | null }) {
  return (
    <li className="relative grid grid-cols-[minmax(0,1fr)_3.75rem] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(0,16rem)_3.5rem_minmax(0,1fr)_4rem]">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <Ticker symbol={move.ticker} name={move.name} size={18} stretch wrap />
        {tag ? (
          <span className={`shrink-0 rounded-[3px] px-1 text-[11px] font-medium leading-4 ${tag === "Worst" ? "bg-[color-mix(in_srgb,var(--signal-bearish)_14%,transparent)] text-signal-bearish" : "bg-[color-mix(in_srgb,var(--signal-bullish)_14%,transparent)] text-signal-bullish"}`}>
            {tag}
          </span>
        ) : null}
      </div>
      <span className={`${NUM} hidden text-right text-[12.5px] text-oa-muted-fg sm:block`}>
        {move.weight >= 0.5 ? `${Math.round(move.weight)}%` : "<1%"}
      </span>
      {move.pct === null ? (
        <span className="col-span-2 text-[12.5px] leading-4 text-oa-muted-fg sm:col-span-2 sm:text-right">{notTradingWords(move)}</span>
      ) : (
        <>
          <span className="order-last col-span-2 sm:order-none sm:col-span-1">
            <Diverging value={move.pct} max={max} fill={fillFor(move.pct)} height="h-2" />
          </span>
          <span className={`${NUM} text-right text-[13px] ${move.pct < 0 ? "text-signal-bearish" : move.pct > 0 ? "text-signal-bullish" : "text-oa-muted-fg"}`}>
            {signedPct(move.pct)}
          </span>
        </>
      )}
    </li>
  );
}

function Detail({ result, subject }: { result: EpisodeResult; subject: string }) {
  const sentence = episodeSentence(result, subject);
  const rally = result.episode.kind === "rise";
  const ok = result.moves.filter((move) => move.pct !== null);
  const max = niceMax(ok.map((move) => move.pct!));
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[46rem] text-pretty text-[14px] leading-5 text-oa-muted-fg">{result.episode.what}</p>
      {sentence ? <p className="max-w-[46rem] text-pretty text-[14px] leading-5 text-oa-fg">{sentence}</p> : null}
      <div className="mt-1 hidden grid-cols-[minmax(0,16rem)_3.5rem_minmax(0,1fr)_4rem] gap-x-3 text-[11.5px] uppercase tracking-[0.06em] text-oa-muted-fg sm:grid">
        <span>Holding</span>
        <span className="text-right">Weight</span>
        <span className="text-center">Move over the window</span>
        <span className="text-right">Return</span>
      </div>
      <ul className="divide-y divide-oa-border border-y border-oa-border">
        {result.moves.map((move) => (
          <MoveRow
            key={move.ticker}
            move={move}
            max={max}
            tag={result.worst && move === result.worst && move.pct! < 0 ? "Worst" : result.best && move === result.best && ok.length > 1 ? (rally ? "Best" : "Held up best") : null}
          />
        ))}
      </ul>
    </div>
  );
}

export function StressView({
  result,
  read,
  example,
  historyFirst,
}: {
  result: StressResult;
  read: TheReadData | null;
  example: boolean;
  historyFirst: string | null;
}) {
  const values = result.episodes.flatMap((item) => [item.portfolio, item.market]).filter((value): value is number => value !== null);
  const max = niceMax(values);
  const subject = example ? "Portfolio" : "Yours";
  return (
    <div className="flex flex-col gap-3">
      <TheRead
        read={read ? { ...read, source: "Real closes from each episode, dividends included. This is history, not a forecast." } : null}
        label={example ? "How this portfolio did in past market shocks" : "How your portfolio did in past market shocks"}
        fold="phone"
      />
      <Panel
        flush
        label={`${countWord(result.episodes.length)} real market episodes`}
        right={
          <span className="hidden items-center gap-3 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex h-2.5 w-3 overflow-hidden rounded-[2px]">
                <span className="w-1/2 bg-signal-bearish" />
                <span className="w-1/2 bg-signal-bullish" />
              </span>
              {subject}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`inline-block h-2.5 w-3 rounded-[2px] ${MARKET_FILL}`} />
              S&amp;P 500
            </span>
          </span>
        }
      >
        <ul>
          {result.episodes.map((item) => (
            <EpisodeToggle key={item.episode.id} id={item.episode.id} summary={<Summary result={item} max={max} subject={subject} />}>
              <Detail result={item} subject={example ? "this portfolio" : "your portfolio"} />
            </EpisodeToggle>
          ))}
        </ul>
      </Panel>
      <Notes result={result} example={example} historyFirst={historyFirst} />
    </div>
  );
}

function Notes({ result, example, historyFirst }: { result: StressResult; example: boolean; historyFirst: string | null }) {
  const lines: React.ReactNode[] = [];
  lines.push(
    <>
      Each holding is held at {example ? "this portfolio's" : "your"} weights today from the first close of an episode to its last, and the S&amp;P 500 is
      SPY over the same closes.{" "}
      {example
        ? "These stocks were picked knowing how they have done since, so a past episode can flatter them."
        : "You picked these stocks knowing how they have done since, so a past episode can flatter them."}
    </>,
  );
  if (result.basis === "count") lines.push(<>None of these holdings has a share count, so each one counts the same.</>);
  if (result.unvalued.length > 0) {
    lines.push(
      <>
        {result.unvalued.join(", ")} {result.unvalued.length === 1 ? "has" : "have"} no share count, so {result.unvalued.length === 1 ? "it is" : "they are"} left out.{" "}
        <Link href="/watchlist" className="font-medium text-oa-primary hover:underline">
          Add share counts in Portfolio
        </Link>
      </>,
    );
  }
  if (historyFirst) lines.push(<>Our daily price history starts on {fmtDay(historyFirst, true)}, so older crashes are not here.</>);
  return (
    <div className="flex flex-col gap-1 px-2 text-[13px] leading-5 text-oa-muted-fg sm:px-0">
      {lines.map((line, index) => (
        <p key={index} className="max-w-[52rem] text-pretty">
          {line}
        </p>
      ))}
    </div>
  );
}
