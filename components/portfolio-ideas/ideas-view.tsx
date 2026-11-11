import Link from "next/link";
import * as React from "react";

import { FOCUS, NUM, Panel, Tag, Ticker, fmtDay } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { RatePicker } from "@/components/portfolio-ideas/rate-picker";
import { LOSS_MIN, LOSS_PCT } from "@/lib/portfolio-ideas/losses";
import { watchDropsHref } from "@/lib/portfolio-ideas/watch";
import { COMPANY_LINE, TRIM_MIN_POINTS, TRIM_MIN_USD } from "@/lib/portfolio-ideas/rebalance";
import type { IdeasView as IdeasData } from "@/lib/portfolio-ideas/server";
import type { AddIdea, CallWord, LossIdea, RebalancePlan, SaleTax, SimilarPick, TaxRates, TrimIdea } from "@/lib/portfolio-ideas/types";
import { callPlain, fmtPct, joinList, portfolioWord, sharesWord, usd } from "@/lib/portfolio-ideas/words";
import { fmtShares } from "@/lib/portfolio-shared";

/**
 * /portfolio/ideas: the read on top, then "trim this, add that" with the tax
 * on each sale, then losses that could be sold for tax with look-alikes to
 * hold meanwhile. The rates and the caveats sit beside them on a wide screen
 * and under the read on a phone. Nothing here places a trade.
 */

export const WASH_SALE_SENTENCE =
  "The wash-sale rule: if you buy the same stock, or one that is substantially identical, within 30 days before or after selling it at a loss, the loss is put off until you sell the new shares.";

function CallTag({ call }: { call: CallWord | null }) {
  if (!call) return null;
  return (
    <Tag caps={false} tone={call === "Add" ? "up" : call === "Trim" ? "down" : "neutral"}>
      {callPlain(call)}
    </Tag>
  );
}

/** Before and after on one track, with a tick at the line the idea aims for. */
function ShareBar({ before, after, target, label }: { before: number; after: number; target: number; label: string }) {
  const max = Math.max(before, after, target) * 1.15 || 1;
  const w = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return (
    <div className="mt-2.5">
      <div
        role="img"
        aria-label={`${label}: ${fmtPct(before)} now, ${fmtPct(after)} after, line at ${fmtPct(target)}`}
        className="relative h-2 w-full overflow-hidden rounded-[2px] bg-oa-bg"
      >
        <span className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--oa-muted-fg)_35%,transparent)]" style={{ width: w(before) }} />
        <span className="absolute inset-y-0 left-0 bg-oa-primary" style={{ width: w(after) }} />
        <span className="absolute inset-y-[-2px] w-px bg-oa-fg" style={{ left: w(target) }} />
      </div>
      <div className={`${NUM} mt-1 flex flex-wrap justify-between gap-x-3 text-[12.5px] leading-4 text-oa-muted-fg`}>
        <span>
          <span className="text-oa-fg">{fmtPct(after)}</span> after · {fmtPct(before)} now
        </span>
        <span>line at {fmtPct(target)}</span>
      </div>
    </div>
  );
}

function taxWord(value: number): string {
  if (Math.abs(value) < 5) return "about no tax";
  return value > 0 ? `about ${usd(value)} in tax` : `about ${usd(value)} less tax`;
}

/** "at the 24% short-term rate", or both rates when the sale mixes the two. */
function rateWords(tax: SaleTax, rates: TaxRates): string {
  const short = Math.abs(tax.short) >= 1 || Math.abs(tax.unknown) >= 1;
  const long = Math.abs(tax.long) >= 1;
  if (short && long) return `at ${rates.short}% on the short-term part and ${rates.long}% on the long-term part`;
  if (long) return `at the ${rates.long}% long-term rate`;
  return Math.abs(tax.unknown) >= 1
    ? `at the ${rates.short}% short-term rate, since we do not know when it was bought`
    : `at the ${rates.short}% short-term rate`;
}

