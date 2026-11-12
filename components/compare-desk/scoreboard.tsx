import * as React from "react";

import { NUM, Panel } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { Scoreboard, ScoreRow } from "@/lib/compare-shared";

/**
 * "Where they differ" as a head-to-head scoreboard (owner, Nov 12: "i cant tell what this means like who is winning in
 * what and how"). Each stock keeps its side, the winner's figure is bold on a tinted pill and the loser's is muted, and a
 * thin bar from the middle shows how far apart they are. Which end wins each row lives in lib/compare-shared.ts
 * (SCORE_METRICS). Logos sit in the header only (owner rule 1). Three or four stocks get the same rows as columns.
 */

const WIN_PILL = "rounded-[5px] bg-[color-mix(in_srgb,var(--signal-bullish)_18%,transparent)] px-1.5 font-semibold text-oa-fg";
const TRACK = "bg-[color-mix(in_srgb,var(--oa-muted-fg)_10%,transparent)]";
const WIN_BAR = "bg-[color-mix(in_srgb,var(--signal-bullish)_75%,transparent)]";
const LOSE_BAR = "bg-[color-mix(in_srgb,var(--oa-muted-fg)_32%,transparent)]";
const EVEN_BAR = "bg-[color-mix(in_srgb,var(--oa-muted-fg)_50%,transparent)]";
// A loss, a shrink or debt that is not the winner reads as below zero, so its long bar is never mistaken for a lead.
const NEGATIVE_BAR = "bg-[color-mix(in_srgb,var(--signal-bearish)_45%,transparent)]";

/** What the row says, for a screen reader: "Sales growth, 1 yr: AMD +42%, AVGO +49%. AVGO is ahead." */
function spoken(row: ScoreRow): string {
  const values = row.cells.map((cell) => `${cell.symbol} ${cell.text}`).join(", ");
  const winner = row.winner >= 0 ? ` ${row.cells[row.winner]!.symbol} is ahead.` : "";
  const reference = row.reference ? ` ${row.reference.label} ${row.reference.text}.` : "";
  return `${row.label}: ${values}.${winner}${reference}`;
}

/** The row's hover title: why it matters, plus the S&P 500's figure where the bar carries its tick. */
function hoverTitle(row: ScoreRow): string {
  return row.reference ? `${row.hint} · ${row.reference.label} ${row.reference.text}` : row.hint;
}

function Figure({ row, index, side }: { row: ScoreRow; index: number; side?: "left" | "right" }) {
  const cell = row.cells[index]!;
  const won = row.winner === index;
  const lost = row.winner >= 0 && !won;
  const word = side && row.word?.index === index ? row.word.text : null;
  const wordNode = word ? <span className="text-[11.5px] font-normal text-oa-muted-fg">{word}</span> : null;
  return (
    <span
      className={`${NUM} inline-flex items-baseline gap-1 whitespace-nowrap text-[14.5px] leading-6 sm:text-[15px] ${
        won ? WIN_PILL : lost ? "text-oa-muted-fg" : "text-oa-fg"
      }`}
    >
      {/* The figure sits on the outer edge of its side, the word inside it, so both sides read from the middle. */}
      {side === "right" ? wordNode : null}
      {cell.text}
      {side === "left" ? wordNode : null}
    </span>
  );
}

