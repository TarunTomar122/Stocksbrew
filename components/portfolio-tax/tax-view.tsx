import Link from "next/link";

import {
  DataTable,
  type DataColumn,
  type DataRow,
} from "@/components/oa/kit/data-table";
import {
  Empty,
  FOCUS,
  NUM,
  Panel,
  SourceLine,
  StatStrip,
  Tag,
  fmtDay,
  fmtStampET,
  type StatItem,
} from "@/components/oa/kit";
import { ExportCsvButton } from "@/components/portfolio-tax/export-csv-button";
import { StockLogo } from "@/components/stock-logo";
import {
  gainTone,
  money,
  shares,
  signedMoney,
} from "@/components/portfolio-tax/format";
import {
  LotBook,
  type LotBookStock,
} from "@/components/portfolio-tax/lot-book";
import type { TaxViewData } from "@/lib/portfolio-tax-data";
import {
  type HarvestRow,
  type RealisedPiece,
  type Term,
} from "@/lib/portfolio-tax";

/* ── Pieces ────────────────────────────────────────────────────────────── */

function TermTag({ term }: { term: Term }) {
  if (term === "long") return <Tag tone="neutral">Long</Tag>;
  if (term === "short") return <Tag tone="neutral">Short</Tag>;
  return <Tag tone="warn">No date</Tag>;
}

function Money({
  value,
  signed = false,
}: {
  value: number | null;
  signed?: boolean;
}) {
  if (value === null)
    return <span className={`${NUM} text-oa-muted-fg`}>n/a</span>;
  return (
    <span className={`${NUM} ${signed ? gainTone(value) : "text-oa-fg"}`}>
      {signed ? signedMoney(value) : money(value)}
    </span>
  );
}

function StockCell({
  ticker,
  sub,
  mobileSub,
}: {
  ticker: string;
  sub?: string | null;
  mobileSub?: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-col leading-4">
      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        className="oa-mono inline-flex items-center gap-1.5 text-[13px] font-medium text-oa-fg hover:underline"
      >
        <StockLogo ticker={ticker} size={16} />
        {ticker}
      </Link>
      {sub ? <span className="text-[12px] text-oa-muted-fg">{sub}</span> : null}
      {mobileSub ? (
        <span className="text-[12px] text-oa-muted-fg sm:hidden">
          {mobileSub}
        </span>
      ) : null}
    </span>
  );
}

function boughtLabel(acquired: string | null): string {
  return acquired ? `bought ${fmtDay(acquired, true)}` : "buy date not entered";
}

/* ── Harvestable losses ────────────────────────────────────────────────── */

