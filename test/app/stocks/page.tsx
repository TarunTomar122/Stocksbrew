import Link from "next/link";

import { AppShell, Panel } from "@/components/ui";
import { listUsStocks } from "@/lib/data";
import { asRecord, changeClass, formatCurrency, formatDateTime, formatPct, toText, formatNumber } from "@/lib/format";

export default async function StocksPage() {
  const stocks = await listUsStocks(250);

  return (
    <AppShell title="US Stocks" subtitle="Latest stock documents with price, sentiment, and signal data">
      <Panel title={`Universe (${stocks.length} rows)`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Price</th>
                <th>Change</th>
                <th>Sentiment</th>
                <th>Confidence</th>
                <th>Freshness</th>
                <th>Vs Mkt</th>
                <th>Run Type</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => {
                const price = asRecord(stock.price);
                const sentiment = asRecord(stock.sentiment);
                const quality = asRecord(stock.dataQuality);
                const comparative = asRecord(stock.comparativeContext);
                const symbol = toText(stock.symbol, String(stock.id));
                return (
                  <tr key={String(stock.id)}>
                    <td>
                      <Link href={`/stocks/${encodeURIComponent(String(stock.id))}`}>{symbol}</Link>
                    </td>
                    <td>{toText(stock.name)}</td>
                    <td>{formatCurrency(price.current)}</td>
                    <td className={changeClass(price.changePct)}>{formatPct(price.changePct)}</td>
                    <td>{toText(sentiment.label, "-")}</td>
                    <td>{formatNumber(quality.confidence_score)}</td>
                    <td>{toText(quality.freshness_status, "-")}</td>
                    <td className={changeClass(comparative.vs_market_day_change_pct)}>{formatPct(comparative.vs_market_day_change_pct)}</td>
                    <td>{toText(stock.runType, "-")}</td>
                    <td>{formatDateTime(stock.lastUpdated)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
