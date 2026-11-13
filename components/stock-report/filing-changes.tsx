import { absoluteDay, etToday } from "@/lib/day-words";
import { topicOptions } from "@/lib/filing-changes/lines";
import { getFilingChangesView } from "@/lib/filing-changes/server";
import type { FilingChangesView } from "@/lib/filing-changes/store";
import { topicChips, type TopicChip, type TopicIcon } from "@/lib/filing-changes/topics";
import { changesTitle, filingWords, quietNote } from "@/lib/filing-changes/words";

import { NUM, Panel } from "./primitives";

/**
 * What a company changed in its risk factors, read in two seconds (owner, Nov 13: the list of legal sentences was "too
 * much text"): one header line with the filing link and the counts, then each risk as a topic chip of one to three
 * words with its icon (lib/filing-changes/topics.ts, plain rules), new ones in the plain tone and dropped ones dimmed
 * and struck. Serious topics (a material weakness, going concern, delisting, a restatement, a government
 * investigation) lead in the warning tone. A chip opens the filing and carries the heading as filed in its title; the
 * sentences themselves sit behind one quiet "Read them" toggle. No section when there is no readable comparison with
 * a change. Server only; it loads its own data, so it can sit in a Suspense boundary of its own.
 */

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

/* ── icons ──────────────────────────────────────────────────────────────── */

