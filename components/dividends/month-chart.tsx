import { NUM, Panel } from "@/components/oa/kit";
import { fmtDollars, joinNames, monthName, monthShort, type MonthBucket } from "@/lib/dividend-plan";

/**
 * Twelve bars, one per month: announced money (solid copper) under estimated
 * money (hatched copper). The texture keeps the two apart without colour, in
 * print and for colour-blind readers. Hover or focus a bar for the split.
 */

const CONFIRMED_FILL = "bg-oa-primary";
// The estimate is the same copper, lighter and striped, so "estimate" never reads as a second kind of money.
const ESTIMATE_STYLE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in srgb, var(--oa-primary) 55%, transparent) 0 2px, color-mix(in srgb, var(--oa-primary) 16%, transparent) 2px 6px)",
};

function LegendSwatch({ kind }: { kind: "confirmed" | "estimate" }) {
  return kind === "confirmed" ? (
    <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-[2px] ${CONFIRMED_FILL}`} />
  ) : (
    <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px]" style={ESTIMATE_STYLE} />
  );
}

export function MonthChart({ months, label = "The next 12 months" }: { months: MonthBucket[]; label?: string }) {
  const max = Math.max(...months.map((m) => m.total), 0);
  // Months that tie to the dollar are all the biggest; each gets its label.
  const most = Math.round(max);
  return (
    <Panel
      label={label}
      right={
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch kind="confirmed" />
            Announced
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LegendSwatch kind="estimate" />
            Estimate
          </span>
        </span>
      }
    >
      {max <= 0 ? (
        <p className="py-6 text-center text-[14px] text-oa-muted-fg">No payments are expected in these twelve months.</p>
      ) : (
        <ol className="grid grid-cols-12 gap-1 sm:gap-2" aria-label="Expected dividends by month">
          {months.map((month, index) => {
            const totalPct = (month.total / max) * 100;
            const confirmedShare = month.total > 0 ? (month.confirmed / month.total) * 100 : 0;
            const isTop = max > 0 && Math.round(month.total) === most;
            const newYear = index > 0 && month.month.endsWith("-01");
            const said = `${monthName(month.month)} ${month.month.slice(0, 4)}: ${
              month.total > 0
                ? `about ${fmtDollars(month.total)}${month.confirmed >= 0.5 ? `, ${fmtDollars(month.confirmed)} announced` : ""}${month.tickers.length ? `, from ${joinNames(month.tickers.slice(0, 4))}` : ""}`
                : "nothing expected"
            }`;
            return (
              <li
                key={month.month}
                role="img"
                tabIndex={0}
                aria-label={said}
                className="group relative flex min-w-0 flex-col items-stretch rounded outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
              >
                <div className="relative h-[148px] sm:h-[180px]">
                  {/* The bar area leaves 20px on top, where the tallest bar's label sits. */}
                  <div className="absolute inset-x-0 bottom-0 top-5 flex flex-col justify-end">
                  {month.total > 0 ? (
                    <span
                      className={`${NUM} -mx-4 mb-1 block shrink-0 whitespace-nowrap text-center text-[11px] leading-4 text-oa-muted-fg sm:text-[12.5px] ${isTop ? "font-medium text-oa-fg" : "max-sm:invisible"}`}
                    >
                      {fmtDollars(month.total)}
                    </span>
                  ) : null}
                  {month.total > 0 ? (
                    <div className="flex shrink-0 flex-col gap-[2px] transition-opacity group-hover:opacity-90" style={{ height: `${Math.max(totalPct, 2)}%` }}>
                      {month.estimated > 0 ? (
                        <div className="min-h-[2px] rounded-t-[4px]" style={{ ...ESTIMATE_STYLE, flexGrow: 100 - confirmedShare, flexBasis: 0 }} />
                      ) : null}
                      {month.confirmed > 0 ? (
                        <div
                          className={`min-h-[2px] ${CONFIRMED_FILL} ${month.estimated > 0 ? "" : "rounded-t-[4px]"}`}
                          style={{ flexGrow: confirmedShare, flexBasis: 0 }}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-px bg-oa-border" />
                  )}
                  </div>
                </div>
                <span
                  className={`${NUM} mt-1.5 block border-t border-oa-border pt-1 text-center text-[11px] leading-4 sm:text-[12.5px] ${newYear ? "text-oa-fg" : "text-oa-muted-fg"}`}
                >
                  {monthShort(month.month)}
                  {newYear ? <span className="max-sm:hidden"> &apos;{month.month.slice(2, 4)}</span> : null}
                </span>
                {/* The split, on hover or focus: beside the bar, inside the chart, so the panel edge never clips it. */}
                <div
                  role="presentation"
                  className={`pointer-events-none absolute top-0 z-10 hidden w-max max-w-[11rem] sm:max-w-[15rem] rounded-md border border-oa-border bg-oa-card px-3 py-2 text-left shadow-sm group-hover:block group-focus:block ${
                    index < 6 ? "left-full ml-1" : "right-full mr-1"
                  }`}
                >
                  <p className="text-[13px] font-medium text-oa-fg">
                    {monthName(month.month)} {month.month.slice(0, 4)}
                  </p>
                  {month.total > 0 ? (
                    <>
                      {month.confirmed > 0 ? (
                        <p className={`${NUM} mt-1 flex items-center gap-1.5 text-[12.5px] text-oa-fg`}>
                          <LegendSwatch kind="confirmed" /> Announced {fmtDollars(month.confirmed)}
                        </p>
                      ) : null}
                      {month.estimated > 0 ? (
                        <p className={`${NUM} flex items-center gap-1.5 text-[12.5px] text-oa-fg ${month.confirmed > 0 ? "" : "mt-1"}`}>
                          <LegendSwatch kind="estimate" /> Estimate {fmtDollars(month.estimated)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">From {joinNames(month.tickers.slice(0, 5))}{month.tickers.length > 5 ? ` and ${month.tickers.length - 5} more` : ""}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-oa-muted-fg">Nothing expected</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
