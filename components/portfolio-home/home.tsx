import Link from "next/link";
import { Suspense } from "react";

import { ShowMore } from "@/components/oa/kit/more";
import { Bar } from "@/components/oa/kit/skeleton";
import { ToneGlyph } from "@/components/oa/kit/tone";
import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { pickNoticed, SOURCE_OF, TOOL_GROUPS, TOOL_HREF, TOOL_TITLES, toolCard, type HomeMode, type Noticed, type ToolId } from "@/lib/portfolio-home/pick";
import { feedSources, type ExampleReason, type HomeLoad } from "@/lib/portfolio-home/server";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const LINK = `font-medium text-oa-primary hover:underline ${FOCUS} rounded`;
/** How many points a phone shows before the rest wait behind one button. */
const PHONE_KEEP = 3;

/* ── the example line ──────────────────────────────────────────────────── */

const MARK = (
  <Link href="/watchlist" className={LINK}>
    Mark the stocks you own in Portfolio
  </Link>
);

function reasonWords(reason: ExampleReason): React.ReactNode {
  switch (reason) {
    case "read-failed":
      return <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>;
    case "no-us-holdings":
      return <>These tools cover US stocks and funds, and none of your holdings is one yet, so this is the example portfolio.</>;
    case "watching-only":
      return <>You watch stocks but have not marked any as owned, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "no-holdings":
      return <>You have no holdings marked yet, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "signed-out":
      return <>This is an example portfolio of real stocks and funds with made-up share counts.</>;
  }
}

/** Says plainly when the page is about the example, with the one way to make it yours. */
export async function ExampleLine({ load }: { load: HomeLoad }) {
  const { mode, reason } = await load.context;
  if (mode === "mine" || !reason) return null;
  return (
    <div className="mb-3 flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between sm:px-0">
      <p className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
        <span className="mr-2 inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 align-[1px] text-[13px] font-medium text-oa-primary">
          Example
        </span>
        {reasonWords(reason)}
      </p>
      {reason === "signed-out" ? <HomeSignIn /> : null}
    </div>
  );
}

/* ── what the agent noticed ────────────────────────────────────────────── */