const ICON_PATHS: Record<TopicIcon, string[]> = {
  alert: ["M12 3 2.5 20h19L12 3Z", "M12 10v4.5", "M12 17.2v.1"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  shield: ["M12 3 5 6v6c0 4.2 3 7.4 7 9 4-1.6 7-4.8 7-9V6l-7-3Z"],
  chip: ["M7 7h10v10H7z", "M10 10h4v4h-4z", "M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"],
  flag: ["M5 21V4", "M5 4h11l-2 4 2 4H5"],
  truck: ["M3 6h11v10H3z", "M14 10h4l3 3v3h-7", "M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "M17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"],
  wrench: ["M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z"],
  coins: ["M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M18.1 10.4A6 6 0 1 1 10.4 18"],
  bank: ["M3 10 12 4l9 6", "M5 10v8M9.5 10v8M14.5 10v8M19 10v8", "M3 20h18"],
  scale: ["M12 3v18", "M7 21h10", "M4 7h16", "m6 7-3 7a3 3 0 0 0 6 0L6 7Z", "m18 7-3 7a3 3 0 0 0 6 0l-3-7Z"],
  capitol: ["M3 21h18", "M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9", "M3 12h18", "M12 3 4 8h16l-8-5Z"],
  badge: ["M12 3 14.5 5l3.2-.3.8 3.1 2.6 1.9-1.4 2.9 1.4 2.9-2.6 1.9-.8 3.1-3.2-.3L12 21l-2.5-2-3.2.3-.8-3.1L2.9 14.3l1.4-2.9-1.4-2.9L5.5 6.6l.8-3.1 3.2.3L12 3Z", "m8.5 12 2.5 2.5 4.5-5"],
  users: ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.5a3.5 3.5 0 0 1 0 6.5", "M18 14a6.5 6.5 0 0 1 3.5 6"],
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 21a7.5 7.5 0 0 1 15 0"],
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12.5v-1"],
  split: ["M12 21v-7", "M12 14 6 8V4", "M12 14l6-6V4", "M4 6l2-2 2 2", "M16 6l2-2 2 2"],
  merge: ["M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6", "M18 3v6a6 6 0 0 1-6 6"],
  percent: ["M19 5 5 19", "M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z", "M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  pulse: ["M3 12h4l3-8 4 16 3-8h4"],
  drop: ["M12 3c3.5 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7 12 3Z"],
  exchange: ["M4 8h13", "m14 5 3 3-3 3", "M20 16H7", "m10 13-3 3 3 3"],
  leaf: ["M5 19c0-8 5-14 15-14 0 10-6 15-14 15", "M5 19c3-4 6-7 10-9"],
  book: ["M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z", "M5 18a2 2 0 0 1 2-2h11"],
  tag: ["M3 12V4h8l10 10-8 8L3 12Z", "M7.5 8.5h.01"],
  star: ["M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M8 7h.01M8 17h.01"],
  cart: ["M3 4h2l2.4 11h10.2L20 7H6.2", "M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", "M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  doc: ["M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z", "M14 3v5h5", "M9 13h6M9 17h4"],
};

function Icon({ name, className = "size-[15px]" }: { name: TopicIcon | "plus" | "minus"; className?: string }) {
  const paths =
    name === "plus" ? ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 8v8M8 12h8"] : name === "minus" ? ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8 12h8"] : ICON_PATHS[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/* ── chips ──────────────────────────────────────────────────────────────── */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

function Chip({ chip, href, dropped }: { chip: TopicChip; href: string | null; dropped?: boolean }) {
  const full = chip.headings.join("\n\n");
  // The warning tone is for a serious risk the filing adds; a dropped one (a material weakness fixed) only leads its group.
  const tone = chip.serious && !dropped
    ? "border-[color-mix(in_srgb,var(--signal-bearish)_45%,transparent)] bg-[color-mix(in_srgb,var(--signal-bearish)_9%,transparent)] text-signal-bearish"
    : dropped
      ? "border-oa-border text-oa-muted-fg"
      : "border-oa-border bg-oa-bg text-oa-fg";
  const body = (
    <>
      <Icon name={chip.icon} />
      <span className={dropped ? "line-through decoration-[color-mix(in_srgb,currentColor_55%,transparent)]" : undefined}>{chip.label}</span>
      {chip.headings.length > 1 ? <span className={`${NUM} text-[12px] opacity-70`}>{`×${chip.headings.length}`}</span> : null}
      {/* The heading as filed, for screen readers; the chip is its topic. */}
      <span className="sr-only">{`: ${chip.headings.join(" ")}`}</span>
    </>
  );
  const shape = `inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium leading-none ${tone}`;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={full} className={`${shape} transition-colors hover:border-oa-fg/40 ${FOCUS}`}>
      {body}
    </a>
  ) : (
    <span title={full} className={shape}>
      {body}
    </span>
  );
}

function ChipGroup({ label, chips, href, dropped }: { label: string; chips: TopicChip[]; href: string | null; dropped?: boolean }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <h4 className="oa-caption shrink-0 pt-2 sm:w-[5.5rem]">{label}</h4>
      <ul aria-label={label} className="flex min-w-0 flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.label} className="min-w-0">
            <Chip chip={chip} href={href} dropped={dropped} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The sentences as filed, behind one quiet toggle (owner rule 2 allows one, as with "Your words" on the reason card). */
function ReadThem({ groups }: { groups: Array<{ label: string; lines: Array<{ text: string; was?: string }>; muted?: boolean }> }) {
  const shown = groups.filter((group) => group.lines.length > 0);
  if (shown.length === 0) return null;
  return (
    <details className="group border-t border-oa-border px-3.5 py-2.5 sm:px-4">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-[13px] leading-5 text-oa-muted-fg hover:text-oa-fg [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        Read them
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {shown.map((group) => (
          <div key={group.label}>
            <h5 className="oa-caption">{group.label}</h5>
            <ul className="mt-1 flex flex-col gap-1.5">
              {group.lines.map((line) => (
                <li key={line.text} className={`text-pretty text-[13.5px] leading-5 ${group.muted ? "text-oa-muted-fg" : "text-oa-fg"}`}>
                  {line.text}
                  {line.was ? <span className="block text-[12.5px] text-oa-muted-fg">{`Was: ${line.was}`}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

export function FilingChangesPanel({ view, today }: { view: FilingChangesView; today: string }) {
  const { shown, quiet, ticker, company } = view;
  const filing = shown.filing;
  const base = shown.base;
  const options = topicOptions(company);
  const repeated = shown.repeated ?? [];
  const onlyReworded = shown.added.length + repeated.length + shown.dropped.length === 0;
  const added = topicChips(shown.added, options);
  const still = topicChips(repeated, options);
  const dropped = topicChips(shown.dropped, options);
  const reworded = onlyReworded ? topicChips(shown.reworded.map((pair) => pair.to), options) : [];
  const quietText = quiet ? quietNote(quiet, today) : null;
  const counts = [
    shown.added.length ? { icon: "plus" as const, figure: `+${shown.added.length}`, words: "new" } : null,
    repeated.length ? { icon: "plus" as const, figure: String(repeated.length), words: "from an earlier 10-Q" } : null,
    shown.dropped.length ? { icon: "minus" as const, figure: `−${shown.dropped.length}`, words: "dropped" } : null,
    onlyReworded && shown.reworded.length ? { icon: "exchange" as const, figure: String(shown.reworded.length), words: "reworded" } : null,
  ].filter((count): count is { icon: "plus" | "minus" | "exchange"; figure: string; words: string } => count !== null);
  return (
    <Panel id="filing-changes" label={changesTitle(ticker)} className="scroll-mt-16 lg:scroll-mt-4">
      {/* One line: the filing the chips come from (the link), what it is read against, and the counts. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-oa-border px-3.5 py-2.5 text-[14px] leading-5 sm:px-4">
        <p className="min-w-0 text-oa-muted-fg">
          <a
            href={filing.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${company} ${filing.form} on SEC EDGAR (opens in a new tab)`}
            className={`font-medium text-oa-primary underline decoration-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] underline-offset-4 transition-colors hover:decoration-oa-primary ${FOCUS}`}
          >
            {filingWords(filing.form, filing.filed, today)}
            <span aria-hidden>{" ↗"}</span>
          </a>
          {base ? (
            <>
              {` against its ${base.form} from `}
              <span className="whitespace-nowrap">{absoluteDay(base.filed, today)}</span>
            </>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-oa-fg">
          {counts.map((count) => (
            <span key={count.words} className="inline-flex items-center gap-1 whitespace-nowrap">
              <Icon name={count.icon} className="size-4 text-oa-muted-fg" />
              <span className={`${NUM} font-semibold`}>{count.figure}</span>
              <span className="text-oa-muted-fg">{count.words}</span>
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-col gap-3 px-3.5 py-3 sm:px-4">
        <ChipGroup label="New" chips={added} href={filing.url} />
        <ChipGroup label="Still new" chips={still} href={filing.url} />
        <ChipGroup label="Dropped" chips={dropped} href={base?.url ?? null} dropped />
        <ChipGroup label="Reworded" chips={reworded} href={filing.url} />
        {quietText ? <p className="text-[13px] leading-4 text-oa-muted-fg">{quietText}</p> : null}
      </div>
      <ReadThem
        groups={[
          { label: "New", lines: shown.added.map((text) => ({ text })) },
          { label: "Still new since its 10-K", lines: repeated.map((text) => ({ text })) },
          { label: "Dropped", lines: shown.dropped.map((text) => ({ text })), muted: true },
          { label: "Reworded", lines: onlyReworded ? shown.reworded.map((pair) => ({ text: pair.to, was: pair.from })) : [] },
        ]}
      />
    </Panel>
  );
}
