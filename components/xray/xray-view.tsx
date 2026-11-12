import Link from "next/link";
import * as React from "react";

import { CardGrid, NUM, Panel, StatStrip, Ticker, fmtCompact } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { CompanyTable, type CompanyLine } from "@/components/xray/company-table";
import { shortCompanyName } from "@/lib/plain-copy";
import { XraySignIn } from "@/components/xray/xray-sign-in";
import type { TheRead as TheReadData } from "@/lib/insights";
import { fmtFilingDay, fmtPct, joinList, type CompanyExposure, type FundSummary, type Xray } from "@/lib/xray";

/**
 * /portfolio/xray: the read on top, then the ten biggest companies as a
 * stacked bar (bought directly, through funds), sectors and funds side by
 * side, and every company in a table folded underneath.
 */

const TABLE_ROWS = 300;
const DIRECT = "bg-oa-primary";
const VIA = "bg-[color-mix(in_srgb,var(--oa-primary)_32%,transparent)]";

/** "$19.2K", or whole dollars under a thousand ("$244"): cents are noise in an estimate built from fund weights. */
function money(value: number): string {
  return Math.abs(value) < 1000 ? `$${Math.round(value).toLocaleString("en-US")}` : fmtCompact(value, "$");
}

export function XrayView({ xray, read, example }: { xray: Xray; read: TheReadData | null; example: boolean }) {
  const top = xray.companies.slice(0, 10);
  const hasFunds = xray.funds.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <TheRead read={read} label={example ? "What this portfolio really owns" : "What you really own"} fold="phone" askContext={example ? "ex.portfolio" : "portfolio"} />
      {hasFunds ? (
        <StatStrip
          stats={[
            { label: "Valued", value: money(xray.total), sub: `${xray.funds.length === 1 ? "1 fund" : `${xray.funds.length} funds`} and ${plural(directCount(xray), "stock")}` },
            { label: "Bought directly", value: fmtPct(share(xray.directValue, xray.total)), sub: money(xray.directValue) },
            { label: "Through funds", value: fmtPct(share(xray.fundValue, xray.total)), sub: money(xray.fundValue) },
            { label: "Companies", value: xray.companies.length.toLocaleString("en-US"), sub: "after share classes are merged" },
          ]}
        />
      ) : null}
      {top.length > 0 ? <TopCompanies rows={top} /> : null}
      {hasFunds ? (
        <CardGrid cols={2}>
          <Sectors xray={xray} />
          <Funds xray={xray} />
        </CardGrid>
      ) : null}
      {xray.companies.length > 0 ? <EveryCompany xray={xray} /> : null}
      <Notes xray={xray} example={example} />
    </div>
  );
}

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function directCount(xray: Xray): number {
  return xray.companies.filter((row) => row.direct > 0).length;
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[12.5px] text-oa-muted-fg">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-[2px] ${DIRECT}`} />
        Bought directly
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-[2px] ${VIA}`} />
        Through funds
      </span>
    </span>
  );
}

function TopCompanies({ rows }: { rows: CompanyExposure[] }) {
  const max = Math.max(...rows.map((row) => row.pct), 0.0001);
  return (
    <Panel label={rows.length >= 10 ? "Ten biggest companies, funds included" : "Companies, funds included"} right={<span className="max-sm:hidden"><Legend /></span>}>
      <div className="mb-3 sm:hidden">
        <Legend />
      </div>
      <ol className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[15rem_minmax(0,1fr)_4rem]">
            <div className="min-w-0">
              <Ticker symbol={row.ticker} name={row.name} />
            </div>
            <span className={`${NUM} text-right text-[15px] font-medium text-oa-fg sm:order-last`}>{fmtPct(row.pct)}</span>
            <div
              className="col-span-2 flex h-3 overflow-hidden rounded-[3px] bg-oa-bg sm:col-span-1"
              role="img"
              aria-label={barLabel(row)}
            >
              <span className={DIRECT} style={{ width: `${(row.directPct / max) * 100}%` }} />
              <span className={VIA} style={{ width: `${(row.fundPct / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function barLabel(row: CompanyExposure): string {
  if (row.direct > 0 && row.viaFunds > 0) return `${row.name}: ${fmtPct(row.directPct)} bought directly and ${fmtPct(row.fundPct)} through ${joinList(row.via.map((slice) => slice.fund))}`;
  if (row.direct > 0) return `${row.name}: ${fmtPct(row.directPct)}, all bought directly`;
  return `${row.name}: ${fmtPct(row.fundPct)}, all through ${joinList(row.via.map((slice) => slice.fund))}`;
}

function Sectors({ xray }: { xray: Xray }) {
  const rows = xray.sectors;
  const max = Math.max(...rows.map((row) => Math.max(row.pct, row.benchmarkPct ?? 0)), 0.0001);
  const anyBench = rows.some((row) => row.benchmarkPct !== null);
  return (
    <Panel label="By sector, funds included" fill>
      {rows.length === 0 ? (
        <p className="text-[14px] text-oa-muted-fg">We do not have sectors on record for these companies.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.sector} className="grid grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_3.25rem] items-center gap-3">
              <span className="text-pretty text-[14px] leading-5 text-oa-fg">
                {row.sector}
              </span>
              <span className="relative h-2.5 rounded-[3px] bg-oa-bg">
                <span className="absolute inset-y-0 left-0 flex overflow-hidden rounded-[3px]" style={{ width: `${(row.pct / max) * 100}%` }}>
                  <span className={DIRECT} style={{ width: `${share(row.direct, row.value)}%` }} />
                  <span className={VIA} style={{ width: `${share(row.viaFunds, row.value)}%` }} />
                </span>
                {row.benchmarkPct !== null ? (
                  <span
                    aria-hidden="true"
                    className="absolute -inset-y-1 w-[2px] rounded-full bg-oa-fg"
                    style={{ left: `calc(${(row.benchmarkPct / max) * 100}% - 1px)` }}
                  />
                ) : null}
              </span>
              <span className={`${NUM} text-right text-[14px] text-oa-fg`}>{fmtPct(row.pct)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="oa-card-foot mt-auto pt-3 text-[12.5px] leading-[18px] text-oa-muted-fg">
        {anyBench ? (
          <>
            <span aria-hidden="true" className="mr-1 inline-block h-2.5 w-[2px] translate-y-[1px] rounded-full bg-oa-fg" />
            The line is the S&amp;P 500&apos;s weight in that sector.{" "}
          </>
        ) : null}
        {xray.unclassifiedValue > 0 ? `${fmtPct(share(xray.unclassifiedValue, xray.total))} sits in smaller companies we have no sector for.` : null}
      </p>
    </Panel>
  );
}

function Funds({ xray }: { xray: Xray }) {
  return (
    <Panel label="Funds" flush fill>
      <ul className="divide-y divide-oa-border">
        {xray.funds.map((fund) => (
          <FundRow key={fund.ticker} fund={fund} />
        ))}
      </ul>
      {xray.overlaps.length > 0 ? (
        <div className="oa-card-foot mt-auto border-t border-oa-border px-4 py-3">
          <p className="oa-caption mb-1.5">How much the funds overlap</p>
          <ul className="flex flex-col gap-1">
            {xray.overlaps.slice(0, 4).map((pair) => (
              <li key={`${pair.a}-${pair.b}`} className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="text-oa-fg">
                  <span className={NUM}>{pair.a}</span> and <span className={NUM}>{pair.b}</span>
                  <span className="text-oa-muted-fg">, {plural(pair.shared, "company", "companies")} in both</span>
                </span>
                <span className={`${NUM} shrink-0 text-oa-fg`}>{fmtPct(pair.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function FundRow({ fund }: { fund: FundSummary }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <Ticker symbol={fund.ticker} name={fund.fundName} />
        <span className={`${NUM} shrink-0 text-[14px] text-oa-fg`}>
          {money(fund.value)} <span className="text-oa-muted-fg">· {fmtPct(fund.pct)}</span>
        </span>
      </div>
      {fund.status === "ok" ? (
        <>
          {fund.top.length > 0 ? (
            <p className="mt-1.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">
              Biggest holdings:{" "}
              {fund.top.slice(0, 3).map((holding, index, list) => (
                <React.Fragment key={`${holding.ticker}-${index}`}>
                  <span className="text-oa-fg">{holding.ticker}</span> <span className={NUM}>{fmtPct(holding.weightPct)}</span>
                  {index < list.length - 2 ? ", " : index === list.length - 2 ? " and " : "."}
                </React.Fragment>
              ))}
            </p>
          ) : null}
          <p className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">
            {fund.sourceUrl ? (
              <a href={fund.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
                SEC filing
              </a>
            ) : (
              "SEC filing"
            )}{" "}
            as of {fmtFilingDay(fund.asOf)}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">
          {fund.status === "missing"
            ? "We have not read this fund's holdings yet, so its money is left out of the company and sector totals."
            : `${fund.note ?? "We cannot break this fund down into companies."} Its money is left out of the company and sector totals.`}
        </p>
      )}
    </li>
  );
}

function EveryCompany({ xray }: { xray: Xray }) {
  const rows = xray.companies.slice(0, TABLE_ROWS);
  const rest = xray.companies.slice(TABLE_ROWS);
  const restPct = rest.reduce((sum, row) => sum + row.pct, 0);
  // Words and sort values only: the client table builds the cells when the fold opens (company-table.tsx).
  const lines: CompanyLine[] = rows.map((row) => {
    const shown = row.name ? shortCompanyName(row.name) : "";
    return {
      key: row.key,
      ticker: row.ticker,
      label: shown && shown.toUpperCase() !== row.ticker.toUpperCase() ? shown : "",
      title: shown,
      direct: row.direct > 0 ? money(row.direct) : "none",
      funds: row.viaFunds > 0 ? money(row.viaFunds) : "none",
      via: row.via.length > 0 ? row.via.map((slice) => slice.fund).join(", ") : "direct only",
      pct: fmtPct(row.pct),
      sort: [row.name, row.direct, row.viaFunds, row.via.length, row.total],
    };
  });
  return (
    <Panel label="Every company" flush>
      <CompanyTable
        lines={lines}
        label={rest.length > 0 ? `Show the biggest ${TABLE_ROWS} companies` : `Show all ${xray.companies.length.toLocaleString("en-US")} companies`}
        note={rest.length > 0 ? `${rest.length.toLocaleString("en-US")} smaller companies make up the other ${fmtPct(restPct)}.` : null}
      />
    </Panel>
  );
}

function Notes({ xray, example }: { xray: Xray; example: boolean }) {
  const notes: string[] = [];
  const whose = example ? "this portfolio" : "what you own";
  const looseFundMoney = xray.unplacedValue - xray.closedFundValue;
  if (looseFundMoney > 0 && share(looseFundMoney, xray.total) >= 0.1) {
    notes.push(`${fmtPct(share(looseFundMoney, xray.total))} of ${whose} is fund money in cash, futures or holdings we could not match to a company, so it is not in any row above.`);
  }
  if (xray.unvalued.length > 0) {
    notes.push(
      `${joinList(xray.unvalued)} ${xray.unvalued.length === 1 ? "has" : "have"} no share count or price, so ${xray.unvalued.length === 1 ? "it is" : "they are"} not counted. Add the shares on the Portfolio page to include ${xray.unvalued.length === 1 ? "it" : "them"}.`,
    );
  }
  if (notes.length === 0) return null;
  return (
    <div className="px-2 text-[14px] leading-5 text-oa-muted-fg sm:px-0">
      {notes.map((note) => (
        <p key={note} className="mt-1 text-pretty">
          {note}
        </p>
      ))}
    </div>
  );
}

/** Shown when a signed-in person has no holdings with shares, or no funds. */
export function XrayEmpty({ coveredFunds, reason }: { coveredFunds: string[]; reason: "no-holdings" | "no-funds" | "no-values" }) {
  return (
    <Panel>
      <p className="text-[15px] font-medium text-oa-fg">
        {reason === "no-holdings"
          ? "Add the stocks and funds you hold to see what you really own."
          : reason === "no-values"
            ? "Your holdings have no share counts yet, so there is nothing to add up."
            : "None of your holdings is a fund, so there is nothing hidden to add up."}
      </p>
      <p className="mt-1 max-w-[46rem] text-pretty text-[14px] leading-5 text-oa-muted-fg">
        {coveredFunds.length > 0
          ? `We can open ${joinList(coveredFunds)} so far. Mark a fund as a holding on the Portfolio page with its share count, and this page shows every company inside it next to the stocks you bought.`
          : "Mark a fund as a holding on the Portfolio page with its share count, and this page shows every company inside it next to the stocks you bought."}
      </p>
      <Link href="/portfolio?tab=holdings" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-oa-border px-3 text-[14px] font-medium text-oa-fg hover:bg-oa-accent">
        Go to Portfolio
      </Link>
    </Panel>
  );
}

/** Above a signed-in person's own page when none of their holdings is a fund: one line, not a dead end. */
export function NoFundsNote({ coveredFunds }: { coveredFunds: string[] }) {
  return (
    <p className="px-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-0">
      None of your holdings is a fund, so this shows only the companies you bought directly.{" "}
      {coveredFunds.length > 0 ? `If you hold ${joinList(coveredFunds.slice(0, 4))} or another fund we can open, ` : "If you hold a fund, "}
      <Link href="/portfolio?tab=holdings" className="font-medium text-oa-primary underline-offset-2 hover:underline">
        mark it as a holding with its share count
      </Link>{" "}
      and this page adds every company inside it.
    </p>
  );
}

/** "Example: made-up shares on real prices." with the prices date ("the Nov 10 close", lib/portfolio-prices). */
export function ExampleNote({ pricesWords, signedIn }: { pricesWords: string | null; signedIn: boolean }) {
  return (
    <p className="px-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-0">
      This is an example portfolio: the shares are made up, and the prices are the same quotes as the stock pages ({pricesWords ?? "the latest close"}).{" "}
      {signedIn ? (
        <Link href="/portfolio?tab=holdings" className="font-medium text-oa-primary underline-offset-2 hover:underline">
          Add share counts to your holdings to see yours.
        </Link>
      ) : (
        <XraySignIn>Sign in to see yours.</XraySignIn>
      )}
    </p>
  );
}
