"use client";

import { BasketActions } from "@/components/screener/basket-actions";
import { Menu } from "@/components/screener/menu";

import { WatchIdeaLink } from "./watch-idea-link";

/**
 * A theme book's header actions: "Watch this idea" is the one primary button, and saving, comparing and backtesting
 * sit in a "More" menu off it (owner rule: one primary per header).
 */
export function ThemeActions({
  theme,
  symbols,
  compareLimit,
}: {
  theme: string;
  symbols: readonly string[];
  compareLimit: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <WatchIdeaLink theme={theme} />
      <Menu label="More" align="right" width="w-60">
        <div className="p-2">
          <BasketActions
            symbols={symbols}
            compareLimit={compareLimit}
            watchLabel="Save as watchlist"
            className="flex-col !items-stretch [&>*]:justify-start"
          />
        </div>
      </Menu>
    </div>
  );
}
