import * as React from "react";
import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import { formatAskContext, parseAskContext } from "@/lib/ask-context";
import { figureOf, type Insight, type InsightAction, type TheRead as TheReadData } from "@/lib/insights";

/**
 * The page's read: a one-line headline, then up to three insights as cards
 * side by side, each with its key figure, the stocks it touches, the sentence
 * and where to act. Goes at the top of a page or panel, above the data it was
 * drawn from. Renders nothing when there is no insight, so a page never shows
 * an empty box.
 */
export function TheRead({
  read,
  label = "The read",
  className = "",
  visual,
  askContext,
}: {
  read: TheReadData | null | undefined;
  label?: string;
  className?: string;
  /**
   * @deprecated Ignored. The read used to fold its cards behind a "Show 2 more points" button on phones; the
   * owner wants every insight in view (rule 2: don't make people click to read), and there are at most three.
   * Kept so callers that still pass it compile.
   */
  fold?: "phone" | "always";
  /** @deprecated Ignored, see `fold`. */
  foldLabel?: string;
  /** @deprecated Ignored, see `fold`. */
  foldKeep?: number;
  /** A small picture of the headline, drawn right under it (the briefing's sector strip). */
  visual?: React.ReactNode;
  /**
   * What a card's "Ask about this" starts from (lib/ask-context.ts). A card about one stock opens that stock
   * (`stock:NVDA`) unless this says otherwise; a card about several stocks, or none, opens this item ("portfolio"
   * on a read of your own stocks), or nothing. A function picks per card ("brief:..." for a briefing line); its
   * null falls back the same way. `false` leaves Ask off every card.
   */
  askContext?: AskContextChoice;
}) {
  if (!read || (!read.headline && read.insights.length === 0)) return null;
  const count = read.insights.length;
  // One card per row in a narrow read (a phone, a side column), two across from about 540px, three for a
  // read of three once there is room. Widths are the read's own (a container query), not the screen's: the
  // same read sits full width on Market today and in a narrow column on the briefing. Class names stay
  // literal so Tailwind finds them.
  const listLayout = count >= 2 ? "grid grid-cols-1 [@container(min-width:34rem)]:grid-cols-2" : "grid grid-cols-1";
  // Three cards go three across once there is room; four stay two by two.
  const wide = count === 3 || count >= 5 ? "[@container(min-width:50rem)]:grid-cols-3" : "";
  const cards =
    count > 0 ? (
      <div className="mt-3 [container-type:inline-size]">
        <ul className={`gap-3 ${listLayout} ${wide}`}>
          {read.insights.map((insight, index) => {
            // An odd last card in a two-across row takes the whole row instead of leaving a hole.
            const lastOdd = count > 1 && count % 2 === 1 && index === count - 1;
            const span = lastOdd
              ? `[@container(min-width:34rem)]:col-span-2 ${count === 3 || count >= 5 ? "[@container(min-width:50rem)]:col-span-1" : ""}`
              : "";
            return <InsightCard key={insight.id} insight={insight} className={span} />;
          })}
        </ul>
      </div>
    ) : null;
  return (
    <section aria-label={label} className={`oa-surface border border-oa-border bg-oa-card px-4 pb-3.5 pt-3.5 sm:px-5 sm:pb-4 sm:pt-4 ${className}`}>
      {/* No small label above the headline (owner, Nov 11): the section keeps it as its accessible name only. */}
      {read.headline ? (
        <h2 className="max-w-[46rem] text-pretty text-[17px] font-semibold leading-[24px] tracking-[-0.01em] text-oa-fg sm:text-[19px] sm:leading-[26px]">{read.headline}</h2>
      ) : null}
      {read.headline && read.sub ? <p className="mt-1 max-w-[46rem] text-pretty text-[14px] leading-5 text-oa-muted-fg">{read.sub}</p> : null}
      {visual}
      {read.headline && read.actions?.length ? (
        // Next steps for the headline's own story, in the same link style as the cards. The read's
        // container is not a card, so it carries its own click tracking.
        <div
          data-track-links="insight_clicked"
          data-track-insight-id="headline"
          data-track-insight-kind="headline"
          data-track-ticker={read.headlineTickers?.[0]}
          className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5"
        >
          {read.actions.slice(0, 2).map((action, index) => (
            <ActionLink key={action.href} action={action} target={index === 0 ? "action" : "action_2"} />
          ))}
        </div>
      ) : null}
      {cards}
      {read.source || read.asOf ? (
        <p className="mt-3 text-[12.5px] leading-[18px] text-oa-muted-fg">
          {[read.source, read.asOf ? `${read.source ? "as of" : "As of"} ${fmtReadTime(read.asOf)}` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export type AskContextChoice = false | string | null | undefined | ((insight: Insight) => string | null | undefined);

const isAsk = (action: InsightAction | undefined) => Boolean(action && /^\/ask(?:[?#]|$)/.test(action.href));

/** Words whose full stop does not end a sentence: "Apple Inc. said", "U.S. stocks", "Nov. 17". */
const ABBREVIATION = /(?:^|\s)(?:[A-Z]|[A-Z]\.[A-Z]|Inc|Corp|Co|Ltd|Plc|vs|etc|No|St|Mr|Mrs|Ms|Dr|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/;

/** The sentence a question quotes: the card's first sentence, whole, ending in a full stop. */
export function quoted(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  // A sentence ends at ". " before a capital, not at "$1.5", "U.S." or "Inc.".
  const ends = /[.!?](?=\s+["“]?[A-Z])/g;
  let match: RegExpExecArray | null;
  let first = clean;
  while ((match = ends.exec(clean))) {
    const head = clean.slice(0, match.index + 1);
    if (match[0] === "." && ABBREVIATION.test(head)) continue;
    first = head;
    break;
  }
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

/**
 * The question a card's Ask sends. About a stock (or nothing in particular), it quotes the card and asks what is
 * behind it: "NVDA fell 5.5% after its report. What's behind this, and what should I watch next on NVDA?". About
 * your own stocks (a portfolio, memo, briefing or agent context), the card's words stay out of the link, since
 * they can carry amounts and share counts: the question is generic and Ask reads the item itself (`context`).
 */
export function insightAskQuestion(insight: Pick<Insight, "id" | "text" | "tickers">, context: string | null): string {
  const parsed = context ? parseAskContext(context) : null;
  const tickers = [...new Set(insight.tickers ?? [])];
  const ticker = parsed?.ticker ?? (tickers.length === 1 ? tickers[0]! : null);
  if (parsed && parsed.kind !== "stock") {
    const whose = parsed.example ? "the example portfolio" : "my portfolio";
    if (parsed.kind === "brief" && ticker) return `Why does this matter for ${ticker} today?`;
    if (ticker && /^earn/i.test(insight.id ?? "")) return `What should I watch for in ${ticker}'s next report?`;
    if (ticker) return `What should I know about ${ticker} in ${whose} right now?`;
    return `What stands out in ${whose} right now, and why?`;
  }
  const tail = ticker ? `What's behind this, and what should I watch next on ${ticker}?` : "What's behind this, and why does it matter?";
  return `${quoted(insight.text)} ${tail}`;
}

/**
 * Where a card's Ask goes, or null when it gets none: Ask is off (`false`), the card says nothing, or one of its
 * steps already asks. A card about one stock opens that stock unless the page gives your portfolio (or the
 * example) as the context; the picker's choice comes first.
 */
export function askFor(insight: Insight, choice: AskContextChoice): string | null {
  if (choice === false || !insight.text.trim()) return null;
  if (isAsk(insight.action) || isAsk(insight.secondAction) || (insight.action && insight.secondAction)) return null;
  const tickers = [...new Set(insight.tickers ?? [])];
  const picked = typeof choice === "function" ? choice(insight) : null;
  const fallback = typeof choice === "string" ? choice : null;
  const pageWide = fallback !== null && /^(ex\.)?(portfolio|memo|brief)/.test(fallback);
  const raw = picked ?? (tickers.length === 1 && !pageWide ? `stock:${tickers[0]}` : fallback);
  const parsed = raw ? parseAskContext(raw) : null;
  const context = parsed ? formatAskContext(parsed) : null;
  // The same link lib/next-steps.ts askHref builds, written here so pages that use cards do not ship its imports.
  return `/ask?q=${encodeURIComponent(insightAskQuestion(insight, context))}${context ? `&ctx=${encodeURIComponent(context)}` : ""}`;
}

/**
 * True when the sentence already says what the figure's label adds: the figure's own number (its digits, without
 * sign or "%") and every word of the label (three letters or more, "the" aside). A bare "9" over a sentence that
 * never says 9 keeps its "posts this week".
 */
export function sentenceSaysFigure(text: string, value: string, label: string): boolean {
  const digits = value.replace(/[^0-9.,]/g, "").replace(/,/g, "").replace(/^\.+|\.+$/g, "");
  if (!digits) return false;
  const numbers = (text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => n.replace(/\.0+$/, ""));
  if (!numbers.includes(digits.replace(/\.0+$/, ""))) return false;
  const have = new Set(text.toLowerCase().match(/[a-z0-9&]+/g) ?? []);
  const need = (label.toLowerCase().match(/[a-z0-9&]+/g) ?? []).filter((word) => word.length >= 3 && word !== "the");
  return need.length > 0 && need.every((word) => have.has(word));
}

/**
 * One insight as a card (no coloured top edge: owner, Nov 11): the key figure big with the
 * stocks' logos beside it, the sentence whole (it wraps, never clips), the
 * second clause muted, and the next steps at the foot. Cards in a row share
 * one height (the grid stretches them), so the links line up.
 */
export function InsightCard({
  insight,
  className = "",
}: {
  insight: Insight;
  className?: string;
}) {
  const tickers = [...new Set(insight.tickers ?? [])];
  const figure = figureOf(insight);
  // The arrow beside a figure shows its direction, so it only appears on a signed figure ("−5.5%") or one
  // that names its own tone; a down arrow beside "22%" would read as "fell 22%".
  // A zero ("+0.00%") gets no arrow either way.
  const sign = figure && /[1-9]/.test(figure.value) ? /^[+\u2212-]/.exec(figure.value)?.[0] : undefined;
  const figureTone = figure?.tone ?? (sign ? (sign === "+" ? "up" : "down") : "flat");
  // The figure's words only when the sentence does not already say them ("−8.4%" over "…after its last report the stock
  // fell 8.4%" needs no "after its last report" as well): one number and one sentence (owner rule 6).
  const figureWords = figure?.label && !sentenceSaysFigure(insight.text, figure.value, figure.label) ? figure.label : null;
  const lead = tickers[0] ?? null;
  // A sentence that opens with its stock: "SMR: our call moved" drops the label (the logo above names it);
  // "HIMS fell 16.5%" reads "Hims & Hers Health fell 16.5%" when we know the name, else stays as written.
  const opens = lead && startsWithTicker(insight.text, lead);
  const labelled = opens && new RegExp(`^\\s*\\$?${escapeRe(lead)}\\s*[:\u2014\u2013-]`).test(insight.text);
  const rest = opens ? stripLeadingTicker(insight.text, lead) : insight.text;
  // Only when something is left after the ticker; a sentence that is just "HIMS" stays as it is.
  const named = opens && !labelled && insight.leadName && rest !== insight.text ? insight.leadName : null;
  const text = labelled || named ? rest : insight.text;
  return (
    <li
      // Any link in the card sends `insight_clicked` (lib/analytics-dom.ts), so we learn which reads people act on.
      data-track-links="insight_clicked"
      data-track-insight-id={insight.id.slice(0, 80)}
      data-track-insight-kind={insightKind(insight.id)}
      data-track-tone={insight.tone}
      className={`oa-surface relative flex min-w-0 flex-col overflow-hidden border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 ${insight.action ? "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent" : ""} ${className}`}
    >
      {figure || tickers.length > 0 ? (
        <div className="flex min-w-0 items-start justify-between gap-3">
          {figure ? (
            <div className="min-w-0">
              {/* The figure's words follow it on its line ("+10% over the past year"), read as one phrase, not as a
                  small caption under the number (owner rule 6: no small labels on big figures). */}
              <p className="flex flex-wrap items-baseline gap-x-2 text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-oa-fg">
                <span className="inline-flex items-center gap-1.5">
                  <span className="break-words">{figure.value}</span>
                  {figureTone !== "flat" ? <ToneGlyph tone={figureTone} className="size-2.5" decorative /> : null}
                </span>
                {figureWords ? <span className="text-[14.5px] font-normal leading-[21px] tracking-normal text-oa-muted-fg">{figureWords}</span> : null}
              </p>
            </div>
          ) : null}
          {tickers.length > 0 ? <CardStocks tickers={tickers} className={`relative z-10 ${figure ? "mt-0.5" : ""}`} /> : null}
        </div>
      ) : null}
      <p className={`max-w-[60rem] text-pretty text-[14.5px] leading-[21px] text-oa-fg ${figure || tickers.length > 0 ? "mt-2" : ""}`}>
        {named ? <span className="font-medium">{named} </span> : null}
        {text}
      </p>
      {insight.soWhat ? <p className="mt-1 max-w-[60rem] text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{insight.soWhat}</p> : null}
      {/* The whole card opens its main page. No link words or Ask icon repeated on every card (owner, Nov 11). */}
      {insight.action ? (
        <Link
          href={insight.action.href}
          prefetch={false}
          data-track-target="action"
          aria-label={insight.action.label}
          className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      ) : null}
    </li>
  );
}

/** The card's stocks: the first one's logo and ticker, then up to three more logos, each opening its stock. */
function CardStocks({ tickers, className = "" }: { tickers: string[]; className?: string }) {
  const [lead, ...others] = tickers;
  const shown = others.slice(0, 3);
  const more = others.length - shown.length;
  return (
    <div className={`flex shrink-0 items-center ${className}`}>
      <Link
        href={`/stock/${encodeURIComponent(lead!)}`}
        prefetch={false}
        data-track-target="stock"
        className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium leading-5 text-oa-fg hover:underline"
      >
        <StockLogo ticker={lead!} size={26} eager />
        <span className="oa-mono tabular-nums">{lead}</span>
      </Link>
      {shown.length > 0 ? (
        <span className="ml-2 flex items-center">
          {shown.map((ticker, index) => (
            <Link
              key={ticker}
              href={`/stock/${encodeURIComponent(ticker)}`}
              prefetch={false}
              data-track-target="stock"
              title={ticker}
              aria-label={ticker}
              className={`rounded-md ring-2 ring-[var(--oa-bg)] ${index > 0 ? "-ml-1.5" : ""}`}
            >
              <StockLogo ticker={ticker} size={20} />
            </Link>
          ))}
          {more > 0 ? <span className="ml-1.5 text-[12.5px] text-oa-muted-fg">+{more}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

export function InsightRow({ insight }: { insight: Insight }) {
  const tickers = insight.tickers ?? [];
  // One stock: its logo and ticker lead the row once, and a leading "SMR:" in
  // the sentence is dropped so the name never shows twice.
  // Only when the sentence is about that stock (it starts with it); otherwise
  // a logo in front of "Over the past month the group..." reads as its subject.
  const lead = tickers.length === 1 && startsWithTicker(insight.text, tickers[0]!) ? tickers[0]! : null;
  const text = lead ? stripLeadingTicker(insight.text, lead) : insight.text;
  // Several stocks: chips only for the ones the sentence (or its second clause) does not already name.
  const said = insight.soWhat ? `${text} ${insight.soWhat}` : text;
  // A sentence that names its stocks needs no chips; extra chips under "BHE, NVDA and TSM" read as a mismatch.
  const namesAny = tickers.some((ticker) => mentions(said, ticker));
  const extra = lead || namesAny ? [] : tickers.slice(0, 6);
  // The row link's name is its step ("Why did it fall?"); the sentence describes it.
  const sentenceId = `insight-row-${insight.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60)}`;
  // Two columns: the tone mark and the sentence (with any extra stocks under it). The whole row opens its main
  // step, the way a read card does: no link words repeated on every row (owner, Nov 11). Stock links sit above it.
  return (
    <li
      // Any link in the row sends `insight_clicked` (lib/analytics-dom.ts), so we learn which reads people act on.
      data-track-links="insight_clicked"
      data-track-insight-id={insight.id.slice(0, 80)}
      data-track-insight-kind={insightKind(insight.id)}
      data-track-tone={insight.tone}
      className={`relative grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 py-3 ${insight.action ? "transition-colors hover:bg-oa-accent" : ""}`}
    >
      <ToneGlyph tone={insight.tone} className="mt-[7px]" />
      <div className="min-w-0 max-w-[60rem]">
        <div id={sentenceId} className="text-pretty text-[15px] leading-[22px] text-oa-fg">
          {lead ? (
            <Link
              href={`/stock/${encodeURIComponent(lead)}`}
              prefetch={false}
              data-track-target="stock"
              className="relative z-10 mr-1.5 inline-flex items-center gap-1.5 rounded align-[-4px] font-medium text-oa-fg hover:underline"
            >
              <StockLogo ticker={lead} size={18} />
              {insight.leadName ? <span title={lead}>{insight.leadName}</span> : <span className="tabular-nums">{lead}</span>}
            </Link>
          ) : null}
          {text}
          {insight.soWhat ? <span className="text-oa-muted-fg"> {insight.soWhat}</span> : null}
        </div>
        {extra.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {extra.map((ticker) => (
              <Link
                key={ticker}
                href={`/stock/${encodeURIComponent(ticker)}`}
                prefetch={false}
                data-track-target="stock"
                className="relative z-10 inline-flex items-center gap-1.5 rounded text-[13px] font-medium leading-5 text-oa-fg hover:underline"
              >
                <StockLogo ticker={ticker} size={16} />
                <span className="tabular-nums">{ticker}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {insight.action ? (
        <Link
          href={insight.action.href}
          prefetch={false}
          data-track-target="action"
          aria-label={insight.action.label}
          aria-describedby={sentenceId}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      ) : null}
    </li>
  );
}

/** One next step in the read's link style: "Why did it fall? →". */
function ActionLink({ action, target, className = "", wrap = false }: { action: InsightAction; target: string; className?: string; wrap?: boolean }) {
  return (
    <Link
      href={action.href}
      prefetch={false}
      data-track-target={target}
      className={`${wrap ? "" : "whitespace-nowrap"} rounded text-[13px] font-medium leading-[22px] text-oa-primary hover:underline ${className}`}
    >
      {/* In a narrow card the label may wrap; the arrow stays with its last word. */}
      {action.label}{"\u00a0"}→
    </Link>
  );
}

/** "mover-NVDA" -> "mover", "decisions" -> "decisions": the insight's kind without the stock in it. */
export function insightKind(id: string): string {
  return id.split(/[-:]/)[0]!.toLowerCase().slice(0, 32) || "insight";
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The row already leads with the ticker, so drop it from the start of the
 * sentence: "SMR: Our call moved" -> "Our call moved", "SMR rose 7%" -> "rose 7%".
 */
export function stripLeadingTicker(text: string, ticker: string): string {
  const match = new RegExp(`^\\s*\\$?${escapeRe(ticker)}(?![A-Za-z0-9])\\s*([:\u2014\u2013-])?\\s*`, "i").exec(text);
  if (!match) return text;
  const rest = text.slice(match[0].length);
  if (!rest) return text;
  return match[1] ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
}

function startsWithTicker(text: string, ticker: string): boolean {
  return new RegExp(`^\\s*\\$?${escapeRe(ticker)}(?![A-Za-z0-9])`).test(text);
}

function mentions(text: string, ticker: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])\\$?${escapeRe(ticker)}([^A-Za-z0-9]|$)`).test(text);
}

function fmtReadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}
