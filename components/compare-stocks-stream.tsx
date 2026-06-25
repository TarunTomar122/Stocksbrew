import { CompareStocksInteractive } from "@/components/compare-stocks-interactive";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export async function CompareStocksStream() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market).catch(() => []);
  return <CompareStocksInteractive searchIndex={searchIndex} />;
}
