import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getViewDocs } from "@/lib/data";
import { asArray, asRecord, changeClass, formatCurrency, formatNumber, formatPct } from "@/lib/format";

export default async function ViewsPage() {
  const data = await getViewDocs();
  const tm = asRecord(data.tmViewsDashboardUs);
  const marketSentiment = asRecord(tm.market_sentiment);
  const hero = asRecord(tm.hero_brief);
  const rows = asArray(tm.watchlist_rows).slice(0, 20);

  return (
    <AppShell title="TM Materialized Dashboard View" subtitle={`Document: tm_views_dashboard/US__${data.activeUniverse}`}>
      <Panel title="Topline">
        <div className="stats-grid">
          <StatCard label="Universe" value={data.activeUniverse} />
          <StatCard label="Sentiment" value={String(marketSentiment.label || "-")} tone={changeClass(marketSentiment.score)} />
          <StatCard label="Sentiment Score" value={formatNumber(marketSentiment.score)} tone={changeClass(marketSentiment.score)} />
          <StatCard label="Rows" value={formatNumber(rows.length)} />
        </div>
      </Panel>

      <Panel title="Hero Brief">
        <p><strong>{String(hero.title || "-")}</strong></p>
        <p>{String(hero.body || "-")}</p>
      </Panel>

      <Panel title="Watchlist Rows">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Sector</th>
                <th>Price</th>
                <th>Day</th>
                <th>Sentiment</th>
                <th>News</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const item = asRecord(row);
                return (
                  <tr key={String(item.instrument_id || idx)}>
                    <td>{String(item.ticker || "-")}</td>
                    <td>{String(item.name || "-")}</td>
                    <td>{String(item.sector || "-")}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td className={changeClass(item.day_change_pct)}>{formatPct(item.day_change_pct)}</td>
                    <td>{formatNumber(item.ai_sentiment_score)}</td>
                    <td>{formatNumber(item.news_count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <JsonDetails label="Raw tm view doc" value={data.tmViewsDashboardUs} />
    </AppShell>
  );
}