function HarvestTable({ rows }: { rows: HarvestRow[] }) {
  const columns: DataColumn[] = [
    { id: "stock", label: "Lot" },
    { id: "shares", label: "Shares", align: "right", hideOnMobile: true },
    { id: "cost", label: "Cost/sh", align: "right", hideOnMobile: true },
    { id: "price", label: "Price", align: "right", hideOnMobile: true },
    {
      id: "loss",
      label: "Loss",
      align: "right",
      hint: "Shares x price, minus what the lot cost",
    },
    {
      id: "term",
      label: "Term",
      hint: "Long term: held more than one year on today's date",
      hideOnMobile: true,
    },
    { id: "wash", label: "Wash-sale check", sortable: false },
  ];
  const data: DataRow[] = rows.map((row) => ({
    key: `${row.instrumentId}:${row.lotId}`,
    cells: [
      <StockCell
        key="s"
        ticker={row.ticker}
        sub={boughtLabel(row.acquired)}
        mobileSub={row.term === "unknown" ? null : `${row.term} term`}
      />,
      <span key="n" className={NUM}>
        {shares(row.shares)}
      </span>,
      <span key="c" className={NUM}>
        {money(row.costPerShare)}
      </span>,
      <span key="p" className={NUM}>
        {money(row.price)}
      </span>,
      <span key="l" className="flex flex-col items-end leading-4">
        <Money value={row.loss} signed />
        <span className={`${NUM} text-[12px] text-oa-muted-fg`}>
          {row.lossPct.toFixed(1)}%
        </span>
      </span>,
      <span key="t" className="flex flex-col items-start gap-0.5 leading-4">
        <TermTag term={row.term} />
        {row.longTermOn ? (
          <span className="hidden text-[12px] text-oa-muted-fg sm:inline">
            long from {fmtDay(row.longTermOn, true)}
          </span>
        ) : null}
      </span>,
      row.recentBuys.length > 0 ? (
        <span
          key="w"
          className="flex min-w-[8.5rem] max-w-[16rem] flex-col items-start gap-0.5 whitespace-normal leading-4"
        >
          <Tag tone="warn">
            Bought {fmtDay(row.recentBuys[row.recentBuys.length - 1]!.date)}
          </Tag>
          <span className="text-[12px] text-oa-muted-fg">
            Selling at a loss now is likely a wash sale.
          </span>
        </span>
      ) : (
        <span
          key="w"
          className="flex min-w-[8.5rem] max-w-[16rem] flex-col items-start whitespace-normal leading-4"
        >
          <span className="text-[13px] text-oa-fg">No buy in 30 days</span>
          <span className="text-[12px] text-oa-muted-fg">
            If sold today, no rebuy through {fmtDay(row.holdBackUntil)}
          </span>
        </span>
      ),
    ],
    sort: [
      row.ticker,
      row.shares,
      row.costPerShare,
      row.price,
      row.loss,
      row.term,
      null,
    ],
  }));
  return (
    <DataTable
      columns={columns}
      rows={data}
      initialSort={{ id: "loss", dir: "asc" }}
      pageSize={12}
      stickyHeader={false}
    />
  );
}

/* ── Realised gains ────────────────────────────────────────────────────── */

function RealisedTable({ pieces }: { pieces: RealisedPiece[] }) {
  const columns: DataColumn[] = [
    { id: "sold", label: "Sold" },
    { id: "stock", label: "Stock" },
    { id: "shares", label: "Shares", align: "right", hideOnMobile: true },
    { id: "acquired", label: "Acquired", hideOnMobile: true },
    { id: "proceeds", label: "Proceeds", align: "right", hideOnMobile: true },
    { id: "basis", label: "Basis", align: "right", hideOnMobile: true },
    { id: "gain", label: "Gain", align: "right" },
    { id: "term", label: "Term", hideOnMobile: true },
  ];
  const data: DataRow[] = pieces.map((piece) => ({
    key: piece.key,
    cells: [
      <span key="d" className={`${NUM} text-[13px]`}>
        {fmtDay(piece.sold, true)}
      </span>,
      <span key="s" className="flex flex-col leading-4">
        <span className="flex items-center gap-1.5">
          <Link
            href={`/stock/${encodeURIComponent(piece.ticker)}`}
            className="oa-mono inline-flex items-center gap-1.5 text-[13px] font-medium text-oa-fg hover:underline"
          >
            <StockLogo ticker={piece.ticker} size={16} />
            {piece.ticker}
          </Link>
          {piece.washSale ? <Tag tone="warn">Wash?</Tag> : null}
        </span>
        <span className="text-[12px] text-oa-muted-fg sm:hidden">
          {shares(piece.shares)} sh
          {piece.acquired ? ` · ${fmtDay(piece.acquired, true)}` : ""}
          {piece.term === "unknown" ? "" : ` · ${piece.term}`}
        </span>
        <span className="hidden text-[12px] text-oa-muted-fg sm:inline">
          {piece.method === "specific" ? "specific lot" : "first in, first out"}
        </span>
      </span>,
      <span key="n" className={NUM}>
        {shares(piece.shares)}
      </span>,
      <span
        key="a"
        className={`${NUM} text-[13px] ${piece.acquired ? "" : "text-oa-muted-fg"}`}
      >
        {piece.acquired
          ? fmtDay(piece.acquired, true)
          : piece.lotId === null
            ? "no lot"
            : "not entered"}
      </span>,
      <Money key="p" value={piece.proceeds} />,
      <Money key="b" value={piece.basis} />,
      <Money key="g" value={piece.gain} signed />,
      <TermTag key="t" term={piece.term} />,
    ],
    sort: [
      piece.sold,
      piece.ticker,
      piece.shares,
      piece.acquired,
      piece.proceeds,
      piece.basis,
      piece.gain,
      piece.term,
    ],
  }));
  return (
    <DataTable
      columns={columns}
      rows={data}
      initialSort={{ id: "sold", dir: "desc" }}
      pageSize={25}
      stickyHeader={false}
    />
  );
}