function NoticedRow({ item }: { item: Noticed }) {
  return (
    <li
      data-track-links="insight_clicked"
      data-track-insight-id={item.id.slice(0, 80)}
      data-track-insight-kind={`home-${item.tool}`}
      data-track-tone={item.tone}
      className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 px-4 py-3.5 sm:gap-x-4 sm:px-5"
    >
      <ToneGlyph tone={item.tone} className="mt-[5px]" />
      <div className="min-w-0 max-w-[52rem]">
        {/* A div, not a p: the logo renders a div of its own. */}
        <div className="flex items-center gap-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
          {item.ticker ? <StockLogo ticker={item.ticker} size={16} /> : null}
          <span>{item.caption}</span>
        </div>
        <p className="mt-1 text-pretty text-[15px] leading-[22px] text-oa-fg">{item.text}</p>
        {item.evidence ? <p className="mt-1 text-pretty text-[13px] leading-[19px] text-oa-muted-fg">{item.evidence}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-5">
          <Link href={item.open.href} prefetch={false} data-track-target="action" className={`inline-flex min-h-9 items-center text-[13.5px] ${LINK}`}>
            {item.open.label} →
          </Link>
          {item.watch ? (
            <Link
              href={item.watch.href}
              prefetch={false}
              data-track-target="watch"
              title={`“${item.watch.request}”. You can check it before anything is saved.`}
              className={`inline-flex min-h-9 items-center text-[13.5px] text-oa-fg underline decoration-oa-border underline-offset-[3px] hover:decoration-oa-fg ${FOCUS} rounded`}
            >
              Watch this for me
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function NoticedFrame({ example, children }: { example: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby="noticed-head" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2 sm:px-5">
        <h2 id="noticed-head" className="oa-label min-w-0">
          {example ? "What the agent noticed in the example this week" : "What your agent noticed this week"}
        </h2>
      </div>
      {children}
    </section>
  );
}

export async function NoticedFeed({ load }: { load: HomeLoad }) {
  const [{ mode }, sources] = await Promise.all([load.context, feedSources(load)]);
  const items = pickNoticed(sources, mode);
  const states = Object.values(sources).map((source) => source.state);
  const slow = states.filter((state) => state === "slow").length;
  const failed = states.filter((state) => state === "failed").length;
  const example = mode === "example";
  if (items.length === 0) {
    const holdings = example ? "the example's holdings" : "your holdings";
    return (
      <NoticedFrame example={example}>
        <p className="px-4 py-5 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-5">
          {slow + failed > 0
            ? `The tools could not read ${holdings} just now. Reload in a minute, or open any of them below.`
            : example
              ? "Nothing in the example needs attention right now."
              : "Nothing needs your attention right now. Add share counts in Portfolio and there is more to notice."}
        </p>
      </NoticedFrame>
    );
  }
  const kept = items.slice(0, PHONE_KEEP);
  const rest = items.slice(PHONE_KEEP);
  return (
    <NoticedFrame example={example}>
      <ol className="divide-y divide-oa-border">
        {kept.map((item) => (
          <NoticedRow key={item.id} item={item} />
        ))}
      </ol>
      {rest.length > 0 ? (
        <ShowMore label={`Show ${rest.length} more`} className="[&>button]:mx-4 [&>button]:mb-3 [&>button]:w-[calc(100%-2rem)]">
          <ol start={kept.length + 1} className="divide-y divide-oa-border border-t border-oa-border">
            {rest.map((item) => (
              <NoticedRow key={item.id} item={item} />
            ))}
          </ol>
        </ShowMore>
      ) : null}
      {slow + failed > 0 ? (
        <p className="border-t border-oa-border px-4 py-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg sm:px-5">
          {leftOutWords(slow, failed)}
        </p>
      ) : null}
    </NoticedFrame>
  );
}

/** "One tool took too long to answer and one could not be read, so they are left out here. Open them below." */
function leftOutWords(slow: number, failed: number): string {
  const count = (n: number) => (n === 1 ? "one" : String(n));
  const parts = [
    slow > 0 ? `${count(slow)} ${slow === 1 ? "tool" : "tools"} took too long to answer` : null,
    failed > 0 ? `${count(failed)} ${slow > 0 ? "" : failed === 1 ? "tool " : "tools "}could not be read` : null,
  ].filter(Boolean) as string[];
  const many = slow + failed > 1;
  const text = `${parts.join(" and ")}, so ${many ? "they are" : "it is"} left out here. Open ${many ? "them" : "it"} below.`;
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/\s+/g, " ");
}

export function NoticedGhost() {
  return (
    <div aria-hidden="true" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-11 items-center border-b border-oa-border px-4 py-2 sm:px-5">
        <Bar className="h-3 w-56" />
      </div>
      {[0, 1, 2].map((row) => (
        <div key={row} className="border-b border-oa-border px-4 py-4 last:border-b-0 sm:px-5">
          <Bar className="h-3 w-24" />
          <Bar className="mt-2.5 h-4 w-full max-w-[44rem]" />
          <Bar className="mt-2 h-4 w-3/4 max-w-[34rem]" />
          <Bar className="mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/* ── the tools ─────────────────────────────────────────────────────────── */

const CARD = `oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card px-4 py-3 transition-colors hover:bg-oa-accent ${FOCUS}`;

async function ToolCardBody({ id, load }: { id: ToolId; load: HomeLoad }) {
  const key = SOURCE_OF[id];
  const [{ mode }, source] = await Promise.all([load.context, load.sources[key]]);
  const card = toolCard(id, { [key]: source }, mode);
  return (
    <>
      {card.figure ? <span className="oa-mono mt-1.5 text-[17px] font-medium leading-6 tabular-nums text-oa-fg">{card.figure}</span> : null}
      <span className={`text-pretty text-[13px] leading-[18px] text-oa-muted-fg ${card.figure ? "mt-0.5" : "mt-1.5"}`}>{card.detail}</span>
    </>
  );
}

function ToolCardGhost() {
  return (
    <span aria-hidden="true" className="mt-2 flex flex-col gap-2">
      <span className="block h-4 w-24 animate-pulse rounded bg-oa-accent motion-reduce:animate-none" />
      <span className="block h-3 w-40 animate-pulse rounded bg-oa-accent motion-reduce:animate-none" />
    </span>
  );
}

/**
 * Where a card goes. The example's tax-loss figure comes from the ideas page, which shows it; the Taxes page
 * needs your own lots, so a visitor would land on a sign-in box there.
 */
function toolHref(id: ToolId, mode: HomeMode): string {
  return id === "taxes" && mode === "example" ? TOOL_HREF.ideas : TOOL_HREF[id];
}

export function ToolGridGhost() {
  return (
    <div aria-hidden="true" className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="oa-surface border border-oa-border bg-oa-card px-4 py-3">
          <Bar className="h-4 w-32" />
          <Bar className="mt-3 h-4 w-20" />
          <Bar className="mt-2 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/** The tools in plain words, grouped as in the navigation, each with one live figure that streams in on its own. */
export async function ToolGrid({ load }: { load: HomeLoad }) {
  const { mode } = await load.context;
  return (
    <section aria-labelledby="tools-head" className="mt-6">
      <h2 id="tools-head" className="sr-only">
        Your portfolio tools
      </h2>
      <div className="flex flex-col gap-5">
        {TOOL_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="oa-label mb-2 px-2 sm:px-0">{group.label}</h3>
            <ul className="oa-card-grid grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {group.tools.map((id) => (
                <li key={id} className="min-w-0">
                  <Link href={toolHref(id, mode)} prefetch={false} className={CARD}>
                    <span className="flex items-center justify-between gap-2 text-[14.5px] font-medium leading-5 text-oa-fg">
                      {TOOL_TITLES[id]}
                      <span aria-hidden="true" className="text-oa-muted-fg">
                        →
                      </span>
                    </span>
                    <Suspense fallback={<ToolCardGhost />}>
                      <ToolCardBody id={id} load={load} />
                    </Suspense>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
