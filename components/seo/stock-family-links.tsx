import { CardGrid, NUM, Panel, fmtDay } from "@/components/oa/kit";
import { sectorSlug } from "@/lib/screener-shared";
import { insiderHref, moveHref, pairHref, sectorHref } from "@/lib/seo/families";
import { getCoverage, getInsiderCounts, getRecentMoves, pairsFor, stockPairs } from "@/lib/seo/family-data";

type Item = { href: string; label: string; meta?: string };

function Links({ items }: { items: Item[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.href} className="border-b border-oa-border last:border-b-0">
          <a href={item.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] leading-5 text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
            <span className="min-w-0 truncate">{item.label}</span>
            {item.meta ? <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{item.meta}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The bottom of a stock page: the pages about this stock that live elsewhere
 * (its sector, its rivals side by side, its explained moves, its insider
 * trades). Only links to pages that exist; renders nothing for a stock we do
 * not cover.
 */
export async function StockFamilyLinks({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const coverage = await getCoverage();
  const row = coverage.bySymbol.get(upper);
  if (!row) return null;
  const [moves, insiders] = await Promise.all([getRecentMoves(), getInsiderCounts()]);
  const pairs = pairsFor(stockPairs(coverage), upper).slice(0, 3);
  const recent = moves.filter((move) => move.ticker === upper).slice(0, 5);
  const insider = insiders.find((item) => item.symbol === upper);

  const panels: Array<{ label: string; items: Item[] }> = [];
  if (pairs.length) {
    panels.push({
      label: `Compare ${upper} with`,
      items: pairs.map((pair) => {
        const other = pair.a === upper ? pair.b : pair.a;
        return { href: pairHref(pair.a, pair.b), label: `${upper} vs ${other}`, meta: coverage.bySymbol.get(other)?.name ?? undefined };
      }),
    });
  }
  if (recent.length) {
    panels.push({
      label: "Why it moved",
      items: recent.map((move) => ({
        href: moveHref(upper, move.day),
        label: move.headline,
        meta: `${fmtDay(move.day)} ${move.pct >= 0 ? "+" : "−"}${Math.abs(move.pct).toFixed(1)}%`,
      })),
    });
  }
  const more: Item[] = [];
  if (row.sector) more.push({ href: sectorHref(sectorSlug(row.sector)), label: `${row.sector} stocks`, meta: row.industry ?? undefined });
  more.push({
    href: insiderHref(upper),
    label: "All insider trades",
    meta: insider ? `${insider.trades} on file` : undefined,
  });
  more.push({ href: `/calendar/earnings/${encodeURIComponent(upper)}`, label: "Earnings dates and results" });
  panels.push({ label: `More on ${upper}`, items: more });

  return (
    <section aria-label={`More on ${upper}`} className="mx-auto w-full max-w-[84rem] px-2 pb-[72px] sm:px-6 lg:pb-10">
      <CardGrid cols={3}>
        {panels.map((panel) => (
          <Panel key={panel.label} flush fill label={panel.label}>
            <Links items={panel.items} />
          </Panel>
        ))}
      </CardGrid>
    </section>
  );
}

/**
 * The same family of pages as a short row near the top of the stock page, so
 * the way to its sector, rivals, insiders, earnings and latest explained move
 * is visible before the reader scrolls. Only links to pages that exist.
 */
export async function StockRelatedRow({ ticker }: { ticker: string }) {
  const upper = ticker.toUpperCase();
  const coverage = await getCoverage().catch(() => null);
  const row = coverage?.bySymbol.get(upper);
  if (!coverage || !row) return null;
  const moves = await getRecentMoves().catch(() => []);
  const move = moves.find((item) => item.ticker === upper);
  const pair = pairsFor(stockPairs(coverage), upper)[0];
  const other = pair ? (pair.a === upper ? pair.b : pair.a) : null;
  const links: Item[] = [];
  if (move) links.push({ href: moveHref(upper, move.day), label: `Why it moved ${fmtDay(move.day)}` });
  if (row.sector) links.push({ href: sectorHref(sectorSlug(row.sector)), label: `${row.sector} stocks` });
  if (pair && other) links.push({ href: pairHref(pair.a, pair.b), label: `${upper} vs ${other}` });
  links.push({ href: insiderHref(upper), label: "Insider trades" });
  links.push({ href: `/calendar/earnings/${encodeURIComponent(upper)}`, label: "Earnings history" });
  return (
    <nav aria-label={`Related to ${upper}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-t border-oa-border px-3.5 py-2.5 sm:px-4">
      <span className="mr-1 text-[13px] leading-5 text-oa-muted-fg">Related</span>
      {links.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex h-8 items-center rounded-full border border-oa-border bg-oa-card px-3 text-[13px] font-medium leading-5 text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
