import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getMarketUsDoc } from "@/lib/data";
import { asArray, asRecord, changeClass, formatNumber } from "@/lib/format";

export default async function MarketPage() {
  const marketRaw = await getMarketUsDoc();
  const wrapper = asRecord(marketRaw);
  const market = asRecord(wrapper.market_context);
  const namespace = asRecord(wrapper.namespace);
  const sentiment = {
    label: String(market.today_label || "-"),
    overall: Number(market.today_score || 0),
  };
  const todayPoints = asArray(market.today_key_points).map((item) => String(item)).filter(Boolean);
  const weekPoints = asArray(market.week_key_points).map((item) => String(item)).filter(Boolean);
  const indices = asArray(market.top_sectors);
  const whatChanged = todayPoints[0] || String(market.today_brief || "-");
  const whyItMatters = todayPoints[1] || String(market.week_brief || "-");
  const whatToWatch = todayPoints[2] || weekPoints[0] || "-";

  return (
    <AppShell title="US Market Overview" subtitle="TM market context + active namespace status">
      <Panel title="Topline">
        <div className="stats-grid">
          <StatCard label="Namespace" value={String(namespace.universe_id || "-")} />
          <StatCard label="Market Signal" value={String(sentiment.label || "-")} tone={changeClass(sentiment.overall)} />
          <StatCard label="Signal Score" value={formatNumber(sentiment.overall)} tone={changeClass(sentiment.overall)} />
          <StatCard label="Generated" value={String(market.generated_at || namespace.updated_at || "-")} />
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="Insight Summary">
          <ul className="list-clean">
            <li>
              <div className="row-head">
                <strong>What changed today</strong>
              </div>
              <small>{whatChanged}</small>
            </li>
            <li>
              <div className="row-head">
                <strong>Why it matters</strong>
              </div>
              <small>{whyItMatters}</small>
            </li>
            <li>
              <div className="row-head">
                <strong>What to watch next</strong>
              </div>
              <small>{whatToWatch}</small>
            </li>
          </ul>
        </Panel>

        <Panel title="Leadership">
          <ul className="list-clean">
            {indices.map((row, idx) => (
              <li key={`${String(row)}-${idx}`}>
                <div className="row-head">
                  <strong>{String(row || "-")}</strong>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Today Drivers">
        <ul className="list-clean">
          {todayPoints.slice(0, 10).map((headline, idx) => (
            <li key={`${headline}-${idx}`}>{headline}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Prior-Week Drivers">
        <ul className="list-clean">
          {weekPoints.slice(0, 10).map((headline, idx) => (
            <li key={`${headline}-${idx}`}>{headline}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Context Briefs">
        <div className="stats-grid">
          <StatCard label="Today" value={String(market.today_brief || "-")} />
          <StatCard label="Week" value={String(market.week_brief || "-")} />
          <StatCard label="Article Count" value={formatNumber(market.article_count)} />
        </div>
      </Panel>

      <JsonDetails label="Raw market wrapper" value={marketRaw} />
    </AppShell>
  );
}
