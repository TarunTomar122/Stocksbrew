"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Box, NUM, price, signedPct, type CardQuote } from "@/components/basket-agent/parts";
import { OaButton } from "@/components/oa/button";
import { StockLogo } from "@/components/stock-logo";
import { ConditionsPicker, draftOf, parseDrafts, type DraftCondition } from "@/components/thesis/conditions-picker";
import { instrumentIdOf } from "@/lib/basket-agent/model";
import { shortCompanyName } from "@/lib/plain-copy";
import { trackThesisCreated } from "@/lib/product-analytics";
import { MAX_COMPANIES, MAX_NAME, MAX_STATEMENT, MIN_HOLDINGS, type ThesisLine } from "@/lib/thesis-monitor/model";

const FIELD =
  "w-full rounded-md border border-oa-border bg-oa-card px-3 py-2 text-[14px] leading-5 text-oa-fg outline-none placeholder:text-oa-muted-fg focus:border-[color-mix(in_srgb,var(--oa-fg)_40%,transparent)]";

export type EditorCompany = { ticker: string; company: string | null; quote: CardQuote };

/**
 * The thesis editor: the thesis in the person's words, then each company with its "Holds if…" lines from the
 * conditions picker (the figures we store, prefilled from the company's own value, with a now-vs-line bar). Over
 * holdings, every holding is listed and the ones given a line are in the thesis; on an idea basket, the basket's
 * companies are listed. One Save at the end; nothing is written before it.
 */
export function ThesisEditor({
  mode,
  basketId = null,
  version,
  initial,
  companies,
}: {
  mode: "holdings" | "basket";
  /** The basket being edited; null for a new thesis over holdings. */
  basketId?: string | null;
  /** The thesis version the editor opened (0 when the basket has none yet). */
  version: number;
  initial: { name: string; statement: string; lines: ThesisLine[] };
  companies: EditorCompany[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initial.name);
  const [statement, setStatement] = React.useState(initial.statement);
  const [drafts, setDrafts] = React.useState<Record<string, DraftCondition[]>>(() =>
    Object.fromEntries(initial.lines.map((line) => [line.ticker, line.conditions.map(draftOf)])),
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const withLines = companies.filter((company) => (drafts[company.ticker] ?? []).length > 0);
  const lineTotal = withLines.reduce((sum, company) => sum + (drafts[company.ticker]?.length ?? 0), 0);
  const minimum = mode === "holdings" ? MIN_HOLDINGS : 1;
  const ready = statement.trim().length > 0 && withLines.length >= minimum && withLines.length <= MAX_COMPANIES;

  const save = async () => {
    setError(null);
    const lines: ThesisLine[] = [];
    for (const company of withLines) {
      const conditions = parseDrafts(drafts[company.ticker] ?? []);
      if (!conditions) {
        setError(`Check ${company.ticker}'s numbers: each line needs a number in range.`);
        return;
      }
      lines.push({ ticker: company.ticker, conditions });
    }
    setBusy(true);
    try {
      const response = await fetch(basketId ? `/api/theses/${encodeURIComponent(basketId)}` : "/api/theses", {
        method: basketId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statement, name: mode === "holdings" ? name : undefined, lines, ...(basketId ? { version } : {}) }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; href?: string; error?: string } | null;
      if (!response.ok || !body?.ok || !body.href) {
        setError(body?.error || "That didn't save. Try again in a minute.");
        return;
      }
      if (!basketId) trackThesisCreated();
      router.push(body.href);
      router.refresh();
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Box label="Your thesis">
        <div className="flex flex-col gap-3">
          {mode === "holdings" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-oa-muted-fg">Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_NAME} placeholder="AI infrastructure" className={FIELD} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-oa-muted-fg">What you believe</span>
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              maxLength={MAX_STATEMENT}
              rows={2}
              placeholder="AI infrastructure demand keeps growing"
              className={`${FIELD} resize-y`}
            />
          </label>
        </div>
      </Box>

      <section aria-label="Lines" className="flex min-w-0 flex-col gap-2">
        {/* "Holds if…" once for every card; each card only picks its figures. */}
        <h2 className="flex flex-wrap items-baseline gap-x-2 px-1 text-[15px] font-semibold leading-6 text-oa-fg">
          {mode === "holdings" ? "Each holding holds if…" : "Each company holds if…"}
          <span className={`${NUM} text-[13px] font-medium text-oa-muted-fg`}>
            {lineTotal === 0 ? `${companies.length} to pick from` : `${lineTotal} ${lineTotal === 1 ? "line" : "lines"} on ${withLines.length} of ${companies.length}`}
          </span>
        </h2>
        {/* Two columns (the picker's menu, side, number and bar need the width), each card its own height. */}
        <div className="[container-type:inline-size]">
          <ul className="-mb-3 [column-gap:0.75rem] [@container(min-width:34rem)]:columns-2">
          {companies.map((company) => (
            <EditorCard
              key={company.ticker}
              company={company}
              drafts={drafts[company.ticker] ?? []}
              onChange={(next) => setDrafts((current) => ({ ...current, [company.ticker]: next }))}
            />
          ))}
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 px-1">
        {error ? (
          <p role="alert" className="mr-auto max-w-xl text-[13.5px] leading-5 text-signal-bearish">
            {error}
          </p>
        ) : !ready ? (
          <p className="mr-auto text-[13.5px] leading-5 text-oa-muted-fg">
            {!statement.trim()
              ? "Say what you believe first."
              : withLines.length > MAX_COMPANIES
                ? `A thesis spans up to ${MAX_COMPANIES} companies. Take the lines off a few.`
                : mode === "holdings"
                  ? `Give at least ${MIN_HOLDINGS} holdings a line.`
                  : "Give at least one company a line."}
          </p>
        ) : null}
        <OaButton onClick={save} disabled={!ready || busy}>
          {busy ? "Saving…" : basketId ? "Save lines" : "Start watching"}
        </OaButton>
      </div>
    </div>
  );
}

function EditorCard({ company, drafts, onChange }: { company: EditorCompany; drafts: DraftCondition[]; onChange: (next: DraftCondition[]) => void }) {
  const name = shortCompanyName(company.company ?? "") || null;
  return (
    <li className={`oa-surface mb-3 flex min-w-0 break-inside-avoid flex-col gap-2 border bg-oa-card px-3.5 pb-3 pt-3 ${drafts.length > 0 ? "border-[color-mix(in_srgb,var(--oa-fg)_35%,transparent)]" : "border-oa-border"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={company.ticker} size={28} />
          <div className="min-w-0 leading-5">
            <p className="oa-mono text-[14px] font-semibold text-oa-fg">{company.ticker}</p>
            {name && name.toUpperCase() !== company.ticker ? (
              <p className="truncate text-[12.5px] leading-4 text-oa-muted-fg" title={company.company ?? undefined}>
                {name}
              </p>
            ) : null}
          </div>
        </div>
        {company.quote ? (
          <div className={`${NUM} shrink-0 text-right leading-5`}>
            <p className="text-[14px] font-semibold text-oa-fg">{price(company.quote.price)}</p>
            {company.quote.dayPct !== null ? (
              <p className={`text-[12.5px] leading-4 ${company.quote.dayPct > 0.05 ? "text-signal-bullish" : company.quote.dayPct < -0.05 ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
                {signedPct(company.quote.dayPct)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConditionsPicker instrumentId={instrumentIdOf(company.ticker)} drafts={drafts} onChange={onChange} bare />
    </li>
  );
}