function TaxLine({ tax, cheaper, rates, name, example }: { tax: SaleTax | null; cheaper: SaleTax | null; rates: TaxRates; name: string; example: boolean }) {
  if (!tax) {
    return <p className="mt-2 text-[13.5px] leading-5 text-oa-muted-fg">We do not have a cost for {name}, so there is no tax estimate.</p>;
  }
  const gainWord = tax.gain >= 0 ? `a gain of ${usd(tax.gain)}` : `a loss of ${usd(tax.gain)}`;
  return (
    <div className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-fg">
      <p>
        <span className="oa-caption mr-1.5">Tax</span>
        That sale is {gainWord}: {taxWord(tax.tax)} {rateWords(tax, rates)}.
        {tax.unmatchedShares > 0 ? ` ${Math.round(tax.unmatchedShares)} of the shares have no cost on record and are left out.` : ""}
      </p>
      {tax.waitUntil && tax.waitTax !== null ? (
        <p className="mt-1 text-oa-muted-fg">
          These shares turn long term on {fmtDay(tax.waitUntil, true)}. Selling then at today&apos;s price would be {taxWord(tax.waitTax)}.
        </p>
      ) : null}
      {cheaper ? (
        <p className="mt-1 text-oa-muted-fg">
          Selling {example ? "the" : "your"} highest-cost shares first instead would be {taxWord(cheaper.tax)}; most brokers let you pick which lots to sell.
        </p>
      ) : null}
    </div>
  );
}

function Reason({ call, reason }: { call: CallWord | null; reason: string | null }) {
  if (!call) return null;
  return (
    <p className="mt-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
      <span className="font-medium text-oa-fg">Our call is {callPlain(call)}.</span> {reason ?? ""}
    </p>
  );
}

const KIND_LABEL: Record<TrimIdea["kind"], string> = { company: "Too much in one company", sector: "Too much in one sector", drift: "Grew past its share" };

function TrimRow({ trim, rates, example }: { trim: TrimIdea; rates: TaxRates; example: boolean }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Ticker symbol={trim.ticker} name={trim.name} />
        <div className="flex items-center gap-2">
          <CallTag call={trim.call} />
          <Tag caps={false} tone="primary">
            Sell about {trim.shares} {sharesWord(trim.shares)}
          </Tag>
        </div>
      </div>
      <p className="oa-caption mt-2">{KIND_LABEL[trim.kind]}</p>
      <p className="mt-1 text-pretty text-[15px] leading-[22px] text-oa-fg">{trim.sentence}</p>
      <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
        {trim.why} That is about {usd(trim.amount)}, {fmtPct(trim.ofHolding)} of the holding.
      </p>
      <ShareBar before={trim.before} after={trim.after} target={trim.target} label={trim.subject} />
      <TaxLine tax={trim.tax} cheaper={trim.cheaper} rates={rates} name={trim.name} example={example} />
      <Reason call={trim.call} reason={trim.callReason} />
    </li>
  );
}

/**
 * Above the line, but our call is Buy more or Keep: said as information, with no sale
 * and no share count. `brief` when the quiet line above already said it is
 * above the line and why we would not sell.
 */
function HeldRow({ row, where, brief }: { row: RebalancePlan["buyMoreOver"][number]; where: string; brief: boolean }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Ticker symbol={row.ticker} name={row.name} />
        <CallTag call={row.call} />
      </div>
      <p className="mt-2 text-pretty text-[15px] leading-[22px] text-oa-fg">
        {brief
          ? `${row.ticker} is ${fmtPct(row.pct)} of ${where}.${row.call === "Add" ? " Adding more would make it bigger still." : ""}`
          : `${row.ticker} is ${fmtPct(row.pct)} of ${where}, above the ${COMPANY_LINE}% line. Our call is ${row.call === "Add" ? "Buy more" : "Keep"}, so we would not sell it.${
              row.call === "Add" ? ` Adding more would make ${where} lean on it even harder.` : ""
            }`}
      </p>
      {row.callReason ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{row.callReason}</p> : null}
    </li>
  );
}

function HeldList({ plan, where, brief = false }: { plan: RebalancePlan; where: string; brief?: boolean }) {
  if (plan.buyMoreOver.length === 0) return null;
  return (
    <div className="border-t border-oa-border">
      <p className="oa-caption px-4 pt-3">Above the line, but we would not sell</p>
      <ul className="divide-y divide-oa-border">
        {plan.buyMoreOver.map((row) => (
          <HeldRow key={row.ticker} row={row} where={where} brief={brief && plan.small.length === 0} />
        ))}
      </ul>
    </div>
  );
}

