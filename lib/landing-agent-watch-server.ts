/**
 * The reads behind the landing's "Tell it what to watch, in plain English" (lib/landing-agent-watch.ts). Shared by
 * every visitor: each card's work is cached for half an hour per New York day, and nothing is written (the replay and
 * the thesis are worked out and shown, never stored). On the page each card waits at most CARD_TIMEOUT_MS; past it the card is left
 * out of that render while its read keeps filling the cache for the next visitor.
 */

import { fromTheme } from "@/lib/basket-agent/start";
import { replayDraft } from "@/lib/basket-agent/data";
import { etToday } from "@/lib/day-words";
import { getFilingChangesFor } from "@/lib/filing-changes/server";
import {
  EXAMPLE_LINES,
  EXAMPLE_THESIS,
  REPLAY_THEME,
  pickEarningsCard,
  pickFilingCard,
  pickMoveCard,
  pickLineCard,
  replayCard,
  thesisSentence,
  type EarningsCard,
  type FilingCard,
  type MoveCard,
  type LineCard,
  type ReplayCard,
  type ThesisCard,
} from "@/lib/landing-agent-watch";
import { EXAMPLE_STOCK_TICKERS, loadExamplePortfolio } from "@/lib/portfolio-data";
import { loadExampleAgentsSource } from "@/lib/portfolio-home/example-check-server";
import { sharedCache } from "@/lib/shared-cache";
import { risksOf, rollUp } from "@/lib/thesis-monitor/check";
import { conditionInputsFor } from "@/lib/thesis-watch/condition-data";
import { judgeConditions } from "@/lib/thesis-watch/conditions";

/** How long the page waits for one card before leaving it out. */
export const CARD_TIMEOUT_MS = 2000;
const REVALIDATE_SECONDS = 30 * 60;

/** The stocks whose filings can lead the filing card: the example portfolio's own (the request says "a company I own"). */
const FILING_POOL = [...EXAMPLE_STOCK_TICKERS];

const loadFiling = sharedCache(
  async (today: string): Promise<FilingCard | null> => pickFilingCard(await getFilingChangesFor(FILING_POOL), today),
  ["landing-agent-watch-filing-v2"],
  { revalidate: REVALIDATE_SECONDS },
);

type Lines = { line: LineCard | null; thesis: ThesisCard | null };

const loadLines = sharedCache(
  async (today: string): Promise<Lines> => {
    const tickers = [...new Set(EXAMPLE_LINES.map((entry) => entry.ticker))];
    const [inputs, docs] = await Promise.all([conditionInputsFor(tickers.map((ticker) => `US_${ticker}`), today), getFilingChangesFor(tickers)]);
    // A stock whose figures could not be read is left out by the reader (lib/thesis-watch/condition-data.ts), which a
    // blip can cause: throw rather than cache a thinner answer for everyone for half an hour.
    if (inputs.size < tickers.length) throw new Error(`condition figures for ${inputs.size} of ${tickers.length} stocks`);
    const judged = EXAMPLE_LINES.flatMap(({ ticker, condition }) => {
      const stock = inputs.get(`US_${ticker}`);
      return stock ? judgeConditions([condition], stock, today).map((result) => ({ ticker, result })) : [];
    });
    const line = pickLineCard(judged);
    // What was on file when the thesis was written is context, never news (as lib/thesis-monitor records a baseline);
    // risksOf looks back two weeks, so this only matters if the example's day moves.
    const risks = risksOf(docs, new Set(tickers), today).filter((risk) => risk.filed > EXAMPLE_THESIS.savedAt);
    const rollup = rollUp(
      judged.map(({ ticker, result }) => ({ ticker, status: result.status })),
      risks,
    );
    const risky = new Set(risks.map((risk) => risk.ticker));
    const thesis: ThesisCard = {
      kind: "thesis",
      name: EXAMPLE_THESIS.name,
      status: rollup.status,
      lines: rollup.counts.lines,
      holds: rollup.counts.holds,
      broke: rollup.counts.broke,
      companies: judged.map(({ ticker, result }) => ({ ticker, status: result.status, risk: risky.has(ticker) })),
      line: thesisSentence({ lines: rollup.counts.lines, holds: rollup.counts.holds, broke: rollup.counts.broke, risk: risks[0] ?? null, today }),
    };
    return { line, thesis };
  },
  ["landing-agent-watch-lines-v3"],
  { revalidate: REVALIDATE_SECONDS },
);