function Bar({ row }: { row: ScoreRow }) {
  const halves: Array<{ index: number; side: "left" | "right" }> = [
    { index: 0, side: "left" },
    { index: 1, side: "right" },
  ];
  return (
    <div aria-hidden="true" className="mt-1 grid grid-cols-2 gap-[3px]">
      {halves.map(({ index, side }) => {
        const cell = row.cells[index]!;
        const tone = row.winner === index ? WIN_BAR : cell.value < 0 ? NEGATIVE_BAR : row.winner < 0 ? EVEN_BAR : LOSE_BAR;
        // The S&P 500's tick only on a side of the same sign: bars are sizes, so a fall past a rise's tick would read as a beat.
        const tick = row.reference && (row.reference.value >= 0) === (cell.value >= 0) ? row.reference.share : null;
        // A figure that is not zero always shows a sliver of bar.
        const width = cell.share > 0 ? Math.max(cell.share, 0.02) * 100 : 0;
        const edge = side === "left" ? "rounded-l-full" : "rounded-r-full";
        return (
          <div key={side} className={`relative flex h-[5px] ${side === "left" ? "justify-end" : "justify-start"} ${edge} ${TRACK}`}>
            <span className={`h-full ${edge} ${tone}`} style={{ width: `${width}%` }} />
            {tick !== null ? (
              <span
                className="absolute -top-[3px] h-[11px] w-[1.5px] rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_55%,transparent)]"
                style={side === "left" ? { right: `calc(${tick * 100}% - 0.75px)` } : { left: `calc(${tick * 100}% - 0.75px)` }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Pair({ board }: { board: Scoreboard }) {
  const [left, right] = board.symbols as [string, string];
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
        <span className="inline-flex items-center gap-2">
          <StockLogo ticker={left} size={20} />
          <span className={`${NUM} text-[15px] font-medium text-oa-fg`}>{left}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`${NUM} text-[15px] font-medium text-oa-fg`}>{right}</span>
          <StockLogo ticker={right} size={20} />
        </span>
      </div>
      <ul className="flex flex-1 flex-col">
        {board.rows.map((row) => (
          <li key={row.id} title={hoverTitle(row)} className="flex flex-1 flex-col justify-center border-b border-oa-border px-4 py-2 last:border-b-0">
            <span className="sr-only">{spoken(row)}</span>
            <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
              <span className="justify-self-start">
                <Figure row={row} index={0} side="left" />
              </span>
              <span className="max-w-[8.5rem] text-balance text-center text-[12.5px] leading-4 text-oa-muted-fg sm:max-w-[15rem] sm:text-[13px]">{row.label}</span>
              <span className="justify-self-end">
                <Figure row={row} index={1} side="right" />
              </span>
            </div>
            <Bar row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Three or four stocks: the measure on the left, one column per stock, the winner on its pill. */
function Grid({ board }: { board: Scoreboard }) {
  const cols = { gridTemplateColumns: `minmax(0,1.35fr) repeat(${board.symbols.length}, minmax(0,1fr))` };
  return (
    <>
      <div className="grid items-center gap-x-2 border-b border-oa-border px-4 py-2" style={cols}>
        <span />
        {board.symbols.map((symbol) => (
          <span key={symbol} className="inline-flex min-w-0 items-center justify-end gap-1.5">
            <StockLogo ticker={symbol} size={18} />
            <span className={`${NUM} truncate text-[13.5px] font-medium text-oa-fg`}>{symbol}</span>
          </span>
        ))}
      </div>
      <ul className="flex flex-1 flex-col">
        {board.rows.map((row) => (
          <li key={row.id} title={hoverTitle(row)} className="flex flex-1 flex-col justify-center border-b border-oa-border px-4 py-2 last:border-b-0">
            <span className="sr-only">{spoken(row)}</span>
            <div aria-hidden="true" className="grid items-center gap-x-2" style={cols}>
              <span className="text-[12.5px] leading-4 text-oa-muted-fg sm:text-[13px]">{row.label}</span>
              {row.cells.map((cell, index) => (
                <span key={cell.symbol} className="justify-self-end">
                  <Figure row={row} index={index} />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ScoreboardPanel({ board }: { board: Scoreboard }) {
  return (
    <Panel flush fill label="Where they differ" right={board.tally ? <span className="font-medium text-oa-fg">{board.tally}</span> : undefined}>
      {board.symbols.length === 2 ? <Pair board={board} /> : <Grid board={board} />}
    </Panel>
  );
}
