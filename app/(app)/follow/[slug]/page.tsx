import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DOWN,
  ExternalLink,
  PartyDot,
  Ticker,
  UP,
} from "@/components/follow/bits";
import { FollowButton } from "@/components/follow/follow-button";
import { MovesStream } from "@/components/follow/moves-stream";
import { Panel, PerfTiles, Stat } from "@/components/follow/panel";
import { RecordChart } from "@/components/follow/record-chart";
import { ProfileCopyPanel } from "@/components/copy-trades/profile-panel";
import { getCopyRecord, type CopyRecord } from "@/lib/copy-trades";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, ShowMore, Verdict } from "@/components/oa/kit";
import { shortCompanyName } from "@/lib/plain-copy";
import { TheRead } from "@/components/oa/insight";
import { buildCongressMemberRead, buildFundRead } from "@/lib/follow-insights";
import { getSessionUser } from "@/lib/auth-server";
import {
  STOCK_ACT_DEADLINE_DAYS,
  fmtBracket,
  fmtDate,
  fmtFrac,
  fmtMonthYear,
  fmtShares,
  fmtUsd,
  fmtWeight,
  getFollowProfile,
  getFollowedSources,
  getSourceActivity,
  isValidSourceSlug,
  partyLabel,
  quarterLabel,
  type CongressProfile,
  type FundChange,
  type FundChanges,
  type FundPosition,
  type FundProfile,
  type Performance,
} from "@/lib/follow";
import { alsoClassesLabel, oneRowPerCompany } from "@/lib/share-class";
import { netSide, type ToneWord } from "@/lib/tone";
import { ogImage } from "@/lib/og/url";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = isValidSourceSlug(params.slug)
    ? await getFollowProfile(params.slug).catch(() => null)
    : null;
  if (!profile) return { title: "Follow" };
  const name = profile.kind === "fund" ? profile.fund : profile.name;
  // People search for a fund by its filing ("13F") and for a lawmaker by "stock trades".
  const title =
    profile.kind === "fund"
      ? `${name} 13F Portfolio: Holdings, New Buys and Sells`
      : `${name} Stock Trades: Latest House Disclosures`;
  const description =
    profile.kind === "fund"
      ? `${name} (${profile.manager}): the latest 13F portfolio, what changed last quarter, and what following each filing from its filing date would have returned against the S&P 500.`
      : `${name}: stock trades reported to the Clerk of the House, how long each took to report, and what following the reports would have returned against the S&P 500.`;
  // The card: who it is, what they hold, and following their filings against the S&P 500.
  const shareImage = ogImage(["follow", profile.slug], profile.kind === "fund" ? `${name}: top holdings and record against the S&P 500` : `${name}: reported stock trades and record against the S&P 500`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: `/follow/${profile.slug}` },
    openGraph: { title: `${title} · stocksbrew`, description, url: `https://www.stocksbrew.online/follow/${profile.slug}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

const TH =
  "oa-mono px-3 py-2 text-[11px] font-normal uppercase tracking-[0.08em] text-oa-muted-fg";
const TD = "px-3 py-1.5 align-middle";

/** The quarter after `period` ends, plus the 45 days a manager has to file. */
function nextDueDate(period: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (!match) return null;
  const quarterEnd = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) + 3, 0),
  );
  const due = new Date(quarterEnd.getTime() + 45 * 86400000);
  return due.toISOString().slice(0, 10);
}

/**
 * Which way a quarter leaned, in dollars: new lines and adds against trims and
 * exits. The lists are the largest moves by value, so the tail they leave out is
 * small. Counts stand in when an older filing has no values. Only when it did
 * both: a one-sided quarter is plain from the sentence.
 */
function fundLean(changes: FundChanges | null): ToneWord | null {
  if (!changes) return null;
  const { counts } = changes;
  if (counts.new + counts.added === 0 || counts.reduced + counts.sold === 0) return null;
  const total = (rows: FundChange[], pick: (row: FundChange) => number | undefined) =>
    rows.reduce((sum, row) => sum + Math.abs(pick(row) ?? 0), 0);
  const bought = total(changes.new, (row) => row.value) + total(changes.added, (row) => row.delta_value);
  const sold = total(changes.reduced, (row) => row.delta_value) + total(changes.sold, (row) => row.prev_value);
  if (bought + sold > 0) return netSide(bought, sold);
  return netSide(counts.new + counts.added, counts.reduced + counts.sold);
}

/**
 * Which way the newest report leaned, weighed by each trade's estimated size;
 * counts when a size is missing. Only when it both bought and sold.
 */
function reportLean(profile: CongressProfile): ToneWord | null {
  const latest = profile.reports[0];
  if (!latest || latest.buys === 0 || latest.sells === 0) return null;
  const rows = profile.trades.filter((trade) => trade.doc_id === latest.doc_id);
  const size = (trade: (typeof rows)[number]) =>
    trade.est_amount ?? (trade.amount_low != null ? (trade.amount_low + (trade.amount_high ?? trade.amount_low)) / 2 : null);
  if (rows.length > 0 && rows.every((trade) => size(trade) != null)) {
    let bought = 0;
    let sold = 0;
    for (const trade of rows) {
      // Exchanges and other trade types lean neither way.
      if (trade.tx_type === "buy") bought += size(trade) ?? 0;
      else if (trade.tx_type === "sell") sold += size(trade) ?? 0;
    }
    return netSide(bought, sold);
  }
  return netSide(latest.buys, latest.sells);
}

/** The lean as a chip at the head of the filing's one-line summary. An even split says nothing a chip could add. */
function LeanChip({ lean }: { lean: ToneWord | null }) {
  if (!lean || lean.tone === "flat") return null;
  return (
    <Verdict tone={lean.tone} className="mr-2 align-[-3px]">
      {lean.word}
    </Verdict>
  );
}

function ChangeBadge({ position }: { position: FundPosition }) {
  if (!position.change) return null;
  if (position.change === "held")
    return (
      <span className="oa-mono text-[11px] text-oa-muted-fg">No change</span>
    );
  if (position.change === "new")
    return (
      <span className={`oa-mono text-[11px] uppercase tracking-[0.06em] ${UP}`}>
        New
      </span>
    );
  const up = position.change === "added";
  const pct = position.shares_delta_pct;
  return (
    <span className={`oa-mono text-[11.5px] ${up ? UP : DOWN}`}>
      {up ? "Added" : "Trimmed"}
      {pct != null
        ? ` ${fmtFrac(pct / 100, Math.abs(pct) >= 100 ? 0 : 1)}`
        : ""}
    </span>
  );
}

function PortfolioRows({
  rows,
  offset,
}: {
  rows: FundPosition[];
  offset: number;
}) {
  const top = rows.reduce((max, row) => Math.max(max, row.weight ?? 0), 0) || 1;
  return (
    <>
      {rows.map((position, index) => (
        <tr
          key={`${position.cusip}-${index}`}
          className="border-t border-oa-border"
        >
          <td className={`${TD} oa-mono w-8 text-[11.5px] text-oa-muted-fg`}>
            {offset + index + 1}
          </td>
          <td className={`${TD} max-w-[11rem] sm:max-w-[13rem]`}>
            <div className="flex min-w-0 items-baseline gap-2">
              {position.ticker ? (
                <Ticker ticker={position.ticker} className="text-[13px]" />
              ) : null}
              <span
                className={`text-pretty text-[13px] ${position.ticker ? "text-oa-muted-fg" : "text-oa-fg"}`}
                title={position.issuer}
              >
                {shortCompanyName(position.name)}
              </span>
            </div>
            {position.change && position.change !== "held" ? (
              <div className="sm:hidden">
                <ChangeBadge position={position} />
              </div>
            ) : null}
          </td>
          <td className={`${TD} w-[7.5rem]`}>
            <div className="flex items-center justify-end gap-2">
              <span
                aria-hidden="true"
                className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-oa-bg sm:block"
              >
                <span
                  className="block h-full rounded-full bg-oa-primary/70"
                  style={{
                    width: `${Math.max(3, ((position.weight ?? 0) / top) * 100)}%`,
                  }}
                />
              </span>
              <span className="oa-mono tabular-nums text-[13px] text-oa-fg">
                {fmtWeight(position.weight)}
              </span>
            </div>
          </td>
          <td
            className={`${TD} oa-mono hidden text-right text-[12.5px] text-oa-fg sm:table-cell`}
          >
            {fmtUsd(position.value)}
          </td>
          <td
            className={`${TD} oa-mono hidden text-right text-[12.5px] text-oa-muted-fg md:table-cell`}
          >
            {fmtShares(position.shares)}
          </td>
          <td
            className={`${TD} hidden whitespace-nowrap text-right sm:table-cell`}
          >
            <ChangeBadge position={position} />
          </td>
          <td
            className={`${TD} oa-mono hidden whitespace-nowrap text-right text-[11.5px] text-oa-muted-fg lg:table-cell`}
          >
            {position.held_since
              ? `${position.held_since_is_floor ? "≤ " : ""}${quarterLabel(position.held_since)}`
              : ""}
          </td>
        </tr>
      ))}
    </>
  );
}

function PortfolioHead() {
  return (
    <thead className="bg-oa-bg">
      <tr>
        <th className={`${TH} text-left`}>#</th>
        <th className={`${TH} text-left`}>Holding</th>
        <th className={`${TH} text-right`}>Weight</th>
        <th className={`${TH} hidden text-right sm:table-cell`}>Value</th>
        <th className={`${TH} hidden text-right md:table-cell`}>Shares</th>
        <th className={`${TH} hidden text-right sm:table-cell`}>
          Vs last quarter
        </th>
        <th className={`${TH} hidden text-right lg:table-cell`}>Held since</th>
      </tr>
    </thead>
  );
}

function ChangeList({
  title,
  tone,
  count,
  rows,
  detail,
}: {
  title: string;
  tone: string;
  count: number;
  rows: FundChange[];
  detail: (row: FundChange) => string;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="flex items-baseline justify-between gap-2">
        <span
          className={`oa-mono text-[11px] uppercase tracking-[0.08em] ${tone}`}
        >
          {title}
        </span>
        <span className="oa-mono text-[11.5px] text-oa-muted-fg">{count}</span>
      </p>
      {rows.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-oa-muted-fg">None.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {(({ rows: folded, also }) => folded.slice(0, 8).map((row, index) => (
            <li
              key={`${row.cusip}-${index}`}
              className="flex items-baseline justify-between gap-2 text-[13px] leading-5"
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                {row.ticker ? <Ticker ticker={row.ticker} /> : null}
                <span
                  className={`text-pretty ${row.ticker ? "text-[12px] text-oa-muted-fg" : "text-oa-fg"}`}
                >
                  {shortCompanyName(row.name)}
                  {alsoClassesLabel(also, row.ticker) ? <span className="oa-mono"> · {alsoClassesLabel(also, row.ticker)}</span> : null}
                </span>
              </span>
              <span className="oa-mono shrink-0 text-[12px] text-oa-muted-fg">
                {detail(row)}
              </span>
            </li>
          )))(oneRowPerCompany(rows, (row) => row.ticker))}
          {count > Math.min(rows.length, 8) ? (
            <li className="text-[12px] text-oa-muted-fg">
              and {count - Math.min(rows.length, 8)} more in the filing
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function RecordPanel({
  performance,
  name,
  what,
  slug,
}: {
  performance: Performance | null;
  name: string;
  what: string;
  /** The copy test (tm_copy_trades) replaces this panel when one exists, so the profile and /follow/<slug>/copy quote one number. */
  slug: string;
}) {
  const legacy = !performance ? (
    <Panel title="If you had copied each filing">
      <p className="px-4 py-5 text-[14px] leading-6 text-oa-muted-fg">
        No record for {name} yet: none of the {what} matched a stock with
        a price history. The filings are below.
      </p>
    </Panel>
  ) : (
    <Panel
      title="If you had copied each filing"
      right={
        <span>Prices to {fmtDate(performance.end_date)}</span>
      }
    >
      <PerfTiles card={performance} />
      <div className="px-4 py-4">
        <RecordChart
          curve={performance.curve}
          name={name}
          ended={performance.ended}
        />
      </div>
      <p className="border-t border-oa-border px-4 py-3 text-[12.5px] leading-5 text-oa-muted-fg">
        What you would have made buying the {what} on each filing date, before
        costs and taxes. Not a real account.
        {performance.fund.annualized != null &&
        performance.spy.annualized != null
          ? ` That is ${fmtFrac(performance.fund.annualized)} a year against ${fmtFrac(performance.spy.annualized)} for the S&P 500.`
          : ""}
      </p>
    </Panel>
  );
  return <ProfileCopyPanel slug={slug} title="If you had copied each filing" fallback={legacy} />;
}

function FundView({
  profile,
  followed,
  activity,
  copy,
}: {
  profile: FundProfile;
  followed: boolean;
  activity: Awaited<ReturnType<typeof getSourceActivity>>;
  /** The copy test, when there is one: the read quotes its numbers, like the record panel. */
  copy: CopyRecord | null;
}) {
  const latest = profile.latest;
  const changes = profile.changes;
  const due = profile.active ? nextDueDate(latest.period) : null;
  const first = profile.portfolio.slice(0, 20);
  const rest = profile.portfolio.slice(20);
  const optionShare =
    latest.options_underlying_value && latest.stock_value
      ? latest.options_underlying_value / latest.stock_value
      : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12.5px] leading-4 text-oa-muted-fg">
            <a href="/follow" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
              Follow
            </a>{" "}
            / Funds
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
              {profile.fund}
            </h1>
            <p className="text-[15px] leading-6 text-oa-muted-fg">{profile.manager}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ExternalLink
            href={profile.source_url}
            className="text-[13px] text-oa-muted-fg"
          >
            Every quarterly report at the SEC
          </ExternalLink>
          <FollowButton
            slug={profile.slug}
            name={profile.fund}
            followed={followed}
            size="md"
          />
        </div>
      </div>

      <TheRead read={buildFundRead(profile, copy)} fold="phone" className="mt-3" />

      <div className="mt-4">
        <Panel
          title={`Latest filing · ${latest.quarter}`}
          right={
            <ExternalLink href={latest.url}>
              This report at the SEC
            </ExternalLink>
          }
        >
          <div className="px-4 py-3">
            <p className="max-w-[78ch] text-[13px] leading-5 text-oa-muted-fg">
              <LeanChip lean={fundLean(changes)} />
              Filed {fmtDate(latest.filed_at)} for holdings on{" "}
              {fmtDate(latest.period)}, {latest.lag_days} days after the quarter
              ended
              {latest.amended
                ? `, amended ${fmtDate(latest.latest_filed_at)}`
                : ""}
              .{" "}
              {!profile.active
                ? "They have not filed since, so treat this as history."
                : due
                  ? `The next one is due by ${fmtDate(due)}.`
                  : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 border-t border-oa-border sm:grid-cols-4 [&>*+*]:border-l [&>*:nth-child(3)]:border-l-0 [&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(3)]:border-l sm:[&>*:nth-child(n+3)]:border-t-0 [&>*]:border-oa-border">
            <Stat
              label="Stocks reported"
              value={fmtUsd(latest.stock_value)}
              hint={`as of ${fmtDate(latest.period)}`}
            />
            <Stat
              label="Positions"
              value={latest.stock_positions.toLocaleString("en-US")}
              hint={
                profile.portfolio_shown < latest.stock_positions
                  ? `top ${profile.portfolio_shown} shown below`
                  : "all shown below"
              }
            />
            <Stat
              label="Top 10 stocks"
              value={fmtWeight(latest.top10_weight)}
              hint="of the money in stocks"
            />
            <Stat
              label="Options"
              value={
                latest.option_positions
                  ? latest.option_positions.toLocaleString("en-US")
                  : "None"
              }
              hint={
                optionShare != null
                  ? `on ${fmtUsd(latest.options_underlying_value)} of stock`
                  : "none reported"
              }
            />
          </div>
        </Panel>
      </div>

      {changes ? (
        <div className="mt-4 scroll-mt-20" id="changes">
          <Panel
            title={`What changed in ${latest.quarter}`}
            right={
              profile.compared_with ? (
                <span>
                  compared with {quarterLabel(profile.compared_with)}, by number of shares
                </span>
              ) : null
            }
          >
            <div className="grid divide-y divide-oa-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 [&>*]:border-oa-border sm:[&>*:nth-child(even)]:border-l sm:[&>*:nth-child(n+3)]:border-t xl:[&>*+*]:border-l xl:[&>*:nth-child(n+3)]:border-t-0">
              <ChangeList
                title="New buys"
                tone={UP}
                count={changes.counts.new}
                rows={changes.new}
                detail={(row) => fmtWeight(row.weight)}
              />
              <ChangeList
                title="Added to"
                tone={UP}
                count={changes.counts.added}
                rows={changes.added}
                detail={(row) =>
                  row.shares_delta_pct != null && Number.isFinite(row.shares_delta_pct)
                    ? `${Math.abs(row.shares_delta_pct).toFixed(Math.abs(row.shares_delta_pct) >= 100 ? 0 : 1)}% more`
                    : ""
                }
              />
              <ChangeList
                title="Trimmed"
                tone={DOWN}
                count={changes.counts.reduced}
                rows={changes.reduced}
                detail={(row) =>
                  row.shares_delta_pct != null && Number.isFinite(row.shares_delta_pct)
                    ? `${Math.abs(row.shares_delta_pct).toFixed(1)}% fewer`
                    : ""
                }
              />
              <ChangeList
                title="Exited"
                tone={DOWN}
                count={changes.counts.sold}
                rows={changes.sold}
                detail={(row) =>
                  row.prev_weight != null
                    ? `was ${fmtWeight(row.prev_weight)}`
                    : ""
                }
              />
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="mt-4 scroll-mt-20" id="portfolio">
        <Panel
          title="Portfolio"
          right={
            <span>
              as of {fmtDate(latest.period)} ·{" "}
              <ExternalLink href={latest.url}>source</ExternalLink>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <PortfolioHead />
              <tbody>
                <PortfolioRows rows={first} offset={0} />
              </tbody>
            </table>
          </div>
          {rest.length > 0 ? (
            <details className="group border-t border-oa-border">
              <summary className="flex h-10 cursor-pointer list-none items-center justify-center text-[13px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  Show {rest.length} more
                </span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    <PortfolioRows rows={rest} offset={20} />
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          <p className="border-t border-oa-border px-4 py-2 text-[12px] leading-5 text-oa-muted-fg">
            Values at quarter end, not today&apos;s prices.
            {latest.stock_positions > profile.portfolio_shown
              ? ` Largest ${profile.portfolio_shown} of ${latest.stock_positions.toLocaleString("en-US")} positions shown.`
              : ""}
          </p>
        </Panel>
      </div>

      {/* The hypothetical record comes after what the fund owns: holdings first, the backtest second. */}
      <div className="mt-4">
        <RecordPanel
          performance={profile.performance}
          name={profile.fund}
          what="reported stocks"
          slug={profile.slug}
        />
      </div>

      {profile.options.length > 0 ? (
        <div className="mt-4">
          <Panel
            title="Options in the filing"
            right={<span>not counted in weights or the record</span>}
          >
            <ul className="grid divide-y divide-oa-border sm:grid-cols-2 sm:divide-y-0 [&>*]:border-oa-border sm:[&>*:nth-child(even)]:border-l sm:[&>*:nth-child(n+3)]:border-t">
              {profile.options.slice(0, 10).map((option, index) => (
                <li
                  key={`${option.cusip}-${option.put_call}-${index}`}
                  className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[13px] leading-5"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={`oa-mono text-[10.5px] uppercase tracking-[0.06em] ${option.put_call === "call" ? UP : DOWN}`}
                    >
                      {option.put_call}
                    </span>
                    {option.ticker ? <Ticker ticker={option.ticker} /> : null}
                    <span className="text-pretty text-oa-muted-fg">
                      {shortCompanyName(option.name)}
                    </span>
                  </span>
                  <span className="oa-mono shrink-0 text-[12px] text-oa-muted-fg">
                    on {fmtUsd(option.underlying_value)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      <ShowMore label="Show every filing since the first one" className="mt-4">
        <Panel
          title="Filing history"
          right={
            <span>
              {profile.filings.length} quarters since{" "}
              {quarterLabel(profile.first_period)}
            </span>
          }
        >
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-oa-bg">
                <tr>
                  <th className={`${TH} text-left`}>Quarter</th>
                  <th className={`${TH} text-left`}>Filed</th>
                  <th className={`${TH} hidden text-right sm:table-cell`}>
                    Lag
                  </th>
                  <th className={`${TH} text-right`}>Stocks</th>
                  <th className={`${TH} hidden text-right sm:table-cell`}>
                    Positions
                  </th>
                  <th className={`${TH} text-right`}>Filing</th>
                </tr>
              </thead>
              <tbody>
                {profile.filings.map((filing) => (
                  <tr key={filing.period} className="border-t border-oa-border">
                    <td
                      className={`${TD} oa-mono whitespace-nowrap text-[12.5px] text-oa-fg`}
                    >
                      {filing.quarter}
                    </td>
                    <td
                      className={`${TD} oa-mono whitespace-nowrap text-[12.5px] text-oa-muted-fg`}
                    >
                      {fmtDate(filing.filed_at)}
                      {filing.amended ? (
                        <span
                          title={`Amended ${fmtDate(filing.latest_filed_at)}`}
                        >
                          {" "}
                          *
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`${TD} oa-mono hidden text-right text-[12.5px] text-oa-muted-fg sm:table-cell`}
                    >
                      {filing.lag_days}d
                    </td>
                    <td
                      className={`${TD} oa-mono text-right text-[12.5px] text-oa-fg`}
                    >
                      {fmtUsd(filing.stock_value)}
                    </td>
                    <td
                      className={`${TD} oa-mono hidden text-right text-[12.5px] text-oa-muted-fg sm:table-cell`}
                    >
                      {filing.stock_positions.toLocaleString("en-US")}
                    </td>
                    <td
                      className={`${TD} text-right text-[12px] text-oa-muted-fg`}
                    >
                      <ExternalLink href={filing.url}>EDGAR</ExternalLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-oa-border px-4 py-2 text-[12px] leading-5 text-oa-muted-fg">
            {profile.median_lag_days != null
              ? `They usually file ${profile.median_lag_days} days after the quarter ends. `
              : ""}
            * amended later.
          </p>
        </Panel>

        {activity.length > 1 ? (
          <div className="mt-4">
            <Panel title="Earlier filings, quarter by quarter">
              <MovesStream events={activity} emptyText="" showName={false} />
            </Panel>
          </div>
        ) : null}
      </ShowMore>

      <p className="mt-4 max-w-[78ch] text-[12.5px] leading-5 text-oa-muted-fg">
        {profile.style ? `About ${profile.fund}: ${profile.style} ` : ""}
        A 13F is up to 45 days old when filed and shows long US stock positions only. Not investment advice.
      </p>
    </>
  );
}

function CongressView({
  profile,
  followed,
  copy,
}: {
  profile: CongressProfile;
  followed: boolean;
  copy: CopyRecord | null;
}) {
  const stats = profile.stats;
  const party = partyLabel(profile.party);
  const seat = profile.state ? `${profile.state}-${profile.district}` : "";
  const trades = profile.trades;
  const first = trades.slice(0, 40);
  const rest = trades.slice(40);

  const rows = (list: typeof trades) =>
    list.map((trade) => {
      const buy = trade.tx_type === "buy";
      const late =
        trade.lag_days != null && trade.lag_days > STOCK_ACT_DEADLINE_DAYS;
      return (
        <tr key={trade.trade_id} className="border-t border-oa-border">
          <td
            className={`${TD} oa-mono whitespace-nowrap text-[12px] text-oa-muted-fg`}
          >
            <span className="hidden sm:inline">
              {fmtDate(trade.disclosure_date)}
            </span>
            <span className="sm:hidden">
              {fmtDate(trade.disclosure_date, false)}
              <span className="block text-[10.5px] text-oa-muted-fg">
                {trade.disclosure_date.slice(0, 4)}
              </span>
            </span>
          </td>
          <td className={`${TD} max-w-[15rem] sm:max-w-[14rem]`}>
            <div className="flex min-w-0 items-baseline gap-2">
              {trade.ticker ? (
                <Ticker ticker={trade.ticker} className="text-[13px]" />
              ) : null}
              <span
                className={`text-pretty text-[13px] ${trade.ticker ? "text-oa-muted-fg" : "text-oa-fg"}`}
                title={trade.company}
              >
                {shortCompanyName(trade.company)}
              </span>
              {trade.asset_type === "OP" ? (
                <span
                  className="oa-mono shrink-0 rounded border border-oa-border px-1 text-[9.5px] uppercase tracking-wider text-oa-muted-fg"
                  title="An options trade. Options are left out of the record."
                >
                  Option
                </span>
              ) : null}
            </div>
            <p className="oa-mono mt-0.5 truncate text-[11.5px] text-oa-muted-fg sm:hidden">
              <span
                className={`uppercase tracking-[0.06em] ${buy ? UP : DOWN}`}
              >
                {buy ? "Bought" : trade.partial ? "Sold part" : "Sold"}
              </span>{" "}
              {fmtBracket(trade.amount_low, trade.amount_high)} · traded{" "}
              {fmtDate(trade.transaction_date, false)}
            </p>
          </td>
          <td
            className={`${TD} oa-mono hidden whitespace-nowrap text-[11px] uppercase tracking-[0.06em] sm:table-cell ${buy ? UP : DOWN}`}
          >
            {buy ? "Bought" : trade.partial ? "Sold part" : "Sold"}
          </td>
          <td
            className={`${TD} oa-mono hidden whitespace-nowrap text-right text-[12.5px] text-oa-fg sm:table-cell`}
          >
            {fmtBracket(trade.amount_low, trade.amount_high)}
          </td>
          <td
            className={`${TD} oa-mono hidden whitespace-nowrap text-right text-[12px] text-oa-muted-fg sm:table-cell`}
          >
            {fmtDate(trade.transaction_date, false)}
          </td>
          <td
            className={`${TD} oa-mono hidden whitespace-nowrap text-right text-[12px] sm:table-cell ${late ? DOWN : "text-oa-muted-fg"}`}
            title={late ? "Past the 45-day deadline" : undefined}
          >
            {trade.lag_days != null ? `${trade.lag_days}d` : ""}
          </td>
          <td
            className={`${TD} hidden whitespace-nowrap text-right text-[12px] text-oa-muted-fg md:table-cell`}
          >
            {trade.owner === "self" ? "" : trade.owner}
          </td>
          <td
            className={`${TD} hidden text-right text-[12px] text-oa-muted-fg lg:table-cell`}
          >
            <ExternalLink href={trade.source_url}>PDF</ExternalLink>
          </td>
        </tr>
      );
    });

  const head = (
    <thead className="bg-oa-bg">
      <tr>
        <th className={`${TH} text-left`}>Filed</th>
        <th className={`${TH} text-left`}>Asset</th>
        <th className={`${TH} hidden text-left sm:table-cell`}>Side</th>
        <th className={`${TH} hidden text-right sm:table-cell`}>Amount</th>
        <th className={`${TH} hidden text-right sm:table-cell`}>Traded</th>
        <th className={`${TH} hidden text-right sm:table-cell`}>Lag</th>
        <th className={`${TH} hidden text-right md:table-cell`}>Owner</th>
        <th className={`${TH} hidden text-right lg:table-cell`}>Report</th>
      </tr>
    </thead>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12.5px] leading-4 text-oa-muted-fg">
            <a href="/follow?tab=congress" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
              Follow
            </a>{" "}
            / Congress
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">
              {profile.name}
            </h1>
            <p className="flex items-center gap-2 text-[15px] leading-6 text-oa-muted-fg">
              <PartyDot party={profile.party} />
              {[party, "US House", seat].filter(Boolean).join(" · ")}
              {!profile.sitting ? <span>· no longer in this seat</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ExternalLink
            href="https://disclosures-clerk.house.gov/FinancialDisclosure"
            className="text-[13px] text-oa-muted-fg"
          >
            Clerk of the House
          </ExternalLink>
          <FollowButton
            slug={profile.slug}
            name={profile.name}
            followed={followed}
            size="md"
          />
        </div>
      </div>

      <TheRead read={buildCongressMemberRead(profile, copy)} className="mt-3" />

      <div className="mt-4">
        <Panel
          title="Latest report"
          right={
            <ExternalLink href={profile.source_url}>Report (PDF)</ExternalLink>
          }
        >
          <div className="px-4 py-3">
            <p className="text-[15px] leading-6 text-oa-fg">
              <LeanChip lean={reportLean(profile)} />
              {profile.headline}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-oa-muted-fg">
              {profile.reports_count} reports read since{" "}
              {fmtDate(profile.first_report)}.
              {stats.median_lag_days != null
                ? ` A typical trade here is reported ${stats.median_lag_days} days after it happens; the law allows ${STOCK_ACT_DEADLINE_DAYS}.`
                : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 border-t border-oa-border sm:grid-cols-4 [&>*+*]:border-l [&>*:nth-child(3)]:border-l-0 [&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(3)]:border-l sm:[&>*:nth-child(n+3)]:border-t-0 [&>*]:border-oa-border">
            <Stat
              label="Trades reported"
              value={stats.trades.toLocaleString("en-US")}
              hint={`${stats.buys} ${stats.buys === 1 ? "buy" : "buys"}, ${stats.sells} ${stats.sells === 1 ? "sale" : "sales"}`}
            />
            <Stat
              label="Rough size"
              value={fmtUsd(stats.est_volume)}
              hint="middle of each bracket, added up"
            />
            <Stat
              label="Typical delay"
              value={
                stats.median_lag_days != null ? `${stats.median_lag_days}d` : ""
              }
              hint="trade to report"
            />
            <Stat
              label="Reported late"
              value={stats.late_trades.toLocaleString("en-US")}
              hint={`more than ${STOCK_ACT_DEADLINE_DAYS} days after`}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <RecordPanel
          performance={profile.performance}
          name={profile.name}
          what="reported buys"
          slug={profile.slug}
        />
      </div>

      <div className="mt-4 scroll-mt-20" id="trades">
        <Panel
          title="Reported trades"
          right={
            <span>
              {profile.trades_total.toLocaleString("en-US")} since{" "}
              {fmtMonthYear(profile.first_report)}, newest report first
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {head}
              <tbody>{rows(first)}</tbody>
            </table>
          </div>
          {rest.length > 0 ? (
            <details className="group border-t border-oa-border">
              <summary className="flex h-10 cursor-pointer list-none items-center justify-center text-[13px] font-medium text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  Show {rest.length} more
                </span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>{rows(rest)}</tbody>
                </table>
              </div>
            </details>
          ) : null}
          {profile.trades_total > trades.length ? (
            <p className="border-t border-oa-border px-4 py-2 text-[12px] leading-5 text-oa-muted-fg">
              Showing the latest {trades.length} of{" "}
              {profile.trades_total.toLocaleString("en-US")}.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Reports"
          right={<span>{profile.reports_count}</span>}
        >
          <ul className="max-h-[360px] divide-y divide-oa-border overflow-auto">
            {profile.reports.map((report) => (
              <li
                key={report.doc_id}
                className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[13px] leading-5"
              >
                <span className="oa-mono text-oa-fg">
                  {fmtDate(report.filed_at)}
                </span>
                <span className="oa-mono text-[12px] text-oa-muted-fg">
                  {report.buys} {report.buys === 1 ? "buy" : "buys"} ·{" "}
                  {report.sells} {report.sells === 1 ? "sale" : "sales"}
                </span>
                <span className="text-[12px] text-oa-muted-fg">
                  <ExternalLink href={report.url}>PDF</ExternalLink>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

      </div>

      <p className="mt-4 text-[12px] leading-5 text-oa-muted-fg">
        Amounts are reported as brackets and many trades belong to a spouse or a managed account. Not investment advice.
      </p>
    </>
  );
}

export default async function FollowProfilePage({ params }: Props) {
  if (!isValidSourceSlug(params.slug)) notFound();
  const [profile, session] = await Promise.all([
    getFollowProfile(params.slug).catch(() => null),
    getSessionUser(),
  ]);
  if (!profile) notFound();
  const [followed, activity, copy] = await Promise.all([
    getFollowedSources(session?.uid),
    profile.kind === "fund"
      ? getSourceActivity(profile.slug).catch(() => [])
      : Promise.resolve([]),
    getCopyRecord(profile.slug).catch(() => null),
  ]);
  const isFollowed = followed.includes(profile.slug);

  const displayName = profile.kind === "fund" ? profile.fund : profile.name;
  const pageUrl = `https://www.stocksbrew.online/follow/${profile.slug}`;

  return (
    <AppPage>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Dataset",
            name: profile.kind === "fund" ? `${displayName} 13F holdings` : `${displayName} reported stock trades`,
            description:
              profile.kind === "fund"
                ? `${displayName}'s US stock holdings as reported in its quarterly Form 13F filings to the SEC, with the changes from one quarter to the next.`
                : `Stock trades ${displayName} reported to the Clerk of the House under the STOCK Act, with the date of each trade and the date it was reported.`,
            url: pageUrl,
            isAccessibleForFree: true,
            creator: { "@type": "Organization", name: "stocksbrew", url: "https://www.stocksbrew.online" },
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Follow", path: "/follow" },
            { name: displayName, path: `/follow/${profile.slug}` },
          ]),
        ]}
      />
      {profile.kind === "fund" ? (
        <FundView profile={profile} followed={isFollowed} activity={activity} copy={copy} />
      ) : (
        <CongressView profile={profile} followed={isFollowed} copy={copy} />
      )}
    </AppPage>
  );
}
