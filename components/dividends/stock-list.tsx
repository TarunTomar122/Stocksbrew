import { NUM, Panel, ShowMore, Tag, Ticker } from "@/components/oa/kit";
import {
  AT_RISK_PAYOUT,
  fmtDollars,
  fmtPerShare,
  fmtPlanDay,
  joinNames,
  type DividendFrequency,
  type PlannedPayment,
  type StockPlan,
} from "@/lib/dividend-plan";

/**
 * Every holding that pays, one row each: how often, the next payment, the
 * twelve-month total and the yields. Open a row for its payment dates. The
 * stocks we cannot plan sit under the table in plain sentences.
 */

const HOW_OFTEN: Record<DividendFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Once a year",
  irregular: "Irregular",
  none: "",
};

/** Rows shown before the fold on phones and tablets. */
const FIRST_ROWS = 3;

function pct(value: number | null, digits = 2): string {
  return value == null ? "" : `${value.toFixed(digits)}%`;
}

function money(value: number | null): string {
  return value == null ? "" : fmtDollars(value);
}

function NextLine({ payment }: { payment: PlannedPayment | null }) {
  if (!payment) return <span className="text-oa-muted-fg">Nothing else in the next 12 months</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className={NUM}>{fmtPlanDay(payment.payDate)}</span>
      <span className="text-oa-muted-fg">{payment.status === "confirmed" ? "announced" : "estimate"}</span>
    </span>
  );
}

