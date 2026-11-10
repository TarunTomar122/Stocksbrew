import { blockStrings, plain } from "@/lib/docs/build";
import { AGENTS_GUIDES } from "@/lib/docs/content/agents";
import { ASK_GUIDES } from "@/lib/docs/content/ask";
import { BRIEFING_GUIDES } from "@/lib/docs/content/briefing";
import { FOLLOW_GUIDES } from "@/lib/docs/content/follow";
import { METHODOLOGY_GUIDES } from "@/lib/docs/content/methodology";
import { PORTFOLIO_GUIDES } from "@/lib/docs/content/portfolio";
import { RESEARCH_GUIDES } from "@/lib/docs/content/research";
import { START_GUIDES } from "@/lib/docs/content/start";
import { STRATEGIES_GUIDES } from "@/lib/docs/content/strategies";
import { TOOLS_GUIDES } from "@/lib/docs/content/tools";
import { GLOSSARY } from "@/lib/docs/glossary";
import type { DocSection, Guide, SearchEntry, SectionId } from "@/lib/docs/types";

/**
 * The docs registry: sections in reading order, every guide, and the helpers
 * the pages use (lookup, previous and next, the search index).
 */

export const SECTIONS: DocSection[] = [
  { id: "start", title: "Start here", blurb: "What the product is, your first ten minutes, and how to read the two things you will open most." },
  { id: "briefing", title: "Briefing", blurb: "How the daily read is ordered, when a move gets a reason, and what the buttons save." },
  { id: "portfolio", title: "Portfolio", blurb: "Entering holdings, analytics, alerts and the practice account." },
  { id: "research", title: "Research", blurb: "The wire, calendar, screener, themes, compare, markets, filings and signals." },
  { id: "follow", title: "Follow", blurb: "13F funds, Congress and insiders, and how a record is measured from the filing date." },
  { id: "strategies", title: "Strategies and backtests", blurb: "What a backtest can tell you, the biases, the costs and how each number is computed." },
  { id: "agents", title: "Agents", blurb: "Standing jobs, their triggers, the run log, and why a quiet day is still written down." },
  { id: "ask", title: "Ask", blurb: "How answers are sourced and what the copilot will not do." },
  { id: "methodology", title: "Methodology", blurb: "Where every data set comes from, how calls are produced, what a model writes, and corrections." },
  { id: "tools", title: "Tools", blurb: "Three small calculators that run in your browser." },
];

export const GUIDES: Guide[] = [
  ...START_GUIDES,
  ...BRIEFING_GUIDES,
  ...PORTFOLIO_GUIDES,
  ...RESEARCH_GUIDES,
  ...FOLLOW_GUIDES,
  ...STRATEGIES_GUIDES,
  ...AGENTS_GUIDES,
  ...ASK_GUIDES,
  ...METHODOLOGY_GUIDES,
  ...TOOLS_GUIDES,
];

export function guideKey(guide: Pick<Guide, "section" | "slug">): string {
  return `${guide.section}/${guide.slug}`;
}

export function guideHref(guide: Pick<Guide, "section" | "slug">): string {
  return `/docs/${guide.section}/${guide.slug}`;
}

const BY_KEY = new Map(GUIDES.map((guide) => [guideKey(guide), guide]));

export function getGuide(section: string, slug: string): Guide | null {
  return BY_KEY.get(`${section}/${slug}`) ?? null;
}

export function getGuideByKey(key: string): Guide | null {
  return BY_KEY.get(key) ?? null;
}

export function getSection(id: string): DocSection | null {
  return SECTIONS.find((section) => section.id === id) ?? null;
}

export function guidesIn(section: SectionId): Guide[] {
  return GUIDES.filter((guide) => guide.section === section);
}

/** The guide before and after, in course order, crossing section boundaries. */
export function neighbours(guide: Guide): { prev: Guide | null; next: Guide | null } {
  const index = GUIDES.findIndex((item) => guideKey(item) === guideKey(guide));
  return { prev: index > 0 ? GUIDES[index - 1] : null, next: index >= 0 && index < GUIDES.length - 1 ? GUIDES[index + 1] : null };
}

/** The h2 headings of a guide, for "On this page". */
export function headingsOf(guide: Guide): { id: string; text: string }[] {
  return guide.blocks.flatMap((block) => (block.t === "h2" ? [{ id: block.id, text: plain(block.text) }] : []));
}

export function guideText(guide: Guide): string {
  return guide.blocks
    .flatMap(blockStrings)
    .map(plain)
    .filter(Boolean)
    .join(" ");
}

/** Reading time at 220 words a minute, never less than one. */
export function readingMinutes(guide: Guide): number {
  const words = guideText(guide).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Everything the docs search can find: every guide and every glossary term. */
export function buildSearchIndex(): SearchEntry[] {
  const guides: SearchEntry[] = GUIDES.map((guide) => ({
    href: guideHref(guide),
    title: guide.title,
    group: getSection(guide.section)?.title ?? "Docs",
    summary: guide.summary,
    text: guideText(guide),
  }));
  const terms: SearchEntry[] = GLOSSARY.map((term) => ({
    href: `/docs/glossary#${term.id}`,
    title: term.term,
    group: "Glossary",
    summary: term.text,
    text: "",
  }));
  return [...guides, ...terms];
}

/** Titles only, small enough to ship with every docs page for instant results. */
export function buildQuickIndex(): Pick<SearchEntry, "href" | "title" | "group" | "summary">[] {
  return buildSearchIndex().map(({ href, title, group, summary }) => ({ href, title, group, summary }));
}

export { GLOSSARY };
