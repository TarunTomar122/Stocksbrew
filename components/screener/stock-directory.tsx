"use client";

import Link from "next/link";
import * as React from "react";

/**
 * Every covered stock, A to Z by sector, behind one fold under the screener.
 * The page hands each sector over as one string ("AAPL\tApple Inc.\nMSFT\t...")
 * instead of eight hundred server-rendered links, so the links cost their text
 * once in the HTML and a few bytes each in the RSC payload. They still render
 * on the server, so the fold works before JavaScript and crawlers see every link.
 */
export type DirectoryGroup = {
  slug: string;
  name: string;
  /** Links to /screener?sector=slug; false for the "Not classified" group. */
  linked: boolean;
  /** One "SYMBOL\tCompany name" line per stock, in order. */
  stocks: string;
};

export function StockDirectory({ groups }: { groups: DirectoryGroup[] }) {
  // Symbol -> company name, for the hover title below.
  const names = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const line of group.stocks ? group.stocks.split("\n") : []) {
        const [symbol = "", name = ""] = line.split("\t");
        if (name) map.set(symbol, name);
      }
    }
    return map;
  }, [groups]);
  // The company name shows on hover as the link's title. It is set when the pointer first reaches
  // a link instead of being printed on all eight hundred: the names are already in the page's data,
  // so the HTML need not carry them a second time.
  const nameOnHover = (event: React.PointerEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest?.('a[href^="/stock/"]');
    if (!(link instanceof HTMLAnchorElement) || link.title) return;
    let symbol = "";
    try {
      symbol = decodeURIComponent((link.getAttribute("href") ?? "").slice("/stock/".length));
    } catch {
      return;
    }
    const name = names.get(symbol);
    if (name) link.title = name;
  };
  return (
    <div className="flex flex-col gap-4 border-t border-oa-border p-4" onPointerOver={nameOnHover}>
      {groups.map((group) => {
        const lines = group.stocks ? group.stocks.split("\n") : [];
        return (
          <section key={group.slug}>
            <h3 className="oa-caption mb-1.5">
              {group.linked ? (
                <Link prefetch={false} href={`/screener?sector=${group.slug}`} className="hover:underline">
                  {group.name}
                </Link>
              ) : (
                group.name
              )}{" "}
              <span className="text-oa-muted-fg">{lines.length}</span>
            </h3>
            <ul className="sd-list">
              {lines.map((line) => {
                const symbol = line.split("\t")[0] ?? "";
                return (
                  <li key={symbol}>
                    <Link prefetch={false} href={`/stock/${encodeURIComponent(symbol)}`}>
                      {symbol}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
