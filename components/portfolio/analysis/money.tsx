import type { AttributionModule, LeanFigure, LeanModule } from "@/lib/portfolio-analysis/types";
import { PairBar } from "@/components/oa/kit/tone";

import { RowsFold } from "./rows-fold";
import { CARD, FigureStrip, Module, NUM, SPAN, Tick, signedPct, signedPts, toneClass } from "./parts";

/** Rows each list shows while folded: RowsFold hides `li:nth-child(n+7)`, so the two must change together. */
const FOLD_ROWS = 6;

/** Longest first: this year, then three months, then the last month. */
const WINDOW_ORDER = { ytd: 0, "3m": 1, "1m": 2 } as const;

/**
 * What made the money: this year, 3 months and 1 month at today's weights, a third of the row each, with who earned
 * it: six names each, then one "Show N more" under all three (a card list never scrolls inside its box).
 */
export function MadeTheMoney({ module }: { module: AttributionModule }) {
  const windows = [...module.windows].sort((a, b) => WINDOW_ORDER[a.key] - WINDOW_ORDER[b.key]);
  // One "Show N more" under the three (owner rule 1), counting every row folded away.
  const more = windows.reduce((sum, window) => sum + Math.max(0, window.rows.length - FOLD_ROWS), 0);
  return (
    <Module id="made" title="What made the money, at today's mix">
      <RowsFold more={more}>
      {windows.map((window) => (
        // The three end level (self-stretch): a window with a name or two fewer only ends a row short inside its card.
        <div key={window.key} className={`${CARD} ${SPAN[4]} lg:self-stretch`}>
          <div className="flex flex-col gap-1 border-b border-oa-border px-4 py-3">
            <p className="text-[12.5px] leading-4 text-oa-muted-fg">{window.label}</p>
            <p className={`${NUM} text-[28px] font-medium leading-9 ${toneClass(window.book)}`}>{signedPct(window.book)}</p>
            {window.sp !== null ? (
              <PairBar value={window.book} versus={window.sp} labels={["Mix", "S&P"]} texts={[signedPct(window.book), signedPct(window.sp)]} className="mt-1 w-full" />
            ) : null}
          </div>
          <div className="px-4 py-2">
            <ul aria-label={`Who made the money, ${window.label.toLowerCase()}`} className="oa-fold-rows">
              {window.rows.map((row) => (
                <li key={row.ticker} className="grid h-8 grid-cols-[minmax(0,1fr)_3.75rem_4.5rem] items-center gap-2">
                  <Tick ticker={row.ticker} />
                  <span className={`${NUM} text-right text-[12px] text-oa-muted-fg`}>{signedPct(row.ret, 0)}</span>
                  <span className={`${NUM} text-right text-[13px] ${toneClass(row.contribution)}`}>{signedPts(row.contribution)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
      </RowsFold>
    </Module>
  );
}

function shown(figure: LeanFigure, value: number): string {
  if (figure.unit === "x") return `${value.toFixed(0)}x`;
  if (figure.key === "gap6m") return signedPct(value);
  if (figure.key === "yield") return `${value.toFixed(2)}%`;
  return `${value.toFixed(figure.key === "giants" ? 0 : 1).replace(/^-/, "−")}%`;
}

/** The six months first: the gap to the index is the one number that says ahead or behind. */
const LEAN_ORDER: Record<LeanFigure["key"], number> = { gap6m: 0, pe: 1, growth: 2, margin: 3, giants: 4, yield: 5 };

/** Against the S&P 500: six figures in one divided card, each drawn against the index's own as two bars (owner VISUALS CHECK). */
export function AgainstTheMarket({ module, example }: { module: LeanModule; example: boolean }) {
  const subject = example ? "this mix" : "your mix";
  const figures = [...module.figures].sort((a, b) => LEAN_ORDER[a.key] - LEAN_ORDER[b.key]);
  // Short names, so the two bars keep their room in a narrow cell; the module title says what "Mix" is.
  const names: [string, string] = ["Mix", "S&P"];
  return (
    <Module id="against" title={`What ${subject} is made of`}>
      <FigureStrip
        label={`What ${subject} is made of, against the S&P 500`}
        className={SPAN[12]}
        cols={`grid-cols-2 lg:grid-cols-3 ${figures.length >= 6 ? "2xl:grid-cols-6" : ""}`}
        cells={figures.map((figure) => {
          const pair =
            figure.sp !== null
              ? {
                  value: figure.book,
                  versus: figure.sp,
                  labels: names,
                  texts: [shown(figure, figure.book), shown(figure, figure.sp)] as [string, string],
                }
              : undefined;
          return figure.key === "gap6m" && figure.sp !== null
            ? { key: figure.key, label: "6 months vs S&P 500", figure: signedPts(figure.book - figure.sp), tone: figure.book - figure.sp, pair }
            : { key: figure.key, label: figure.label, figure: shown(figure, figure.book), pair };
        })}
      />
    </Module>
  );
}
