import type { AttributionModule, LeanFigure, LeanModule } from "@/lib/portfolio-analysis/types";

import { CARD, FigureCard, LIST, Module, NUM, Tick, signedPct, signedPts, toneClass } from "./parts";

/** What made the money: 1 month, 3 months and this year at today's weights, each with who earned it. */
export function MadeTheMoney({ module }: { module: AttributionModule }) {
  return (
    <Module id="made" title="What made the money, at today's mix">
      {module.windows.map((window) => (
        <div key={window.key} className={`${CARD}`}>
          <div className="flex flex-col gap-1 border-b border-oa-border px-4 py-3">
            <p className="text-[12.5px] leading-4 text-oa-muted-fg">{window.label}</p>
            <p className={`${NUM} text-[28px] font-medium leading-9 ${toneClass(window.book)}`}>{signedPct(window.book)}</p>
            {window.sp !== null ? <p className="text-[13px] leading-[18px] text-oa-muted-fg">The S&amp;P 500: {signedPct(window.sp)}</p> : null}
          </div>
          <ul className={`${LIST} px-4 py-2`}>
            {window.rows.map((row) => (
              <li key={row.ticker} className="grid h-8 grid-cols-[minmax(0,1fr)_3.75rem_4.5rem] items-center gap-2">
                <Tick ticker={row.ticker} />
                <span className={`${NUM} text-right text-[12px] text-oa-muted-fg`}>{signedPct(row.ret, 0)}</span>
                <span className={`${NUM} text-right text-[13px] ${toneClass(row.contribution)}`}>{signedPts(row.contribution)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Module>
  );
}

function shown(figure: LeanFigure, value: number): string {
  if (figure.unit === "x") return `${value.toFixed(0)}x`;
  if (figure.key === "gap6m") return signedPct(value);
  if (figure.key === "yield") return `${value.toFixed(2)}%`;
  return `${value.toFixed(figure.key === "giants" ? 0 : 1).replace(/^-/, "−")}%`;
}

/** Against the S&P 500: six figures, each with the index's own beside it. */
export function AgainstTheMarket({ module, example }: { module: LeanModule; example: boolean }) {
  const subject = example ? "this mix" : "your mix";
  return (
    <Module id="against" title={`What ${subject} is made of`}>
      {module.figures.map((figure) =>
        // The six months read as the gap to the index, the one number that says ahead or behind.
        figure.key === "gap6m" && figure.sp !== null ? (
          <FigureCard
            key={figure.key}
            label="Last 6 months, against the S&P 500"
            figure={signedPts(figure.book - figure.sp)}
            tone={figure.book - figure.sp}
            line={`${subject.replace(/^./, (c) => c.toUpperCase())} ${signedPct(figure.book)}, the S&P 500 ${signedPct(figure.sp)}`}
          />
        ) : (
          <FigureCard
            key={figure.key}
            label={figure.label}
            figure={shown(figure, figure.book)}
            line={figure.sp !== null ? `The S&P 500: ${shown(figure, figure.sp)}` : undefined}
          />
        ),
      )}
    </Module>
  );
}
