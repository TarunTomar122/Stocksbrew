import { Suspense } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { focusNoticed, prioritise } from "@/lib/portfolio-home/focus";
import { askFor } from "@/lib/portfolio-home/loop";
import { MAX_QUESTIONS, pickQuestions } from "@/lib/portfolio-home/questions";
import { feedSources, type HomeLoad } from "@/lib/portfolio-home/server";

/**
 * My stocks has no Ask box of its own (owner rule 1: the shell's Ask is the page's one Ask). This hands the shell's
 * panel the page's item (your stocks, or the example's) and the questions the box used to offer: the lead findings'
 * own questions first, then ones drawn from the holdings. Nothing visible, nothing asked until someone taps one.
 */
export async function PortfolioAskHint({ load }: { load: HomeLoad }) {
  // The page's item as soon as it is known (one quick read), so a panel opened early already starts from the right
  // stocks; the questions follow once the findings are in. The panel takes the hint with the most questions.
  const { mode } = await load.context;
  const context = mode === "mine" ? "portfolio" : "ex.portfolio";
  return (
    <>
      <AskPageHint context={context} />
      <Suspense fallback={null}>
        <PortfolioQuestions load={load} context={context} />
      </Suspense>
    </>
  );
}

async function PortfolioQuestions({ load, context }: { load: HomeLoad; context: string }) {
  const [{ mode, viewer }, sources] = await Promise.all([load.context, feedSources(load)]);
  const noticed = focusNoticed(sources, mode, viewer.plan);
  const { lead } = prioritise(noticed, sources, mode, viewer.plan);
  const leadIds = new Set(lead.map((item) => item.id));
  const fromLead = lead
    .map((item) => askFor(item, mode))
    .filter((ask): ask is NonNullable<typeof ask> => Boolean(ask))
    .slice(0, 2);
  const rest = pickQuestions({
    lead: [],
    rest: noticed.filter((item) => !leadIds.has(item.id)),
    sources,
    mode,
    skip: fromLead.map((ask) => ask.question),
  });
  const questions = [...fromLead, ...rest].slice(0, MAX_QUESTIONS);
  if (questions.length === 0) return null;
  return <AskPageHint context={context} questions={questions} />;
}

