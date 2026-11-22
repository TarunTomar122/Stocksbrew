import Link from "next/link";
import * as React from "react";

import { shortSectorName } from "@/components/markets/sector-heatmap";
import { Delta, NUM, toneOf, toneText } from "@/components/oa/kit";
import { NavIcon } from "@/components/oa/nav-icon";
import { SectorIcon } from "@/components/oa/sector-icon";
import { StockLogo } from "@/components/stock-logo";
import { FULL_MOVE, GAP, biggestCompanies, dayOf, heatColor, sectorMovers, signedPct, tilePrice, type HeatSector, type HeatStock, type MapLayout, type StackLayout, type TileBox } from "@/lib/heatmap";
import { sectorHref } from "@/lib/seo/families";

import s from "./heatmap.module.css";

/**
 * The stock market heat map (/heatmap), drawn on the server from lib/heatmap.ts: sector blocks of tiles placed by
 * percent, each tile a link to its stock with its ticker, move, and logo and price where the tile holds them
 * (heatmap.module.css decides from the tile's own size). No hooks, no measuring.
 */

const pct = (box: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
  left: `${box.x.toFixed(3)}%`,
  top: `${box.y.toFixed(3)}%`,
  width: `${box.w.toFixed(3)}%`,
  height: `${box.h.toFixed(3)}%`,
});

/** Logos only where a tile is big enough to show one at the width it was laid out for (they are hidden below that). */
const LOGO_W = 78;
const LOGO_H = 44;
/** The widest the wide map is drawn, over the width it is laid out at (84rem of content over 740px): a tile with room for its logo there gets one. The logos load lazily, so a hidden one costs nothing. */
const MAX_GROW = 1.8;
/** The wide map on a 1280px laptop, over the width it is laid out at. */
const LAPTOP_GROW = 1.3;

function tileWords(tile: TileBox, noMove: string): { move: string; label: string; title: string } {
  const { stock } = tile;
  const move = stock.pct === null ? "" : signedPct(stock.pct);
  const price = stock.price === null ? "" : tilePrice(stock.price);
  // Said from the rounded figure, so a −0.03% move reads "flat", never "down 0.0%".
  const shown = stock.pct === null ? null : Number(stock.pct.toFixed(1));
  const words = shown === null ? noMove : shown === 0 ? "flat" : `${shown > 0 ? "up" : "down"} ${Math.abs(shown).toFixed(1)}%`;
  const label = [stock.symbol, stock.name !== stock.symbol ? stock.name : "", words, price].filter(Boolean).join(", ");
  const title = `${stock.symbol} · ${stock.name}${price ? ` · ${price}` : ""}${move ? ` · ${move}` : ""}`;
  return { move, label, title };
}

function Tile({
  tile,
  noMove,
  grow = 1,
}: {
  tile: TileBox;
  /** What a tile without a move says to a screen reader ("no move at Friday's close"). */
  noMove: string;
  /** How much bigger than laid out the tile can be drawn. */
  grow?: number;
}) {
  const { stock } = tile;
  const { move, label, title } = tileWords(tile, noMove);
  const logo = tile.px.w * grow >= LOGO_W && tile.px.h * grow >= LOGO_H;
  const length = Math.min(6, Math.max(1, stock.symbol.length));
  return (
    <Link
      prefetch={false}
      href={`/stock/${encodeURIComponent(stock.symbol)}`}
      aria-label={label}
      title={title}
      className={`${s.tile} ${s[`l${length}`] ?? ""}`}
      style={{ ...pct(tile), background: heatColor(stock.pct) }}
    >
      <span className={s.body}>
        <span className={s.top}>
          {logo ? (
            <span className={s.logo}>
              <StockLogo ticker={stock.symbol} size={24} />
            </span>
          ) : null}
          <span className={s.sym}>{stock.symbol}</span>
        </span>
        <span className={s.line}>
          {move ? <span className={`oa-mono ${s.pct}`}>{move}</span> : null}
          {stock.price !== null ? <span className={`oa-mono ${s.price}`}>{tilePrice(stock.price)}</span> : null}
        </span>
      </span>
    </Link>
  );
}

/** About how wide a sector strip's words are at 12px semibold: icon and gap, ~7.6px a letter, and the padding. */
function headWidth(name: string, move: string): number {
  return 14 + 5 + name.length * 7.6 + (move ? move.length * 7.2 + 6 : 0) + 12;
}

/**
 * A sector's strip over its block: icon, name and the sector's move. The full name where it fits on a laptop's map,
 * else the short one ("Health"). The strip wraps onto a hidden second line, so a block too narrow for the move drops
 * the move, and one too narrow for the name shows the icon alone, never a cut word (the link's label and title keep
 * both, and so does the sector's card).
 */
function SectorHead({ sector, widthPx, grow = 1 }: { sector: HeatSector; widthPx: number; /** How much wider than laid out the strip is usually drawn. */ grow?: number }) {
  const move = sector.pct === null ? "" : signedPct(sector.pct);
  const name = headWidth(sector.name, move) <= widthPx * grow ? sector.name : shortSectorName(sector.name);
  return (
    <Link
      prefetch={false}
      href={sectorHref(sector.slug)}
      aria-label={`${sector.name}${move ? `, ${move}` : ""}`}
      title={`${sector.name}${move ? ` ${move}` : ""}: ${sector.stocks.length} stocks`}
      className={s.head}
    >
      <SectorIcon id={sector.name} size={13} className="shrink-0" />
      <span className={s.name}>{name}</span>
      {move ? <span className={`oa-mono ${s.headMove} ${toneText(toneOf(Number(sector.pct!.toFixed(1))))}`}>{move}</span> : null}
    </Link>
  );
}

