import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getUsNewsNamespace } from "@/lib/data";
import { asArray, asRecord, formatDateTime, formatNumber } from "@/lib/format";

export default async function NewsPage() {
  const data = await getUsNewsNamespace();

  const namespace = asRecord(data.namespaceDoc);
  const marketContext = asRecord(data.marketContext);

  return (
    <AppShell title="US News Intelligence" subtitle={`Namespace ${data.namespaceId}`}>
      <Panel title="Pipeline Snapshot">
        <div className="stats-grid">
          <StatCard label="Articles" value={formatNumber(namespace.article_count)} />
          <StatCard label="Enrichments" value={formatNumber(namespace.enrichment_count)} />
          <StatCard label="Stock Intel" value={formatNumber(namespace.stock_intelligence_count)} />
          <StatCard label="Updated" value={formatDateTime(namespace.updated_at)} />
        </div>
      </Panel>

      <Panel title="Market Context">
        <p><strong>Today</strong>: {String(marketContext.today_brief || "-")}</p>
        <p><strong>Week</strong>: {String(marketContext.week_brief || "-")}</p>
      </Panel>

      <div className="grid-2">
        <Panel title="Latest Articles">
          <ul className="list-clean">
            {data.articles.slice(0, 12).map((article) => {
              const item = asRecord(article);
              return (
                <li key={String(item.id)}>
                  <div className="row-head">
                    <strong>{String(item.title || "-")}</strong>
                    <span>{formatDateTime(item.published_at)}</span>
                  </div>
                  <small>{String(item.source_name || "-")} • {String(item.sentiment_label || "-")}</small>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Stock Intelligence (sample)">
          <ul className="list-clean">
            {data.stockIntelligence.slice(0, 12).map((row) => {
              const item = asRecord(row);
              return (
                <li key={String(item.id)}>
                  <div className="row-head">
                    <strong>{String(item.ticker || item.instrument_id || "-")}</strong>
                    <span>{formatNumber(item.overall_score)}</span>
                  </div>
                  <small>{String(item.overall_label || "-")} • news {formatNumber(item.news_count)}</small>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent Run Summaries">
        <ul className="list-clean">
          {data.runSummaries.slice(0, 10).map((summary, idx) => {
            const item = asRecord(summary);
            return (
              <li key={String(item.id || idx)}>
                <div className="row-head">
                  <strong>{String(item.date || "-")}</strong>
                  <span>{String(item.phase || item.run_type || "-")}</span>
                </div>
                <small>{String(item.summary || item.topline || "-")}</small>
              </li>
            );
          })}
        </ul>
      </Panel>

      <JsonDetails label="Raw namespace doc" value={data.namespaceDoc} />
      <JsonDetails label="Raw market context" value={data.marketContext} />
      <JsonDetails label="Raw articles" value={data.articles} />
      <JsonDetails label="Raw enrichments" value={data.enrichments} />
      <JsonDetails label="Raw stock intelligence" value={data.stockIntelligence} />
      <JsonDetails label="Raw sector context" value={data.sectorContext} />
      <JsonDetails label="Raw run summaries" value={data.runSummaries} />
    </AppShell>
  );
}
