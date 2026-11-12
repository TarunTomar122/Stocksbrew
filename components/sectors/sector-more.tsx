import Link from "next/link";

import { Delta, NUM, Panel } from "@/components/oa/kit";
import { SectorIcon } from "@/components/oa/sector-icon";
import { StockLogo } from "@/components/stock-logo";
import { pairHref, sectorHref, type StockPair } from "@/lib/seo/families";

export type SectorMoreTheme = { slug: string; name: string; members: string[] };
export type SectorMoreOther = { slug: string; name: string; change: number | null };

const THEME_CHIPS = 16;
// Desktop columns for one to four tiles, each about a fifth of the page wide (whole class names, so Tailwind sees them).
const FEW_COLS = [
  "",
  "lg:grid-cols-[repeat(1,minmax(0,15rem))]",
  "lg:grid-cols-[repeat(2,minmax(0,15rem))]",
  "lg:grid-cols-[repeat(3,minmax(0,15rem))]",
  "lg:grid-cols-[repeat(4,minmax(0,15rem))]",
];

/**
 * The foot of a sector page (/sectors/technology): rival pairs, the themes that hold its stocks and the other sectors,
 * each a full-width card that ends where its content does. As three cards side by side the shorter two were stretched
 * over blank space (owner rule 4; council, Nov 12). All of it shows on a phone too, with no toggle (owner rule 2); a card
 * with nothing in it is left out; the other sectors are equal tiles.
 */
export function SectorMore({ pairs, themes, others }: { pairs: StockPair[]; themes: SectorMoreTheme[]; others: SectorMoreOther[] }) {
  const few = others.length > 0 && others.length < 5;
  return (
    <>
      {pairs.length ? (
        <Panel flush label="Rivals side by side" className="mb-4">
            <ul className="flex flex-wrap gap-2 p-4">
              {pairs.map((pair) => (
                <li key={pair.slug}>
                  <Link
                    prefetch={false}
                    href={pairHref(pair.a, pair.b)}
                    title={pair.group}
                    className={`${NUM} inline-flex h-9 items-center gap-1.5 rounded-md border border-oa-border px-2.5 text-[13.5px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent`}
                  >
                    <StockLogo ticker={pair.a} size={16} />
                    {pair.a}
                    <span className="text-oa-muted-fg">vs</span>
                    <StockLogo ticker={pair.b} size={16} />
                    {pair.b}
                  </Link>
                </li>
              ))}
            </ul>
        </Panel>
      ) : null}
        {themes.length ? (
          <Panel flush label="Themes with these stocks" className="mb-4">
            <ul>
              {themes.map((theme) => (
                <li key={theme.slug} className="border-b border-oa-border last:border-b-0">
                  <Link
                    prefetch={false}
                    href={`/themes/${theme.slug}`}
                    className="flex flex-col gap-1.5 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="shrink-0 text-pretty font-medium sm:w-52">{theme.name}</span>
                    <span className={`${NUM} flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-oa-muted-fg`}>
                      {theme.members.slice(0, THEME_CHIPS).map((ticker) => (
                        <span key={ticker} className="inline-flex items-center gap-1">
                          <StockLogo ticker={ticker} size={14} />
                          {ticker}
                        </span>
                      ))}
                      {theme.members.length > THEME_CHIPS ? <span>+{theme.members.length - THEME_CHIPS}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      {others.length ? (
        <Panel
          flush
          label="Other sectors"
          className={few ? "lg:w-fit lg:max-w-full" : ""}
          right={
            <Link prefetch={false} href="/best" className="text-oa-primary hover:underline">
              Best stock lists →
            </Link>
          }
        >
          {/* Equal tiles, five across on a desktop and two on a phone (council, Nov 12: the last one never stretches).
              Fewer than five size the card to the tiles instead of leaving most of a row empty, and a lone tile takes
              the phone's whole width. Each tile draws its own right and bottom rule, so a short last row ends in plain
              card, not a grey gap. */}
          <ul className={`-mb-px -mr-px grid ${others.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${few ? FEW_COLS[others.length] : "lg:grid-cols-5"}`}>
            {others.map((item) => (
              <li key={item.slug} className="border-b border-r border-oa-border">
                <Link prefetch={false} href={sectorHref(item.slug)} className="flex h-full flex-col gap-1 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="flex min-w-0 items-start gap-2">
                    <SectorIcon id={item.name} size={15} className="mt-0.5" />
                    {/* Whole names, wrapping to a second line rather than cut with "…" (council, Nov 12). */}
                    <span className="min-w-0 text-pretty leading-5">{item.name}</span>
                  </span>
                  <Delta value={item.change} digits={1} className="text-[13px]" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