/** The wide map, laid out at `layout.width` and scaled to its box by percent. */
export function HeatMapWide({ layout, noMove, className = "" }: { layout: MapLayout; noMove: string; className?: string }) {
  return (
    <div
      role="group"
      aria-label="Stock market heat map: each sector's biggest companies, sized by market value and coloured by the day's move"
      className={`oa-type-fixed ${s.map} ${className}`}
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      {layout.blocks.map((block) => {
        // A sector too small to hold a tile at this size is left off, not drawn as an empty strip.
        if (block.tiles.length === 0) return null;
        const widthPx = (block.w / 100) * layout.width - 2 * GAP;
        return (
          <div key={block.sector.slug} className={s.block} style={pct(block)}>
            <SectorHead sector={block.sector} widthPx={widthPx} grow={LAPTOP_GROW} />
            <div className={s.inside}>
              {block.tiles.map((tile) => (
                <Tile key={tile.stock.symbol} tile={tile} noMove={noMove} grow={MAX_GROW} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The phone map: each sector a full-width block, one under another. */
export function HeatMapStack({ layout, noMove, className = "" }: { layout: StackLayout; noMove: string; className?: string }) {
  return (
    <div role="group" aria-label="Stock market heat map by sector, sized by market value and coloured by the day's move" className={`oa-type-fixed ${s.stack} ${className}`}>
      {layout.blocks.map((block) => (
        <div key={block.sector.slug} className={s.stackBlock}>
          <SectorHead sector={block.sector} widthPx={layout.width} />
          <div className={s.stackInside} style={{ aspectRatio: `${layout.width} / ${block.height}` }}>
            {block.tiles.map((tile) => (
              <Tile key={tile.stock.symbol} tile={tile} noMove={noMove} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The colour scale, once for the map: the moves each shade stands for. */
export function HeatScale({ className = "" }: { className?: string }) {
  const stops = [-FULL_MOVE, -1.5, -0.5, 0, 0.5, 1.5, FULL_MOVE];
  return (
    <div className={`oa-type-fixed flex items-center gap-2 text-[12px] text-oa-muted-fg ${className}`}>
      <span role="img" className="flex items-center gap-px overflow-hidden rounded-[3px]" aria-label={`Colour scale from ${signedPct(-FULL_MOVE, 0)} to ${signedPct(FULL_MOVE, 0)}`}>
        {stops.map((stop) => (
          <span key={stop} aria-hidden="true" className={`${NUM} flex h-5 w-[42px] items-center justify-center text-[10.5px] text-oa-fg`} style={{ background: heatColor(stop) }}>
            {stop === 0 ? "0" : signedPct(stop, Number.isInteger(stop) ? 0 : 1)}
          </span>
        ))}
      </span>
      <span>Size is market value</span>
    </div>
  );
}

type CardData = { key: string; name: string; href: string; icon: React.ReactNode; pct: number | null; rising: number; moved: number; movers: HeatStock[] };

/** The biggest companies' card that opens the grid: how the giants did, apart from their sectors. */
const GIANTS = 50;

/**
 * Every sector as a card, after one for the biggest companies: the move, how many of its stocks rose, and its best and
 * worst stocks of the day, each a link. The map's words as text, so the day reads without the picture too.
 */
export function SectorCards({ sectors, live }: { sectors: readonly HeatSector[]; live: boolean }) {
  // Only companies with a move today, so the card's "N of 50 rose" counts all fifty.
  const giants = biggestCompanies(sectors, GIANTS, { moved: true });
  const cards: CardData[] = [
    ...(giants.length >= 10
      ? [
          {
            key: "giants",
            name: `${giants.length} biggest companies`,
            href: "/screener",
            icon: <NavIcon name="markets" className="size-4 shrink-0" />,
            ...dayOf(giants),
            movers: sectorMovers(giants),
          },
        ]
      : []),
    ...sectors.map((sector) => ({
      key: sector.slug,
      name: sector.name,
      href: sectorHref(sector.slug),
      icon: <SectorIcon id={sector.name} size={16} className="shrink-0" />,
      pct: sector.pct,
      rising: sector.rising,
      moved: sector.moved,
      movers: sectorMovers(sector.stocks),
    })),
  ];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <li key={card.key} className="oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card px-3 pb-2 pt-3">
          <div className="flex items-start justify-between gap-3 px-1">
            <h3 className="min-w-0 text-[15px] font-semibold leading-5">
              <Link prefetch={false} href={card.href} className="inline-flex items-start gap-2 rounded text-oa-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring">
                <span className="mt-0.5 flex">{card.icon}</span>
                <span className="text-balance">{card.name}</span>
              </Link>
            </h3>
            <Delta value={card.pct} digits={1} className="shrink-0 text-[16px] font-semibold leading-5" />
          </div>
          {card.moved > 0 ? (
            <p className="px-1 text-[12.5px] leading-5 text-oa-muted-fg">
              {card.rising} of {card.moved} {live ? "up" : "rose"}
            </p>
          ) : null}
          <ul className="mt-1.5 flex flex-col">
            {card.movers.map((stock) => (
              <li key={stock.symbol}>
                <Link
                  prefetch={false}
                  href={`/stock/${encodeURIComponent(stock.symbol)}`}
                  title={stock.name}
                  className="flex items-center gap-2 rounded px-1 py-1 text-[13.5px] hover:bg-oa-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring"
                >
                  <StockLogo ticker={stock.symbol} size={18} atOnce />
                  <span className="min-w-0 flex-1 truncate font-semibold text-oa-fg">{stock.symbol}</span>
                  {stock.price !== null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{tilePrice(stock.price)}</span> : null}
                  <Delta value={stock.pct} digits={1} className="w-[3.75rem] shrink-0 text-right text-[13px]" />
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
