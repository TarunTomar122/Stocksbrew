import { Panel, Ticker, fmtDay } from "@/components/oa/kit";
import { CallTag } from "@/components/screener/shared";
import { RULE_SENTENCE, factsSentence, fillLead, fillsSentence, type IdeaStock } from "@/lib/dividend-ideas";
import type { DividendPlan } from "@/lib/dividend-plan";
import { loadDividendIdeas, type DividendIdeasData } from "@/lib/dividend-ideas-data";

import { AddLine, IdeasAmount } from "./ideas-amount";

/**
 * "For more dividend income": stocks that pass one stated rule, first the ones
 * that pay in the months the holdings leave empty, then the rest by yield.
 * Each row says what an amount the reader picks would add a year. Research,
 * not advice; nothing here places an order.
 */

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_6.5rem]";

function IdeaRow({ stock, fills }: { stock: IdeaStock; fills?: string | null }) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={`w-3 shrink-0 text-[11px] text-oa-muted-fg transition-transform group-open:rotate-90 ${stock.callReason ? "" : "invisible"}`}
        >
          ▸
        </span>
        <Ticker symbol={stock.ticker} name={stock.name} href={null} wrap />
      </span>
      <span className="justify-self-end lg:order-3">
        <CallTag call={stock.call} />
      </span>
      <span className="col-span-2 flex flex-col gap-0.5 pl-5 text-[13.5px] leading-5 lg:order-2 lg:col-span-1 lg:pl-0">
        <AddLine stock={{ name: stock.name, price: stock.price, annualPerShare: stock.annualPerShare, payMonths: stock.payMonths }} fills={fills} />
        <span className="text-oa-muted-fg">{factsSentence(stock)}</span>
      </span>
    </>
  );
  if (!stock.callReason) {
    return (
      <li>
        <div className={ROW_GRID}>{body}</div>
      </li>
    );
  }
  return (
    <li>
      <details className="group">
        <summary
          className={`${ROW_GRID} cursor-pointer list-none outline-none hover:bg-oa-accent focus-visible:bg-oa-accent [&::-webkit-details-marker]:hidden`}
        >
          {body}
        </summary>
        <p className="px-4 pb-3 pl-9 text-[13.5px] leading-5 text-oa-muted-fg lg:pl-[calc(13rem+1.75rem)] lg:pr-[8rem]">
          <span className="font-medium text-oa-fg">{stock.call === "Add" ? "Why we'd buy more:" : "Why we'd keep it:"} </span>
          {stock.callReason}
        </p>
      </details>
    </li>
  );
}

function SubHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-b border-oa-border px-4 pb-2.5 pt-4">
      <h3 className="text-[14.5px] font-medium text-oa-fg">{title}</h3>
      {children ? <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">{children}</p> : null}
    </div>
  );
}

/** Loads its own data, so the page can show the plan while the ideas are read (wrap it in Suspense). */
export async function DividendIdeasSection({ plan, example = false }: { plan: DividendPlan; example?: boolean }) {
  const ideas = await loadDividendIdeas(plan, { example });
  return ideas ? <DividendIdeas ideas={ideas} example={example} /> : null;
}

export function DividendIdeas({ ideas, example = false }: { ideas: DividendIdeasData; example?: boolean }) {
  const lead = fillLead(ideas, example);
  const kind = ideas.target?.kind ?? "empty";
  const nothing = ideas.fill.length === 0 && ideas.steady.length === 0;

  const rows = (
    <>
      {lead ? (
        <section>
          <SubHead title={kind === "quiet" ? "Fill the quiet months" : "Fill the empty months"}>{lead}</SubHead>
          {ideas.fill.length > 0 ? (
            <ul className="divide-y divide-oa-border">
              {ideas.fill.map((stock) => (
                <IdeaRow key={stock.ticker} stock={stock} fills={fillsSentence(stock.fills, ideas.target)} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {ideas.steady.length > 0 ? (
        <section className={lead ? "border-t border-oa-border" : ""}>
          <SubHead title={ideas.fill.length > 0 ? "More steady payers worth a look" : "Steady payers worth a look"}>
            {ideas.steady.length === 1
              ? ideas.fill.length > 0
                ? "One more stock passes the rule."
                : "One stock passes the rule."
              : `${ideas.steady.length} ${ideas.fill.length > 0 ? "more stocks pass" : "stocks pass"} the rule, highest yield first.`}
          </SubHead>
          {/* About eight rows tall on a laptop, most of a phone screen on a phone, then it scrolls inside; the scrollbar stays hidden. */}
          <ul className="scrollbar-hide max-h-[70vh] divide-y divide-oa-border overflow-y-auto lg:max-h-[34rem]">
            {ideas.steady.map((stock) => (
              <IdeaRow key={stock.ticker} stock={stock} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );

  return (
    <Panel label="For more dividend income" flush>
      <div className="flex flex-col gap-1.5 border-b border-oa-border px-4 py-3">
        <p className="text-[14px] leading-5 text-oa-fg">These are stocks to research, not advice. Nothing here buys or sells anything.</p>
        <p className="text-[13.5px] leading-5 text-oa-muted-fg">{RULE_SENTENCE}</p>
      </div>
      {nothing ? (
        <p className="px-4 py-4 text-[14px] leading-5 text-oa-muted-fg">
          {ideas.passed > 0
            ? `Every stock that passes this rule is already in ${example ? "the example portfolio" : "your portfolio"}.`
            : "No stock we cover passes this rule right now."}
        </p>
      ) : (
        <IdeasAmount>{rows}</IdeasAmount>
      )}
      {ideas.watch || ideas.pricesAsOf ? (
        <div className="flex flex-col gap-1 border-t border-oa-border px-4 py-3 text-[13px] leading-5 text-oa-muted-fg">
          {ideas.watch ? <p className="text-oa-fg">{ideas.watch}</p> : null}
          {ideas.pricesAsOf && !nothing ? <p>Yields are each stock&apos;s current dividend rate against the {fmtDay(ideas.pricesAsOf)} close.</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
