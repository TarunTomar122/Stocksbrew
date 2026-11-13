import { absoluteDay, etToday } from "@/lib/day-words";
import type { Comparison } from "@/lib/filing-changes/diff";
import { getFilingChangesView } from "@/lib/filing-changes/server";
import type { FilingChangesView } from "@/lib/filing-changes/store";
import { changesTitle, filingWords, quietLine, quote, WHOLE_WORDS } from "@/lib/filing-changes/words";

import { NUM, Panel } from "./primitives";

/**
 * What a company changed in its risk factors: the newest 10-K or 10-Q that added, dropped or reworded a risk, set
 * against the filing it should be read with (lib/filing-changes). Every risk is the company's own heading (the loader shows a
 * Title Case one as a sentence): new ones whole; dropped ones whole up to WHOLE_WORDS words, longer ones cut at a clause
 * with the row linking to the filing that had them; reworded ones with their old wording under them. Nothing lives
 * only in a hover title. The counts are words in plain ink, never green and red (those are gains and losses). No
 * section when there is no readable comparison with a change. Server only; it loads its own data, so it can sit in a
 * Suspense boundary of its own.
 */

/** How tall a group grows before it scrolls inside (owner rule 5: about 8 rows; headings run to two or three lines). */
const ROW_CAP_REM = 30;

export async function FilingChanges({ ticker }: { ticker: string }) {
  let view: FilingChangesView | null = null;
  try {
    view = await getFilingChangesView(ticker);
  } catch (error) {
    console.warn("[filing-changes] read failed; section left out:", error instanceof Error ? error.message : error);
    return null;
  }
  return view ? <FilingChangesPanel view={view} today={etToday()} /> : null;
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const ROW = "border-b border-oa-border px-3.5 py-2.5 text-pretty text-[14.5px] leading-5 last:border-b-0 sm:px-4";

type Row = { key: string; text: string; was?: string | null; href?: string | null };

function RiskGroup({ label, rows, muted }: { label: string; rows: Row[]; muted?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="border-b border-oa-border last:border-b-0">
      <h4 className="oa-caption px-3.5 pb-1 pt-3 sm:px-4">{label}</h4>
      <ul aria-label={label} className="flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maxHeight: `${ROW_CAP_REM}rem` }}>
        {rows.map((row) => (
          <li key={row.key} className="border-b border-oa-border last:border-b-0">
            {row.href ? (
              // A dropped risk too long to show whole: the row opens the filing that had it, in a new tab.
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block ${ROW} outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent ${muted ? "text-oa-muted-fg" : "text-oa-fg"}`}
              >
                {row.text}
              </a>
            ) : (
              <div className={`${ROW} ${muted ? "text-oa-muted-fg" : "text-oa-fg"}`}>
                {row.text}
                {row.was ? <p className="mt-1 text-[13px] leading-[18px] text-oa-muted-fg">{`Was: ${row.was}`}</p> : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "1 new · 3 dropped", in the page's plain ink: a new risk is not a loss, nor a dropped one a gain. Reworded counts only when listed. */
function countsWords(comparison: Comparison, rewordedListed: boolean): string {
  const repeated = comparison.repeated?.length ?? 0;
  return [
    comparison.added.length ? `${comparison.added.length} new` : null,
    repeated ? `${repeated} from an earlier 10-Q` : null,
    comparison.dropped.length ? `${comparison.dropped.length} dropped` : null,
    rewordedListed && comparison.reworded.length ? `${comparison.reworded.length} reworded` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function FilingChangesPanel({ view, today }: { view: FilingChangesView; today: string }) {
  const { shown, quiet, ticker, company } = view;
  const filing = shown.filing;
  const base = shown.base;
  const repeated = shown.repeated ?? [];
  const onlyReworded = shown.added.length + repeated.length + shown.dropped.length === 0;
  const quietText = quiet ? quietLine(quiet, today) : null;
  const counts = countsWords(shown, onlyReworded);
  const whole = (heading: string): Row => ({ key: heading, text: heading });
  const dropped = shown.dropped.map((heading): Row => (words(heading) <= WHOLE_WORDS ? { key: heading, text: heading } : { key: heading, text: quote(heading).text, href: base?.url ?? null }));
  const reworded = onlyReworded ? shown.reworded.map((pair): Row => ({ key: pair.to, text: pair.to, was: pair.from })) : [];
  return (
    <Panel id="filing-changes" label={changesTitle(ticker)} className="scroll-mt-16 lg:scroll-mt-4">
      <div className="flex flex-col gap-1 border-b border-oa-border px-3.5 py-3 text-[14px] leading-5 sm:px-4">
        {/* The comparison the lists below come from, first; anything filed since, after it. */}
        <p className="text-oa-muted-fg">
          {"In its "}
          <a
            href={filing.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${company} ${filing.form} on SEC EDGAR (opens in a new tab)`}
            className="font-medium text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] underline-offset-4 outline-none transition-colors hover:decoration-oa-primary focus-visible:decoration-oa-primary"
          >
            {filingWords(filing.form, filing.filed, today)}
            <span aria-hidden>{" ↗"}</span>
          </a>
          {base ? (
            <>
              {`, against its ${base.form} from `}
              <span className="whitespace-nowrap">{absoluteDay(base.filed, today)}</span>
            </>
          ) : null}
          {counts ? <span className={`${NUM} whitespace-nowrap text-[13px]`}>{` · ${counts}`}</span> : null}
        </p>
        {quietText ? <p className="text-[13px] leading-4 text-oa-muted-fg">{quietText}</p> : null}
      </div>
      <RiskGroup label="New risks" rows={shown.added.map(whole)} />
      <RiskGroup label="Still new since its 10-K" rows={repeated.map(whole)} />
      <RiskGroup label="Dropped" rows={dropped} muted />
      <RiskGroup label="Reworded" rows={reworded} />
    </Panel>
  );
}
