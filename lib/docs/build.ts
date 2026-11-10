import type { Block } from "@/lib/docs/types";

/** Small builders so guide files read like an outline, not like JSON. */

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const p = (text: string): Block => ({ t: "p", text });
export const h2 = (text: string, id?: string): Block => ({ t: "h2", text, id: id ?? headingId(text) });
export const h3 = (text: string): Block => ({ t: "h3", text });
export const ul = (...items: string[]): Block => ({ t: "ul", items });
export const ol = (...items: string[]): Block => ({ t: "ol", items });
export const note = (text: string, title?: string): Block => ({ t: "note", tone: "info", title, text });
export const warn = (text: string, title?: string): Block => ({ t: "note", tone: "warn", title, text });
export const table = (head: string[], rows: string[][], caption?: string): Block => ({ t: "table", head, rows, caption });
export const steps = (...items: [title: string, text: string][]): Block => ({
  t: "steps",
  items: items.map(([title, text]) => ({ title, text })),
});
export const formula = (text: string, caption?: string): Block => ({ t: "formula", text, caption });
export const example = (title: string, ...lines: string[]): Block => ({ t: "example", title, lines });
export const defs = (...items: [term: string, text: string][]): Block => ({
  t: "defs",
  items: items.map(([term, text]) => ({ term, text })),
});
export const code = (codeText: string, label?: string): Block => ({ t: "code", code: codeText, label });

/** Strip the inline marks, for search text and reading time. */
export function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

/** Every href used inside a piece of inline text. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
}

/** All the inline strings of a block, in reading order. */
export function blockStrings(block: Block): string[] {
  switch (block.t) {
    case "p":
    case "h2":
    case "h3":
      return [block.text];
    case "ul":
    case "ol":
      return block.items;
    case "note":
      return [block.title ?? "", block.text];
    case "table":
      return [...block.head, ...block.rows.flat(), block.caption ?? ""];
    case "steps":
      return block.items.flatMap((item) => [item.title, item.text]);
    case "formula":
      return [block.text, block.caption ?? ""];
    case "example":
      return [block.title, ...block.lines];
    case "defs":
      return block.items.flatMap((item) => [item.term, item.text]);
    case "code":
      return [block.label ?? "", block.code];
    case "entitlements":
      return [];
  }
}