function PaymentRows({ stock }: { stock: StockPlan }) {
  return (
    <ul className="divide-y divide-oa-border border-t border-oa-border bg-oa-bg/60">
      {stock.payments.map((payment, index) => (
        <li key={`${payment.exDate}-${payment.status}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-[13px] xl:grid-cols-[9rem_8rem_minmax(0,1fr)_7rem]">
          <span className="text-oa-fg">
            {payment.paid ? (payment.payDateKnown ? "Paid" : "Likely paid") : "Pays"} <span className={NUM}>{payment.payDateKnown ? "" : "about "}{fmtPlanDay(payment.payDate)}</span>
          </span>
          <span className="justify-self-end xl:justify-self-start">
            <Tag tone={payment.status === "confirmed" ? "primary" : "neutral"} caps={false}>
              {payment.status === "confirmed" ? "Announced" : "Estimate"}
            </Tag>
          </span>
          <span className="text-oa-muted-fg">
            Ex-dividend <span className={NUM}>{fmtPlanDay(payment.exDate)}</span> · <span className={NUM}>{fmtPerShare(payment.perShare)}</span> a share
            {payment.special ? ", a one-off special dividend" : ""}
          </span>
          <span className={`${NUM} justify-self-end text-oa-fg`}>{money(payment.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function StockRow({ stock }: { stock: StockPlan }) {
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_5.5rem_5.5rem_7.5rem] [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="text-[11px] text-oa-muted-fg transition-transform group-open:rotate-90">
              ▸
            </span>
            <Ticker symbol={stock.ticker} name={stock.name} href={null} wrap />
          </span>
          <span className={`${NUM} justify-self-end text-[14px] font-medium text-oa-fg xl:order-4`}>{money(stock.income) || "n/a"}</span>
          <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-[13px] text-oa-muted-fg xl:contents xl:pl-0">
            <span className="text-oa-fg xl:order-2 xl:text-[14px]">{HOW_OFTEN[stock.frequency] || "Irregular"}</span>
            <span className="xl:order-3 xl:text-[14px]">
              <NextLine payment={stock.next} />
            </span>
            <span className={`${NUM} xl:order-5 xl:justify-self-end xl:text-[14px] xl:text-oa-fg`}>
              <span className="xl:hidden">Yield </span>
              {pct(stock.yieldOnPrice) || "n/a"}
            </span>
            <span className={`${NUM} xl:order-6 xl:justify-self-end xl:text-[14px] xl:text-oa-fg`}>
              {stock.yieldOnCost != null ? (
                <>
                  <span className="xl:hidden">On cost </span>
                  {pct(stock.yieldOnCost)}
                </>
              ) : (
                <span className="max-xl:hidden text-oa-muted-fg">n/a</span>
              )}
            </span>
            <span className="xl:order-7 xl:justify-self-end">
              {stock.payout != null ? (
                stock.atRisk ? (
                  <Tag tone="down" caps={false}>
                    {stock.payout < 0 ? "Losing money" : `${Math.round(stock.payout)}%, at risk`}
                  </Tag>
                ) : (
                  <span className={`${NUM} xl:text-[14px] xl:text-oa-fg`}>
                    <span className="xl:hidden">Payout </span>
                    {Math.round(stock.payout)}%
                  </span>
                )
              ) : (
                <span className="max-xl:hidden text-oa-muted-fg">n/a</span>
              )}
            </span>
          </span>
        </summary>
        {stock.atRisk ? (
          <p className="border-t border-oa-border px-4 py-2 text-[13px] leading-5 text-signal-bearish">
            {stock.payout != null && stock.payout < 0
              ? `${stock.name} is paying a dividend while losing money, so this payment is at risk.`
              : `${stock.name} pays out ${Math.round(stock.payout ?? 0)}% of its earnings, above the ${AT_RISK_PAYOUT}% line where a dividend has little room if profits fall.`}
          </p>
        ) : null}
        <PaymentRows stock={stock} />
      </details>
    </li>
  );
}

export function StockList({ stocks, example = false }: { stocks: StockPlan[]; example?: boolean }) {
  const paying = stocks.filter((s) => s.payments.length > 0);
  const none = stocks.filter((s) => s.payments.length === 0 && s.status === "no_dividend").map((s) => s.ticker);
  const stopped = stocks.filter((s) => s.payments.length === 0 && s.status === "stopped");
  const quiet = stocks.filter((s) => s.payments.length === 0 && s.status === "irregular");
  const fresh = quiet.filter((s) => s.paymentsOnRecord === 1);
  const irregular = quiet.filter((s) => s.paymentsOnRecord !== 1).map((s) => s.ticker);
  const unknown = stocks.filter((s) => s.payments.length === 0 && s.status === "no_history").map((s) => s.ticker);
  const notes: string[] = [];
  if (none.length) notes.push(`${joinNames(none)} ${none.length === 1 ? "pays" : "pay"} no dividend.`);
  for (const s of stopped) notes.push(`${s.ticker} has not paid a dividend since ${s.lastExDate ? fmtPlanDay(s.lastExDate) + `, ${s.lastExDate.slice(0, 4)}` : "last year"}, so nothing is expected from it.`);
  for (const s of fresh) notes.push(`${s.ticker} paid its first dividend${s.lastExDate ? ` in ${fmtPlanDay(s.lastExDate)}, ${s.lastExDate.slice(0, 4)}` : ""}, which is too soon to know its schedule.`);
  if (irregular.length) notes.push(`${joinNames(irregular)} ${irregular.length === 1 ? "pays" : "pay"} at irregular times, so we do not guess a schedule.`);
  if (unknown.length) notes.push(`We have no dividend records for ${joinNames(unknown)} yet.`);
  const noShares = paying.some((s) => s.shares == null);

  return (
    <Panel label={`By stock · ${paying.length} ${paying.length === 1 ? "pays" : "pay"} in these months`} flush>
      {paying.length > 0 ? (
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_5.5rem_5.5rem_7.5rem] gap-x-3 border-b border-oa-border px-4 py-2 xl:grid">
          {["Stock", "How often", "Next payment", "12 months", "Yield", "On cost", "Payout"].map((head, index) => (
            <span key={head} className={`oa-caption ${index >= 3 ? "justify-self-end" : ""} ${index === 0 ? "pl-5" : ""}`}>
              {head}
            </span>
          ))}
        </div>
      ) : null}
      {/* The biggest payers always show; on smaller screens the rest wait behind one button. */}
      <ul className="divide-y divide-oa-border">
        {paying.slice(0, FIRST_ROWS).map((stock) => (
          <StockRow key={stock.ticker} stock={stock} />
        ))}
      </ul>
      {paying.length > FIRST_ROWS ? (
        <ShowMore
          label={`Show ${paying.length - FIRST_ROWS} more ${paying.length - FIRST_ROWS === 1 ? "stock" : "stocks"}`}
          less="Show fewer"
          className="[&>button]:mx-3 [&>button]:mb-3 [&>button]:w-[calc(100%-1.5rem)]"
        >
          <ul className="divide-y divide-oa-border border-t border-oa-border">
            {paying.slice(FIRST_ROWS).map((stock) => (
              <StockRow key={stock.ticker} stock={stock} />
            ))}
          </ul>
        </ShowMore>
      ) : null}
      {notes.length > 0 || noShares ? (
        <div className="flex flex-col gap-1 border-t border-oa-border px-4 py-3 text-[13px] leading-5 text-oa-muted-fg">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
          {noShares && !example ? <p>Stocks without a share count show their yield but no dollar amount.</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