function AddRow({ add }: { add: AddIdea }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Ticker symbol={add.ticker} name={add.name} />
        <div className="flex items-center gap-2">
          <CallTag call={add.call} />
          <Tag caps={false} tone="up">
            Buy about {add.shares} {sharesWord(add.shares)}
          </Tag>
        </div>
      </div>
      <p className="mt-2 text-pretty text-[15px] leading-[22px] text-oa-fg">{add.sentence}</p>
      {add.callReason ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{add.callReason}</p> : null}
    </li>
  );
}

function RebalancePanel({ view }: { view: IdeasData }) {
  const { plan, rates } = view;
  const taxTotal = plan.taxTotal;
  const summary =
    plan.trims.length > 0
      ? `${plan.trims.length} ${plan.trims.length === 1 ? "sale" : "sales"} · ${usd(plan.proceeds)}${
          taxTotal !== null ? ` · ${Math.abs(taxTotal) < 5 ? "about no tax" : taxTotal > 0 ? `tax about ${usd(taxTotal)}` : `tax lower by ${usd(taxTotal)}`}` : ""
        }`
      : null;
  const others = [...plan.moreOver, ...plan.unsized, ...plan.fundOnly, ...plan.small];
  const where = portfolioWord(view.subject);
  return (
    <Panel label="Trim this, add that" right={summary ? <span className={`${NUM} hidden sm:inline`}>{summary}</span> : null} flush>
      {summary ? <p className={`${NUM} border-b border-oa-border px-4 py-2 text-[12.5px] text-oa-muted-fg sm:hidden`}>{summary}</p> : null}
      {plan.trims.length === 0 ? (
        <>
          <div className="px-4 py-4">
            {/* The read above already says why (plan.quiet), so the panel says it once, briefly. */}
            <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">Nothing to sell for size.</p>
            <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">Doing nothing costs no tax and no trading fees, and it is often the right call.</p>
          </div>
          <HeldList plan={plan} where={where} brief />
        </>
      ) : (
        <>
          <ul className="divide-y divide-oa-border">
            {plan.trims.map((trim) => (
              <TrimRow key={trim.id} trim={trim} rates={rates} example={view.subject === "example"} />
            ))}
          </ul>
          {others.length > 0 ? (
            <p className="border-t border-oa-border px-4 py-3 text-pretty text-[14px] leading-5 text-oa-muted-fg">
              {joinList(others.map((row) => `${row.name} (${fmtPct(row.pct)})`))} {others.length === 1 ? "is" : "are"} above the line too
              {plan.moreOver.length > 0 ? `; with ${view.subject === "example" ? "a portfolio" : "your portfolio"} this concentrated, these ideas start with the biggest three` : ""}
              {plan.unsized.length > 0 ? "; a holding with no share count or price cannot be sized" : ""}
              {plan.fundOnly.length > 0 ? "; a company held only through funds has no stock of its own to trim" : ""}
              {plan.small.length > 0 ? `; a trim under ${usd(TRIM_MIN_USD)} or ${TRIM_MIN_POINTS} points of the portfolio is too small to be worth making` : ""}.
            </p>
          ) : null}
          <HeldList plan={plan} where={where} />
          <div className="border-t border-oa-border px-4 pb-1 pt-3">
            <p className="oa-caption">Where the money could go</p>
            {plan.adds.length === 0 ? (
              <p className="mt-1 pb-2.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">
                No holding fits: an add goes only to a Buy more call, in a sector that is not already heavy, that stays under 8% of the portfolio and is not listed as a loss to sell. The {usd(plan.proceeds)} could sit in cash until one does.
              </p>
            ) : null}
          </div>
          {plan.adds.length > 0 ? (
            <>
              <ul className="divide-y divide-oa-border">
                {plan.adds.map((add) => (
                  <AddRow key={add.id} add={add} />
                ))}
              </ul>
              {plan.leftover >= 100 ? (
                <p className="border-t border-oa-border px-4 py-3 text-pretty text-[14px] leading-5 text-oa-muted-fg">
                  That leaves about {usd(plan.leftover)} with nowhere we would add, which could sit in cash.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function SimilarRow({ pick }: { pick: SimilarPick }) {
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Ticker symbol={pick.ticker} name={pick.name} size={18} wrap href={pick.fund ? null : undefined} />
        <div className="flex items-center gap-2">
          {pick.held ? <Tag caps={false}>Already held</Tag> : null}
          <CallTag call={pick.call} />
        </div>
      </div>
      <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{pick.why}</p>
    </li>
  );
}

function lossRateWords(loss: LossIdea, rates: TaxRates): string {
  const short = loss.short + loss.unknown < -0.5;
  const long = loss.long < -0.5;
  if (short && long) return `at ${rates.short}% on the short-term part and ${rates.long}% on the long-term part`;
  return long ? `at the ${rates.long}% long-term rate` : `at the ${rates.short}% short-term rate`;
}

function LossRow({ loss, rates, example }: { loss: LossIdea; rates: TaxRates; example: boolean }) {
  const mixed = loss.short + loss.unknown < -0.5 && loss.long < -0.5;
  const termWord = mixed || loss.term === "unknown" ? "" : `${loss.term}-term `;
  const recent = loss.recentBuy
    ? loss.recentIsSave
      ? `${example ? "This holding was" : "You"} saved ${example ? "" : "this holding "}on ${fmtDay(loss.recentBuy, true)}; if shares were bought then, a sale at a loss now could be a wash sale.`
      : `${example ? "It was" : "You"} bought ${example ? "" : "it "}on ${fmtDay(loss.recentBuy, true)}, inside the last 30 days, so a sale at a loss now could be a wash sale.`
    : `After a sale, wait until ${fmtDay(loss.buyBackFrom, true)} to buy ${loss.ticker} back, or the loss is put off.`;
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <Ticker symbol={loss.ticker} name={loss.name} />
        <div className="flex items-center gap-2">
          <CallTag call={loss.call} />
          <Tag caps={false} tone="down">
            {usd(loss.loss).replace("$", "−$")} · −{Math.abs(Math.round(loss.lossPct))}%
          </Tag>
        </div>
      </div>
      <p className="mt-2 text-pretty text-[15px] leading-[22px] text-oa-fg">
        {fmtShares(loss.shares)} {sharesWord(loss.shares)} cost {usd(loss.cost)} and are worth {usd(loss.value)}, a {termWord}loss of {usd(loss.loss)}.{" "}
        {loss.taxSaved >= 5
          ? `Selling could cut tax by about ${usd(loss.taxSaved)} ${lossRateWords(loss, rates)}, if there are gains to set it against.`
          : "Selling would record the loss for tax, to set against gains."}
      </p>
      <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
        {recent}
        {loss.longTermOn ? ` It turns long term on ${fmtDay(loss.longTermOn, true)}; a loss taken before then counts as short term, which offsets the higher-taxed gains.` : ""}
        {loss.call === "Add" || loss.call === "Hold"
          ? ` Our call is ${loss.call === "Add" ? "Buy more" : "Keep"}, so this would only be a sale for the tax: ${
              loss.similar.length > 0
                ? `holding a similar ${loss.fund ? "fund" : "company"} from the list below meanwhile keeps the exposure.`
                : "you would be without the stock until the 30 days are up."
            }`
          : loss.call === "Trim"
            ? " Our call on it is Sell some, so selling fits our call as well."
            : ""}
      </p>
      <div className="mt-2.5 rounded border border-oa-border bg-oa-bg px-3 pb-1 pt-1.5">
        <p className="oa-caption pt-1">{loss.fund ? "Funds" : "Stocks"} that keep a similar exposure meanwhile</p>
        {loss.similar.length > 0 ? (
          <ul className="divide-y divide-oa-border">
            {loss.similar.map((pick) => (
              <SimilarRow key={pick.ticker} pick={pick} />
            ))}
          </ul>
        ) : (
          <p className="py-2.5 text-[13.5px] leading-5 text-oa-muted-fg">
            We do not have enough on {loss.name} to name a look-alike {loss.fund ? "fund" : "stock"}.
          </p>
        )}
      </div>
    </li>
  );
}

function LossWatch({ losses }: { losses: LossIdea[] }) {
  const watched = losses.filter((loss) => loss.watch && loss.shares > 0);
  if (watched.length === 0) return null;
  const href = watched.length === 1 ? watched[0]!.watch!.href : watchDropsHref(watched.map((loss) => ({ ticker: loss.ticker, price: loss.value / loss.shares })), 5);
  if (!href) return null;
  return (
    <p className="border-t border-oa-border px-4 py-2.5">
      <Link href={href} prefetch={false} className={`rounded text-[13.5px] font-medium leading-5 text-oa-primary hover:underline ${FOCUS}`}>
        {watched.length === 1 ? watched[0]!.watch!.label : "Tell me if any of these falls another 5%"}
      </Link>
    </p>
  );
}

function LossPanel({ view }: { view: IdeasData }) {
  const { losses, rates } = view;
  const total = losses.reduce((sum, loss) => sum + loss.loss, 0);
  const saved = losses.reduce((sum, loss) => sum + loss.taxSaved, 0);
  return (
    <Panel
      label="Losses you could sell for tax"
      right={losses.length > 0 ? <span className={`${NUM} hidden sm:inline`}>{usd(total).replace("$", "−$")} · could save up to {usd(saved)}</span> : null}
      flush
    >
      {losses.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">
            {view.basis === "none"
              ? "We need what you paid to find losses. Add an average cost on Portfolio, or your buys on the Taxes page."
              : `No holding is at least ${LOSS_PCT}% and $${LOSS_MIN} below ${view.subject === "example" ? "what was paid" : "what you paid"}, so there is no loss worth selling for tax today.`}
          </p>
        </div>
      ) : (
        <>
          <p className={`${NUM} border-b border-oa-border px-4 py-2 text-[12.5px] text-oa-muted-fg sm:hidden`}>
            {usd(total).replace("$", "−$")} · could save up to {usd(saved)}
          </p>
          <p className="border-b border-oa-border px-4 py-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{WASH_SALE_SENTENCE}</p>
          <ul className="divide-y divide-oa-border">
            {losses.map((loss) => (
              <LossRow key={loss.id} loss={loss} rates={rates} example={view.subject === "example"} />
            ))}
          </ul>
          {/* One watch for every loss on the list, not a link under each one (owner, Nov 11). */}
          <LossWatch losses={losses} />
        </>
      )}
    </Panel>
  );
}

function BasisNote({ view }: { view: IdeasData }) {
  if (view.subject === "example") return <>The shares and buy days in the example are made up; each cost is the real close on its buy day.</>;
  if (view.basis === "lots") return <>Costs and dates are the lots you entered on the Taxes page.</>;
  if (view.basis === "saved" || view.basis === "mixed")
    return (
      <>
        Where you entered lots on the Taxes page we use them. Otherwise we count a holding from the day you saved it, at its average cost, so shares bought earlier may already be long term, and a holding with no cost gets no estimate.{" "}
        <Link href="/portfolio/taxes" className="font-medium text-oa-primary hover:underline">
          Add your buys on the Taxes page
        </Link>{" "}
        for exact dates.
      </>
    );
  return <>We have no costs for your holdings, so there are no tax estimates.</>;
}

function Aside({ view }: { view: IdeasData }) {
  return (
    <div className="flex flex-col gap-3">
      <Panel label="Tax rates we assume">
        <RatePicker rates={view.rates} />
      </Panel>
      <Panel label="Before you act">
        <ul className="flex flex-col gap-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          <li>These are ideas worked out from the numbers, not advice, and not tax advice. We do not see your whole tax year.</li>
          <li>The look-alikes for a loss are similar by our data, not a recommendation. They will not move exactly the same way.</li>
          <li>Nothing here buys or sells. Any trade is yours to make at your broker.</li>
          <li>
            The tax is a rough estimate with US federal rules made simple: the two rates above, no state tax, and the oldest shares sold first.
          </li>
          <li>
            No trim idea sells a stock our call says to keep or buy more of, and we leave out any sale under {usd(TRIM_MIN_USD)} or under {TRIM_MIN_POINTS} points of the
            portfolio.
          </li>
          <li>
            <BasisNote view={view} />
          </li>
        </ul>
      </Panel>
    </div>
  );
}

export function IdeasView({ view }: { view: IdeasData }) {
  return (
    <div className="flex flex-col gap-3">
      <TheRead read={view.read} label={view.subject === "example" ? "The read on this portfolio" : "The read on your portfolio"} askContext={view.subject === "example" ? "ex.portfolio" : "portfolio"} />
      {/* On a phone the caveats sit after both panels, so the short version comes first. */}
      <p className="px-2 text-pretty text-[13px] leading-5 text-oa-muted-fg sm:px-0 lg:hidden">
        Ideas worked out from the numbers, not advice and not tax advice. Nothing here buys or sells.
      </p>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <RebalancePanel view={view} />
          <LossPanel view={view} />
        </div>
        <div className="lg:sticky lg:top-4">
          <Aside view={view} />
        </div>
      </div>
    </div>
  );
}