function WashList({ pieces }: { pieces: RealisedPiece[] }) {
  return (
    <ul className="divide-y divide-oa-border">
      {pieces.map((piece) => {
        const wash = piece.washSale!;
        return (
          <li
            key={piece.key}
            className="flex flex-col gap-1 px-4 py-2.5 text-[13px] leading-5 sm:flex-row sm:items-start sm:gap-4"
          >
            <span className="flex shrink-0 items-center gap-2 sm:w-56">
              <span className="oa-mono inline-flex items-center gap-1.5 font-medium text-oa-fg">
                <StockLogo ticker={piece.ticker} size={16} />
                {piece.ticker}
              </span>
              <span className="text-oa-muted-fg">
                sold {fmtDay(piece.sold, true)},{" "}
                <Money value={piece.gain} signed />
              </span>
            </span>
            <span className="min-w-0 flex-1 text-pretty text-oa-muted-fg">
              Window{" "}
              <span className={`${NUM} text-oa-fg`}>
                {fmtDay(wash.windowStart, true)}
              </span>{" "}
              to{" "}
              <span className={`${NUM} text-oa-fg`}>
                {fmtDay(wash.windowEnd, true)}
              </span>
              . Bought inside it:{" "}
              {wash.buys.map((buy, index) => (
                <span key={buy.lotId}>
                  {index > 0 ? ", " : ""}
                  <span className={`${NUM} text-oa-fg`}>
                    {shares(buy.shares)}
                  </span>{" "}
                  sh on {fmtDay(buy.date, true)}
                </span>
              ))}
              .{" "}
              {wash.disallowed > 0.005 ? (
                <>
                  About{" "}
                  <span className={`${NUM} text-oa-fg`}>
                    {money(wash.disallowed)}
                  </span>{" "}
                  of the loss may be disallowed and added to the new lot&apos;s
                  basis.
                </>
              ) : (
                "Those shares were already matched to an earlier loss, so this one likely stands."
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── The view ──────────────────────────────────────────────────────────── */

export function TaxView({
  data,
  year,
  currentYear,
  editable,
}: {
  data: TaxViewData;
  year: number;
  currentYear: number;
  /** false for the signed-out preview: nothing to save to. */
  editable: boolean;
}) {
  const { picture } = data;
  const thisYear =
    picture.years.find((summary) => summary.year === currentYear) ?? null;
  const shown = picture.years.find((summary) => summary.year === year) ?? null;
  const yearPieces = picture.realised.filter((piece) => piece.taxYear === year);
  const washPieces = yearPieces.filter((piece) => piece.washSale);
  const years = [
    ...new Set([currentYear, ...picture.years.map((summary) => summary.year)]),
  ].sort((a, b) => b - a);
  const openLots = picture.instruments.reduce(
    (sum, item) => sum + item.open.length,
    0,
  );
  const hasAnything = picture.instruments.length > 0;
  const harvest = picture.harvestTotals;

  const stats: StatItem[] = [
    {
      label: `Realised ${currentYear} to date`,
      value: thisYear ? signedMoney(thisYear.total) : "None",
      tone: thisYear
        ? thisYear.total > 0
          ? "up"
          : thisYear.total < 0
            ? "down"
            : "flat"
        : "flat",
      sub: thisYear
        ? `Short ${signedMoney(thisYear.short, 0)} · Long ${signedMoney(thisYear.long, 0)}`
        : "No sells this year",
    },
    {
      label: "Harvestable losses",
      value: picture.harvest.length > 0 ? signedMoney(harvest.total) : "None",
      tone: picture.harvest.length > 0 ? "down" : "flat",
      sub:
        picture.harvest.length > 0
          ? `Short ${signedMoney(harvest.short, 0)} · Long ${signedMoney(harvest.long, 0)}${harvest.unknown < 0 ? ` · No date ${signedMoney(harvest.unknown, 0)}` : ""}`
          : openLots > 0
            ? "No open lot is below its cost"
            : "No open lots",
    },
    {
      label: `Possible wash sales ${currentYear}`,
      value: String(thisYear?.washSales ?? 0),
      sub:
        thisYear && thisYear.washDisallowed > 0.005
          ? `about ${money(thisYear.washDisallowed, 0)} of loss at risk`
          : "Loss sales with a buy 30 days either side",
    },
    {
      label: "Open lots",
      value: String(openLots),
      sub:
        picture.undatedHoldings > 0
          ? `${picture.undatedHoldings} without a buy date`
          : `${picture.instruments.length} stock${picture.instruments.length === 1 ? "" : "s"}`,
    },
  ];

  const bookStocks: LotBookStock[] = data.stocks.map((stock) => {
    const result = picture.instruments.find(
      (item) => item.instrumentId === stock.instrumentId,
    );
    const price = data.prices[stock.instrumentId]?.price ?? null;
    const open = result?.open ?? [];
    const openShares = open.reduce((sum, lot) => sum + lot.shares, 0);
    const basis = open.reduce((sum, lot) => sum + lot.basis, 0);
    return {
      ...stock,
      entry: data.lots[stock.instrumentId] ?? null,
      fromHolding: result?.fromHolding ?? false,
      openShares,
      basis,
      value: price !== null && open.length > 0 ? openShares * price : null,
      realisedCount: result?.realised.length ?? 0,
    };
  });

  const pickIssues = picture.issues.filter(
    (issue) => issue.kind === "pick_short",
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="oa-surface border border-oa-border bg-oa-card px-3 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
        <span className="font-medium text-oa-fg">
          US federal rules only. Not tax advice.
        </span>{" "}
        State tax, the $3,000 loss limit and carryovers are not applied. Your
        broker&apos;s 1099-B is the record.
      </p>

      {hasAnything ? <StatStrip stats={stats} /> : null}

      {pickIssues.length > 0 ? (
        <ul className="oa-surface flex flex-col gap-1 border border-oa-border bg-oa-card px-3 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
          {pickIssues.map((issue) => (
            <li
              key={`${issue.instrumentId}:${issue.sellId}:${issue.kind === "pick_short" ? issue.lotId : ""}`}
            >
              <span className="oa-mono font-medium text-oa-fg">
                {issue.ticker}
              </span>{" "}
              sell on {fmtDay(issue.date, true)}: the lot you picked did not
              have {shares(issue.shares)} more shares left on that day, so those
              came from the oldest lots instead.
            </li>
          ))}
        </ul>
      ) : null}

      {hasAnything ? (
        <>
          <Panel
            label="Harvestable losses"
            right={
              <span className="hidden sm:inline">
                open lots below cost at the latest price
              </span>
            }
            flush
          >
            <HarvestTable rows={picture.harvest} />
            {picture.harvest.length === 0 ? null : (
              <p className="border-t border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
                Selling a lot at a loss and buying the same stock within 30 days
                before or after can make it a wash sale: the loss is deferred
                into the new shares. We check the same ticker only; options and
                funds that track it can count too.
              </p>
            )}
            {picture.unpriced.length > 0 ? (
              <p className="border-t border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
                No current price for {picture.unpriced.join(", ")}, so{" "}
                {picture.unpriced.length === 1 ? "it is" : "they are"} left out
                here.
              </p>
            ) : null}
          </Panel>

          <Panel
            label={`Realised gains · ${year}`}
            right={
              <span className="flex items-center gap-2">
                <nav aria-label="Tax year" className="flex items-center gap-1">
                  {years.slice(0, 6).map((option) => (
                    <Link
                      key={option}
                      href={
                        option === currentYear
                          ? "/portfolio/taxes"
                          : `/portfolio/taxes?year=${option}`
                      }
                      aria-current={option === year ? "true" : undefined}
                      className={`oa-mono inline-flex h-7 items-center rounded border px-2 text-[12.5px] ${FOCUS} ${
                        option === year
                          ? "border-oa-fg/50 bg-oa-bg font-medium text-oa-fg"
                          : "border-transparent text-oa-muted-fg hover:text-oa-fg"
                      }`}
                    >
                      {option}
                    </Link>
                  ))}
                </nav>
                <ExportCsvButton pieces={yearPieces} year={year} />
              </span>
            }
            flush
          >
            {yearPieces.length > 0 ? (
              <>
                <RealisedTable pieces={yearPieces} />
                {shown ? (
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t border-oa-border bg-oa-bg px-4 py-2 text-[12.5px]">
                    {[
                      {
                        label: "Short term",
                        node: <Money value={shown.short} signed />,
                      },
                      {
                        label: "Long term",
                        node: <Money value={shown.long} signed />,
                      },
                      ...(Math.abs(shown.unknown) > 0.005
                        ? [
                            {
                              label: "No buy date",
                              node: <Money value={shown.unknown} signed />,
                            },
                          ]
                        : []),
                      {
                        label: "Total",
                        node: <Money value={shown.total} signed />,
                      },
                      {
                        label: "Proceeds",
                        node: <Money value={shown.proceeds} />,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-baseline gap-2 whitespace-nowrap"
                      >
                        <dt className="oa-caption">{item.label}</dt>
                        <dd>{item.node}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </>
            ) : (
              <Empty title={`No sells in ${year}`}>
                {picture.realised.length === 0
                  ? "When you sell, open the stock under Your lots and add the sell. Gains show up here."
                  : "Pick another year above."}
              </Empty>
            )}
          </Panel>

          {washPieces.length > 0 ? (
            <Panel
              label={`Wash-sale windows · ${year}`}
              right={<span>{washPieces.length} flagged</span>}
              flush
            >
              <WashList pieces={washPieces} />
              <p className="border-t border-oa-border px-4 py-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
                Flagged only: the gains above do not include the wash-sale adjustment.
              </p>
            </Panel>
          ) : null}
        </>
      ) : null}

      <Panel
        label="Your lots"
        right={
          <span className="hidden sm:inline">entered by you</span>
        }
        flush
      >
        {!hasAnything ? (
          <Empty title="No lots yet">
            {editable
              ? "Pick a stock below and add each buy: the date, shares and price you paid. Add sells the same way. Gains, losses and wash-sale windows fill in from there."
              : "Sign in and add each buy: the date, shares and price you paid. Add sells the same way."}
          </Empty>
        ) : null}
        {editable ? <LotBook stocks={bookStocks} /> : null}
      </Panel>

      {hasAnything ? (
        <SourceLine
          className="px-2 sm:px-0"
          source="Prices: latest Yahoo Finance quote, hourly in market hours"
          asOf={data.pricesAsOf ? fmtStampET(data.pricesAsOf) : undefined}
          note={data.pricesAsOf ? undefined : "no current prices found"}
        />
      ) : null}
    </div>
  );
}