const loadReplay = sharedCache(
  async (today: string): Promise<ReplayCard | null> => {
    const start = fromTheme(REPLAY_THEME);
    if (!start) return null;
    // `today` keys the cache only: the replay ends on the last settled close.
    void today;
    const replay = await replayDraft(start.draft);
    // A replay whose reads failed checks few days (replayDraft treats a failed price read as no data): never cache
    // that as "no change" for everyone; throw, and the card waits for a good read.
    const card = replayCard(start.draft.name, REPLAY_THEME, replay);
    if (card && card.checked * 2 < card.marks.length) throw new Error(`replay checked ${card.checked} of ${card.marks.length} days`);
    return card;
  },
  ["landing-agent-watch-replay-v4"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The work, or undefined past `ms` or on a failed read (logged). The work itself keeps running to fill the cache. */
function within<T>(work: Promise<T>, ms: number, name: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[agent-watch] ${name} took longer than ${ms}ms; left out`);
      resolve(undefined);
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        console.warn(`[agent-watch] ${name} failed:`, error instanceof Error ? error.message : "unknown error");
        resolve(undefined);
      },
    );
  });
}

type ExampleBits = { earnings: EarningsCard | null; prices: Record<string, number> };

/**
 * From the example's cached portfolio (lib/portfolio-data.ts, prices and the earnings calendar): its next report, and
 * each stock's current price, shown beside every single-stock card (rule 4).
 */
async function loadExampleBits(today: string): Promise<ExampleBits> {
  const example = await loadExamplePortfolio();
  if (!example) return { earnings: null, prices: {} };
  const prices: Record<string, number> = {};
  for (const position of example.portfolio.positions) {
    if (typeof position.price === "number" && Number.isFinite(position.price) && position.price > 0) prices[position.ticker.toUpperCase()] = position.price;
  }
  return { earnings: pickEarningsCard(example.portfolio.positions, today), prices };
}

/** The example big-move agent's newest run that found a move, over its last few market days (its own short cache and limit). */
async function loadMove(): Promise<MoveCard | null> {
  const source = await loadExampleAgentsSource();
  if (!source) return null;
  return pickMoveCard(
    source.runs
      .filter((run) => run.job_id === "examplebigmove")
      .map((run) => ({ day: run.day, decision: run.decision, findings: run.detail?.findings ?? [] })),
  );
}

export type AgentWatch = {
  today: string;
  /** Current price by ticker, for the example's stocks; a ticker without one shows no price. */
  prices: Record<string, number>;
  earnings: EarningsCard | null;
  move: MoveCard | null;
  filing: FilingCard | null;
  line: LineCard | null;
  replay: ReplayCard | null;
  thesis: ThesisCard | null;
};

/** The section's cards, each bounded on its own. */
export async function loadAgentWatch(now: Date = new Date(), ms: number = CARD_TIMEOUT_MS): Promise<AgentWatch> {
  const today = etToday(now);
  const [bits, move, filing, lines, replay] = await Promise.all([
    within(loadExampleBits(today), ms, "earnings"),
    within(loadMove(), ms, "move"),
    within(loadFiling(today), ms, "filing"),
    within(loadLines(today), ms, "lines"),
    within(loadReplay(today), ms, "replay"),
  ]);
  return { today, prices: bits?.prices ?? {}, earnings: bits?.earnings ?? null, move: move ?? null, filing: filing ?? null, line: lines?.line ?? null, replay: replay ?? null, thesis: lines?.thesis ?? null };
}
