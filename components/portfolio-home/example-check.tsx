import Link from "next/link";

import { WATCH_LINK } from "@/components/agent-watch/watch-list";
import { StockLogo } from "@/components/stock-logo";
import { shortDate } from "@/lib/agent-jobs";
import { nextCheckWords } from "@/lib/agent-watch";
import { checkSteps, ranWords, type CheckAudience, type CheckView, type ExampleChecksView } from "@/lib/portfolio-home/example-check";

/**
 * One real, dated check by an agent (lib/portfolio-home/example-check.ts): the rule, what it looked at and when,
 * what it found with the evidence and its source, what it decided, and its next check, then a question for Ask
 * about it and a way to change the watch. The example's checks show on My stocks to anyone without agents of
 * their own; a person's own checks open the same way (./agents-panel.tsx). Each check is a <details> row, so it
 * opens without any script. Server-safe: no hooks.
 */

const DOT: Record<CheckView["decision"], string> = {
  notify: "bg-oa-primary",
  nothing: "border border-oa-muted-fg",
  could_not_check: "bg-signal-bearish",
};
const DOT_LABEL: Record<CheckView["decision"], string> = { notify: "Found something", nothing: "Nothing to report", could_not_check: "Could not check" };

/** One row of the check: a short word on the left, the line on the right (styled once on the list). */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const LIST =
  "flex flex-col gap-2 px-3 py-2.5 text-[13px] leading-[18px] [&>div]:grid [&>div]:grid-cols-[4.25rem_minmax(0,1fr)] [&>div]:gap-x-3 [&_dd]:min-w-0 [&_dd]:text-pretty [&_dd]:text-oa-fg [&_dt]:text-[12.5px] [&_dt]:text-oa-muted-fg";

