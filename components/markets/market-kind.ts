import type { KindIconName } from "@/components/oa/nav-icon";
import type { MarketAssetClass } from "@/lib/markets-shared";

/**
 * The kind icon for a market (owner VISUALS CHECK: any list of kinds carries its icon): a stock index is the markets
 * bars, a yield a percent sign, oil and gas a drop, gold and silver a bar of bullion, the dollar and other currencies
 * a dollar sign, crypto a block. One map for the ticker strip, the More markets cards and the movers' marks.
 */
const METALS = /^(?:GC|SI|PL|PA|HG)(?:=F)?$|GOLD|SILVER/i;
const DOLLAR = /^(?:DXY|DX-Y\.NYB|DX)(?:=F)?$/i;

export function marketKindIcon(asset: { class: MarketAssetClass; symbol: string; name?: string }): KindIconName {
  if (asset.class === "commodity") return METALS.test(asset.symbol) || /\b(?:gold|silver|platinum|copper)\b/i.test(asset.name ?? "") ? "ingot" : "drop";
  // The dollar index is a dollar sign wherever it is filed; a currency pair is two arrows trading places.
  if (DOLLAR.test(asset.symbol) || /\bdollar index\b/i.test(asset.name ?? "")) return "dollar";
  if (asset.class === "fx") return "exchange";
  if (asset.class === "rate") return "percent";
  if (asset.class === "crypto") return "block";
  if (asset.class === "etf") return "briefcase";
  if (asset.class === "option") return "pulse";
  return "markets";
}
