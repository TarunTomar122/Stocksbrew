import type { ResearchSource, ResearchSourceKind } from "@/lib/research/types";

/**
 * Every source a run reads gets one short id (S1, S2, ...) the first time it
 * is cited. The evidence handed to the model carries those ids, the model
 * cites them, and the page turns them back into links. The same document read
 * twice keeps its first id.
 */
export class SourceBook {
  private readonly list: ResearchSource[] = [];
  private readonly byKey = new Map<string, string>();

  cite(source: { label: string; url?: string | null; kind: ResearchSourceKind; as_of?: string | null }): string {
    const url = source.url && /^(https?:\/\/|\/)/.test(source.url) ? source.url : null;
    // An outside document is one source however it is labelled; our own pages (/stock/T) back several different sources.
    const key = url && /^https?:/.test(url) ? `${url}|` : `${url ?? ""}|${source.label}`;
    const known = this.byKey.get(key);
    if (known) return known;
    const id = `S${this.list.length + 1}`;
    this.list.push({ id, label: source.label.replace(/\s+/g, " ").trim().slice(0, 220), url, kind: source.kind, as_of: source.as_of ?? null });
    this.byKey.set(key, id);
    return id;
  }

  all(): ResearchSource[] {
    return this.list.map((source) => ({ ...source }));
  }

  has(id: string): boolean {
    return this.list.some((source) => source.id === id);
  }
}
