import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getInstrumentBundle } from "@/lib/data";
import { asArray, asRecord, changeClass, formatCurrency, formatDateTime, formatNumber, formatPct } from "@/lib/format";

export default async function InstrumentDetailPage({
  params,
}: {
  params: { instrumentId: string };
}) {
  const instrumentId = decodeURIComponent(params.instrumentId);
  const bundle = await getInstrumentBundle(instrumentId);

  const instrument = asRecord(bundle.instrument);
  const latest = asRecord(bundle.latestPrice);
  const quote = asRecord(latest.quote);
  const fundamentalsDoc = asRecord(bundle.fundamentals);
  const view = asRecord(bundle.instrumentView);
  const stockIntel = asRecord(bundle.stockIntelligence);
  const quality = asRecord(stockIntel.data_quality);
  const comparative = asRecord(stockIntel.comparative_context);
  const viewFundamentals = asRecord(view.fundamentals);
  const latestFundamentals = asRecord(latest.fundamentals);
  const fundamentals = {
    market_cap: fundamentalsDoc.market_cap ?? viewFundamentals.market_cap ?? latestFundamentals.market_cap,
    pe_ttm: fundamentalsDoc.pe_ttm ?? viewFundamentals.pe_ttm ?? latestFundamentals.pe_ttm,
    week_52_low: fundamentalsDoc.week_52_low ?? viewFundamentals.week_52_low ?? latestFundamentals.week_52_low,
    week_52_high: fundamentalsDoc.week_52_high ?? viewFundamentals.week_52_high ?? latestFundamentals.week_52_high,
    dividend_yield: fundamentalsDoc.dividend_yield ?? viewFundamentals.dividend_yield ?? latestFundamentals.dividend_yield,
  };
  const viewSummary = asRecord(view.intelligence_summary);
  const intelSummary = asRecord(stockIntel.summary);
  const summary = {
    headline: viewSummary.headline ?? intelSummary.headline ?? stockIntel.headline,
    body: viewSummary.body ?? intelSummary.body ?? stockIntel.body,
    key_points: asArray(viewSummary.key_points).length
      ? asArray(viewSummary.key_points)
      : asArray(stockIntel.key_points),
  };
  const timelineSource = asArray(view.timeline).length
    ? asArray(view.timeline)
    : asArray(stockIntel.timeline).length
      ? asArray(stockIntel.timeline)
      : [];
  const timeline = timelineSource.slice(0, 12);

  return (
    <AppShell
      title={`${String(instrument.ticker || instrumentId)} • ${String(instrument.name || "")}`}
      subtitle={`Universe ${bundle.activeUniverse}`}
    >
      <Panel title="Price Snapshot">
        <div className="stats-grid">
          <StatCard label="Price" value={formatCurrency(quote.current)} />
          <StatCard
            label="Day Change"
            value={formatPct(quote.day_change_pct)}
            tone={changeClass(quote.day_change_pct)}
          />
          <StatCard label="Volume" value={formatNumber(quote.volume)} />
          <StatCard label="Captured" value={formatDateTime(latest.captured_at)} />
          <StatCard label="Confidence" value={formatNumber(quality.confidence_score)} />
          <StatCard label="Freshness" value={String(quality.freshness_status || "-")} />
          <StatCard label="Vs Market" value={formatPct(comparative.vs_market_day_change_pct)} tone={changeClass(comparative.vs_market_day_change_pct)} />
        </div>
      </Panel>

      <Panel title="Fundamentals">
        <div className="stats-grid">
          <StatCard label="Market Cap" value={formatCurrency(fundamentals.market_cap)} />
          <StatCard label="P/E TTM" value={formatNumber(fundamentals.pe_ttm)} />
          <StatCard label="52W Low" value={formatCurrency(fundamentals.week_52_low)} />
          <StatCard label="52W High" value={formatCurrency(fundamentals.week_52_high)} />
          <StatCard label="Dividend Yield" value={formatPct(fundamentals.dividend_yield)} />
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="AI Intelligence Summary">
          <p><strong>{String(summary.headline || "-")}</strong></p>
          <p>{String(summary.body || "-")}</p>
          <ul className="list-clean">
            {asArray(summary.key_points).slice(0, 8).map((point, idx) => (
              <li key={`${String(point)}-${idx}`}>{String(point)}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recent Timeline">
          <ul className="list-clean">
            {timeline.map((row, idx) => {
              const item = asRecord(row);
              return (
                <li key={`${String(item.timestamp || idx)}-${idx}`}>
                  <div className="row-head">
                    <strong>{String(item.title || "-")}</strong>
                    <span>{String(item.sentiment_label || item.sentiment || "-")}</span>
                  </div>
                  <small>
                    {formatDateTime(item.timestamp || item.published_at)} • {String(item.source_name || item.source || "-")} • {String(item.event_type || "-")} • conf {formatNumber(item.confidence_score)} • impact {formatNumber(item.impact_score)}
                  </small>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <JsonDetails label="Raw instrument doc" value={bundle.instrument} />
      <JsonDetails label="Raw latest price doc" value={bundle.latestPrice} />
      <JsonDetails label="Raw fundamentals doc" value={bundle.fundamentals} />
      <JsonDetails label="Raw tm instrument view" value={bundle.instrumentView} />
      <JsonDetails label="Raw stock intelligence doc" value={bundle.stockIntelligence} />
      <JsonDetails label="Raw price points" value={bundle.pricePoints} />
    </AppShell>
  );
}
