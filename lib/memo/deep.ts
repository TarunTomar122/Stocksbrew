import type { FactKind, Memo } from "./types";

/**
 * The memo items only the deeper analysis finds (lib/entitlements.ts portfolio_analysis_deep): the biggest company
 * and sector once funds are opened, and past crashes. A Free memo is written without them (lib/memo/data.ts
 * loadShapeFacts); an earlier week written on Pro has them taken out when a Free reader opens it.
 */
const DEEP_KINDS: ReadonlySet<FactKind> = new Set<FactKind>(["concentration", "sector", "stress"]);

export function withoutDeepItems(memo: Memo): Memo {
  const keep = <T extends { kind: FactKind }>(items: T[]) => items.filter((item) => !DEEP_KINDS.has(item.kind));
  return { ...memo, changed: keep(memo.changed), hurt: keep(memo.hurt), look: keep(memo.look) };
}
