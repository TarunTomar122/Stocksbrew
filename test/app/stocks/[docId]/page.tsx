import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getStockDoc, getStockHistory } from "@/lib/data";
import { asArray, asRecord, changeClass, formatCurrency, formatDateTime, formatNumber, formatPct } from "@/lib/format";

export default async function StockDetailPage({
  params,
}: {
  params: { docId: string };
}) {
  const docId = decodeURIComponent(params.docId);
  const [stockRaw, history] = await Promise.all([
    getStockDoc(docId),
    getStockHistory(docId, 30),
  ]);

  const stock = asRecord(stockRaw);
  const price = asRecord(stock.price);
  const sentiment = asRecord(stock.sentiment);
  const technicals = asRecord(stock.technicals);
  const news = asArray(stock.news).slice(0, 12);

  return (
    <AppShell title={`Stock: ${String(stock.symbol || docId)}`} subtitle={String(stock.name || "")}> 
      <Panel title="Price + Signal">
        <div className="stats-grid">
          <StatCard label="Last Price" value={formatCurrency(price.current)} />
          <StatCard label="Day Change" value={formatPct(price.changePct)} tone={changeClass(price.changePct)} />
          <StatCard label="Sentiment" value={String(sentiment.label || "-")} tone={changeClass(sentiment.overall)} />
          <StatCard label="RSI 14" value={formatNumber(technicals.rsi14)} />
          <StatCard label="Volume" value={formatNumber(price.volume)} />
          <StatCard label="Updated" value={formatDateTime(stock.lastUpdated)} />
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Catalysts / Highlights">
          <ul className="list-clean">
            {asArray(stock.catalysts).slice(0, 12).map((point, idx) => (
              <li key={`${String(point)}-${idx}`}>{String(point)}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent News">
          <ul className="list-clean">
            {news.map((item, idx) => {
              const row = asRecord(item);
              return (
                <li key={`${String(row.id || "news")}-${idx}`}>
                  <div className="row-head">
                    <strong>{String(row.title || "-")}</strong>
                    <span className={changeClass(row.sentiment)}>{formatNumber(row.sentiment)}</span>
                  </div>
                  <small>{String(row.source || "-")} • {formatDateTime(row.timestamp)}</small>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="History Runs (latest 30)">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Price</th>
                <th>Change</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const item = asRecord(row);
                const runPrice = asRecord(item.price);
                return (
                  <tr key={String(item.id)}>
                    <td>{String(item.id)}</td>
                    <td>{formatCurrency(runPrice.current)}</td>
                    <td className={changeClass(runPrice.changePct)}>{formatPct(runPrice.changePct)}</td>
                    <td>{formatDateTime(item.lastUpdated || item.updatedAtServer)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Intelligence Timeline (event model)">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Confidence</th>
                <th>Impact</th>
                <th>New?</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {asArray(asRecord(stock).news).slice(0, 20).map((row, idx) => {
                const item = asRecord(row);
                return (
                  <tr key={String(item.event_id || item.id || idx)}>
                    <td>{String(item.title || "-")}</td>
                    <td>{String(item.event_type || "-")}</td>
                    <td>{formatNumber(item.confidence_score)}</td>
                    <td>{formatNumber(item.impact_score)}</td>
                    <td>{item.is_new_since_last_run === true ? "yes" : item.is_new_since_last_run === false ? "no" : "-"}</td>
                    <td>{formatDateTime(item.timestamp || item.published_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <JsonDetails label="Raw stock doc" value={stockRaw} />
      <JsonDetails label="Raw history docs" value={history} />
    </AppShell>
  );
}