function capital(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/** The finding's source, linked: our own pages in the app, anything else (sec.gov) in a new tab. */
function SourceLink({ finding }: { finding: CheckView["findings"][number] }) {
  const label = [finding.source, finding.at ? shortDate(finding.at) : ""].filter(Boolean).join(", ");
  if (!label) return null;
  if (!finding.url) return <span className="text-oa-muted-fg">{label}</span>;
  const className = `${WATCH_LINK} font-normal`;
  return finding.url.startsWith("/") ? (
    <Link href={finding.url} prefetch={false} className={className}>
      {label}
    </Link>
  ) : (
    <a href={finding.url} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Evidence({ view }: { view: CheckView }) {
  if (view.findings.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-2">
      {view.findings.map((finding, index) => (
        <li key={`${finding.ticker ?? "x"}-${index}`} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2">
          {finding.ticker ? <StockLogo ticker={finding.ticker} size={16} className="mt-px" /> : <span aria-hidden="true" />}
          <div className="min-w-0">
            {view.findings.length > 1 ? <p className="text-oa-fg">{finding.headline}.</p> : null}
            {finding.detail ? <p className="text-oa-fg">{finding.detail}</p> : null}
            <p className="mt-0.5 text-[12.5px]">
              <SourceLink finding={finding} />
            </p>
          </div>
        </li>
      ))}
      {view.more > 0 ? <li className="text-[12.5px] text-oa-muted-fg">It found {view.more} more like {view.more === 1 ? "it" : "these"}.</li> : null}
    </ul>
  );
}

/** The stocks a check looked at, as logos: the first eight, then a count. Each opens its stock. */
function Stocks({ tickers }: { tickers: string[] }) {
  if (tickers.length === 0) return null;
  const shown = tickers.slice(0, 8);
  const more = tickers.length - shown.length;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {shown.map((ticker) => (
        <Link key={ticker} href={`/stock/${encodeURIComponent(ticker)}`} prefetch={false} title={ticker} aria-label={ticker} className="rounded">
          <StockLogo ticker={ticker} size={18} />
        </Link>
      ))}
      {more > 0 ? <span className="ml-0.5 text-[12px] text-oa-muted-fg">+{more}</span> : null}
    </span>
  );
}

/**
 * The whole check, open: what it watches, what it checked and when, what it found and why, what it did, what's
 * next. With an `audience`, the two steps follow: a question for Ask about this check, and changing the watch.
 */
export function CheckDetail({
  view,
  today,
  audience,
  showRule = true,
}: {
  view: CheckView;
  today: string;
  audience?: CheckAudience;
  /** Off under a row that already says the rule (CheckDisclosure). */
  showRule?: boolean;
}) {
  const steps = audience ? checkSteps(view, audience) : null;
  return (
    <div className="rounded border border-oa-border bg-oa-bg">
      <dl className={LIST}>
        {showRule ? <Row term="Watches">{view.ask}</Row> : null}
        <Row term="Checked">
          <span className="oa-mono whitespace-nowrap text-[12px] tabular-nums">{view.when}</span>
          {". "}
          {view.checked}
          <Stocks tickers={view.stocks} />
        </Row>
        <Row term="Found">
          <span className="inline-flex items-start gap-1.5">
            <span role="img" aria-label={DOT_LABEL[view.decision]} className={`mt-[5px] inline-block size-2 shrink-0 rounded-full ${DOT[view.decision]}`} />
            <span className={view.decision === "notify" ? "font-medium" : undefined}>{view.outcome}</span>
          </span>
          <Evidence view={view} />
        </Row>
        <Row term="Decided">{view.decided}</Row>
        {view.next ? <Row term="Next check">{capital(nextCheckWords(view.next, today))}.</Row> : null}
      </dl>
      {steps ? (
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-oa-border px-3 py-1.5 text-[13px] leading-[22px]">
          <Link href={`/ask?q=${encodeURIComponent(steps.ask.question)}&ctx=${encodeURIComponent(steps.ask.context)}`} prefetch={false} data-track-target="ask" className={WATCH_LINK}>
            Ask about this&nbsp;→
          </Link>
          {steps.change ? (
            <Link href={steps.change.href} prefetch={false} data-track-target="watch" className={WATCH_LINK}>
              {steps.change.label}&nbsp;→
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

const CHEVRON = (
  <svg aria-hidden="true" viewBox="0 0 12 12" className="mt-[3px] size-3 shrink-0 text-oa-muted-fg transition-transform group-open/check:rotate-180">
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * One check as a row that opens. Closed: the rule, when it ran, what it found and when it checks next. Open: the
 * whole check with its evidence and the two steps. `extra` sits under the row, outside the toggle (a link to the
 * finding on this page).
 */
export function CheckDisclosure({
  view,
  today,
  audience,
  open = false,
  extra = null,
}: {
  view: CheckView;
  today: string;
  audience: CheckAudience;
  open?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-2.5 leading-[18px]">
      <details open={open} className="group/check">
        <summary className="grid cursor-pointer list-none grid-cols-[0.5rem_minmax(0,1fr)_12px] gap-x-2.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] [&::-webkit-details-marker]:hidden">
          <span role="img" aria-label={DOT_LABEL[view.decision]} className={`mt-[5px] inline-block size-2 shrink-0 rounded-full ${DOT[view.decision]}`} />
          <span className="min-w-0">
            <span className="block text-pretty text-[13.5px] leading-[18px] text-oa-fg group-hover/check:underline">{view.ask}</span>
            {/* Closed, the row says when and what; open, the check below says it in full. */}
            <span className="mt-0.5 block text-pretty text-[12.5px] leading-[17px] text-oa-muted-fg group-open/check:hidden">
              <span className="oa-mono whitespace-nowrap text-[12px] tabular-nums">{view.when}</span>
              {": "}
              <span className={view.decision === "notify" ? "text-oa-fg" : undefined}>{view.outcome}</span>
              {view.next ? <> Checks again {nextCheckWords(view.next, today)}.</> : null}
            </span>
          </span>
          {CHEVRON}
        </summary>
        <div className="mt-2">
          <CheckDetail view={view} today={today} audience={audience} showRule={false} />
        </div>
      </details>
      {extra ? <div className="pl-[1.125rem]">{extra}</div> : null}
    </li>
  );
}

/** "MSFT, AAPL, NVDA, JPM, COST, XOM and UNH". */
export function tickerList(tickers: string[]): string {
  if (tickers.length <= 1) return tickers[0] ?? "";
  return `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
}

/** When the featured check ran, for a heading: "What an agent did last night". */
export function didWhen(view: CheckView, now: Date = new Date()): string {
  return ranWords(view.ranAt, view.day, now);
}

/**
 * The example's agents for a visitor: the latest check in full, then the other agents' latest checks as rows.
 * `head` is the panel's heading row (the page decides its words and the Example mark).
 */
export function ExampleChecks({ checks, today, head }: { checks: ExampleChecksView; today: string; head: React.ReactNode }) {
  const n = checks.others.length + 1;
  return (
    <>
      <div className="px-4 pb-1 pt-3.5">
        {head}
        <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {n === 1 ? "An agent watches" : `${n === 2 ? "Two" : n === 3 ? "Three" : n} agents watch`} the example&apos;s stocks ({tickerList(checks.tickers)}) and check them after every market close.
        </p>
      </div>
      {/* The check the heading talks about opens by default; the others open on a tap. */}
      <ul className="divide-y divide-oa-border">
        <CheckDisclosure view={checks.featured} today={today} audience="example" open />
        {checks.others.map((view) => (
          <CheckDisclosure key={view.id} view={view} today={today} audience="example" />
        ))}
      </ul>
    </>
  );
}
