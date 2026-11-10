/**
 * The docs are plain TypeScript, not MDX: every guide is a typed list of
 * blocks. That keeps the pages statically rendered, lets the search index
 * read the same text the page shows, and lets a test walk every link.
 *
 * Inline text supports three marks: **bold**, `code` and [label](href).
 */

export type SectionId =
  | "start"
  | "briefing"
  | "portfolio"
  | "research"
  | "follow"
  | "strategies"
  | "agents"
  | "ask"
  | "methodology"
  | "tools";

export type DocSection = {
  id: SectionId;
  title: string;
  /** One line under the title on the index. */
  blurb: string;
};

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; text: string; id: string }
  | { t: "h3"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  /** A boxed aside. "warn" is for the things people get wrong. */
  | { t: "note"; tone: "info" | "warn"; title?: string; text: string }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string }
  /** Numbered steps with a title each. */
  | { t: "steps"; items: { title: string; text: string }[] }
  /** A formula set in mono, with the words for it underneath. */
  | { t: "formula"; text: string; caption?: string }
  /** A worked example: a title and the lines of arithmetic. */
  | { t: "example"; title: string; lines: string[] }
  | { t: "defs"; items: { term: string; text: string }[] }
  | { t: "code"; label?: string; code: string }
  /** The Free vs Pro table, rendered from lib/entitlements.ts so it cannot drift. */
  | { t: "entitlements" };

export type ToolId = "position-size" | "cagr" | "drawdown-recovery";

export type Guide = {
  section: SectionId;
  slug: string;
  title: string;
  /** One or two sentences: what the reader will know afterwards. */
  summary: string;
  /** YYYY-MM-DD of the last material change. */
  updated: string;
  /** The part of the product the guide is about. */
  surface?: { label: string; href: string };
  blocks: Block[];
  /** "section/slug" of guides worth reading next. */
  related?: string[];
  /** Set on the calculator pages. */
  tool?: ToolId;
};

export type GlossaryTerm = {
  term: string;
  id: string;
  text: string;
  /** A guide that goes deeper: "section/slug". */
  see?: string;
};

export type SearchEntry = {
  href: string;
  title: string;
  /** Section title, or "Glossary". */
  group: string;
  summary: string;
  /** Headings and body as plain text, lowercased by the client when matching. */
  text: string;
};
