import Link from "next/link";

import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getUsContext, listUsInstruments, listUsSectors, listUsStocks } from "@/lib/data";
import { asArray, asRecord, changeClass, formatCurrency, formatPct, formatNumber, formatDateTime, toText } from "@/lib/format";

function regimeFromScore(score: number): { label: string; note: string } {
  if (score >= 70) return { label: "risk-on", note: "Momentum and participation are supportive." };
  if (score >= 55) return { label: "constructive", note: "Bias is positive but selective." };
  if (score >= 45) return { label: "mixed", note: "Cross-currents dominate and conviction is uneven." };
  if (score >= 30) return { label: "cautious", note: "Risk appetite is fading and leadership is narrow." };
  return { label: "risk-off", note: "Defensive positioning dominates." };
}

export default async function HomePage() {
  const [ctx, stocks, sectors, instruments] = await Promise.all([
    getUsContext(),
    listUsStocks(80),
    listUsSectors(),
    listUsInstruments(25),
  ]);

  const tmView = asRecord(ctx.tmViewsDashboardUs);
  const marketDoc = asRecord(ctx.marketsUs);
  const sentiment = asRecord(tmView.market_sentiment);
  const sentimentScore = Number(sentiment.overall || marketDoc.today_score || 0);
  const regime = regimeFromScore(sentimentScore);
  const indices = asArray(tmView.macro_cards);
  const gainers = asArray(tmView.gainers).slice(0, 5);
  const losers = asArray(tmView.losers).slice(0, 5);
  const watchlistRows = asArray(tmView.watchlist_rows).slice(0, 8);
  const fallbackGainers = [...stocks]
    .sort((a, b) => Number(asRecord(b.price).changePct || 0) - Number(asRecord(a.price).changePct || 0))
    .slice(0, 5);
  const fallbackLosers = [...stocks]
    .sort((a, b) => Number(asRecord(a.price).changePct || 0) - Number(asRecord(b.price).changePct || 0))
    .slice(0, 5);
  const fallbackWatchlist = stocks.slice(0, 8).map((stock) => ({
    ticker: stock.ticker,
    name: stock.name,
    price: asRecord(stock.price).current,
    day_change_pct: asRecord(stock.price).changePct,
    ai_sentiment_score: asRecord(stock.sentiment).overall,
    news_count: asArray(stock.timeline).length,
    instrument_id: stock.id,
  }));
  const watchRows = watchlistRows.length ? watchlistRows : fallbackWatchlist;

  const sectorRows = sectors.map((sector) => {
    const sentimentRow = asRecord(sector.sentiment);
    const raw = asRecord(sector.raw);
    return {
      id: String(sector.id),
      name: String(sector.name || sector.id),
      score: Number(sentimentRow.overall || 0),
      label: String(sentimentRow.label || "-"),
      coverage: Number(raw.article_count || 0),
      driver: String(asArray(raw.today_key_points)[0] || raw.today_brief || "-"),
    };
  });
  const sectorLeaders = [...sectorRows].sort((a, b) => b.score - a.score).slice(0, 3);
  const leaderIds = new Set(sectorLeaders.map((row) => row.id));
  const sectorLaggards = [...sectorRows]
    .sort((a, b) => a.score - b.score)
    .filter((row) => !leaderIds.has(row.id))
    .slice(0, 3);

  const eventStats = new Map<string, { count: number; impactSum: number; maxImpact: number }>();
  const stockSignalRows = stocks.map((stock) => {
    const events = asArray(stock.timeline);
    const latest = asRecord(events[0]);
    const quality = asRecord(stock.dataQuality);
    const comparative = asRecord(stock.comparativeContext);
    const visualCards = asRecord(stock.visualCards);
    const visualSummary = asRecord(stock.visualSummary);
    const drivers = asArray(visualCards.drivers);
    const catalystCards = asArray(visualCards.catalyst_cards);
    const riskCards = asArray(visualCards.risk_cards);
    const impact = Number(latest.impact_score || 0);
    const confidence = Number(quality.confidence_score || 0);
    const vsMarket = Number(comparative.vs_market_day_change_pct || 0);
    const freshness = String(quality.freshness_status || "unknown");
    const type = String(latest.event_type || "other");
    const riskScore = Math.max(0, (50 - confidence) + (freshness === "stale" ? 15 : freshness === "aging" ? 8 : 0) + (vsMarket < 0 ? Math.abs(vsMarket) : 0));

    for (const event of events) {
      const row = asRecord(event);
      const eventType = String(row.event_type || "other");
      const eventImpact = Number(row.impact_score || 0);
      const bucket = eventStats.get(eventType) || { count: 0, impactSum: 0, maxImpact: 0 };
      bucket.count += 1;
      bucket.impactSum += eventImpact;
      bucket.maxImpact = Math.max(bucket.maxImpact, eventImpact);
      eventStats.set(eventType, bucket);
    }

    return {
      id: String(stock.id),
      symbol: String(stock.symbol || stock.id),
      headline: toText(stock.headline, toText(latest.title, "-")),
      whatChanged: toText(visualSummary.what_changed, "-"),
      whatToWatch: toText(visualSummary.what_to_watch, "-"),
      topDriver: toText(asRecord(drivers[0]).label, "-"),
      topCatalyst: toText(asRecord(catalystCards[0]).event, "-"),
      topRisk: toText(asRecord(riskCards[0]).risk, "-"),
      eventType: type,
      impact,
      confidence,
      freshness,
      vsMarket,
      riskScore,
    };
  });

  const signalTape = [...eventStats.entries()]
    .map(([eventType, row]) => ({
      eventType,
      count: row.count,
      avgImpact: row.count ? row.impactSum / row.count : 0,
      maxImpact: row.maxImpact,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const catalystBoard = [...stockSignalRows].sort((a, b) => b.impact - a.impact).slice(0, 6);
  const riskBoard = [...stockSignalRows].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6);

  return (
    <AppShell
      title="US Market Dashboard"
      subtitle={`Live snapshot from Firestore • universe ${ctx.activeUniverse}`}
    >
      <Panel title="Market Snapshot">
        <div className="stats-grid">
          <StatCard label="Regime" value={regime.label} tone={changeClass(sentimentScore)} />
          <StatCard label="Signal Score" value={formatNumber(sentimentScore)} tone={changeClass(sentimentScore)} />
          <StatCard label="Tracked Stocks" value={formatNumber(ctx.counts.tm_stock_intelligence)} />
          <StatCard label="Tracked Instruments" value={formatNumber(ctx.counts.tm_instruments_us)} />
        </div>
        <p>{toText(marketDoc.today_brief, regime.note)}</p>
      </Panel>

      <div className="grid-2">
        <Panel title="Sector Rotation">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sector</th>
                  <th>Score</th>
                  <th>Coverage</th>
                  <th>Top Driver</th>
                </tr>
              </thead>
              <tbody>
                {sectorRows.map((row) => (
                  <tr key={row.id}>
                    <td><Link href={`/sectors/${encodeURIComponent(row.id)}`}>{row.name}</Link></td>
                    <td className={changeClass(row.score)}>{formatNumber(row.score)}</td>
                    <td>{formatNumber(row.coverage)}</td>
                    <td>{row.driver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Signal Tape">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Count</th>
                  <th>Avg Impact</th>
                  <th>Max Impact</th>
                </tr>
              </thead>
              <tbody>
                {signalTape.map((row) => (
                  <tr key={row.eventType}>
                    <td>{row.eventType}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td>{formatNumber(row.avgImpact)}</td>
                    <td>{formatNumber(row.maxImpact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Major Indices">
          <ul className="list-clean">
            {indices.map((row, idx) => {
              const item = asRecord(row);
              return (
                <li key={`${String(item.name || "index")}-${idx}`}>
                  <div className="row-head">
                    <strong>{String(item.label || item.name || "-")}</strong>
                    <span className={changeClass(item.day_change_pct || item.changePct)}>{formatPct(item.day_change_pct || item.changePct)}</span>
                  </div>
                  <p>{formatNumber(item.value)}</p>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Top Movers">
          <div className="grid-2">
            <div>
              <h3>Gainers</h3>
              <ul className="list-clean">
                {(gainers.length ? gainers : fallbackGainers).map((row, idx) => {
                  const item = asRecord(row);
                  const symbol = String(item.ticker || item.symbol || item.id || "-");
                  return (
                    <li key={`${symbol}-${idx}`}>
                      <div className="row-head">
                        <Link href={`/stocks/${encodeURIComponent(symbol)}`}>{symbol}</Link>
                        <span className="tone-positive">{formatPct(item.day_change_pct || asRecord(item.price).changePct || item.changePct)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Losers</h3>
              <ul className="list-clean">
                {(losers.length ? losers : fallbackLosers).map((row, idx) => {
                  const item = asRecord(row);
                  const symbol = String(item.ticker || item.symbol || item.id || "-");
                  return (
                    <li key={`${symbol}-${idx}`}>
                      <div className="row-head">
                        <Link href={`/stocks/${encodeURIComponent(symbol)}`}>{symbol}</Link>
                        <span className="tone-negative">{formatPct(item.day_change_pct || asRecord(item.price).changePct || item.changePct)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Catalyst Board">
          <ul className="list-clean">
            {catalystBoard.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <Link href={`/stocks/${encodeURIComponent(row.id)}`}>{row.symbol}</Link>
                  <span>{row.eventType} • impact {formatNumber(row.impact)}</span>
                </div>
                <small>{row.headline}</small>
                <small>{row.topCatalyst !== "-" ? `Catalyst: ${row.topCatalyst}` : row.whatToWatch}</small>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Risk Board">
          <ul className="list-clean">
            {riskBoard.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <Link href={`/stocks/${encodeURIComponent(row.id)}`}>{row.symbol}</Link>
                  <span>risk {formatNumber(row.riskScore)}</span>
                </div>
                <small>confidence {formatNumber(row.confidence)} • freshness {row.freshness} • vs mkt {formatPct(row.vsMarket)}</small>
                <small>{row.topRisk !== "-" ? `Risk: ${row.topRisk}` : row.whatChanged}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Watchlist Pulse">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Price</th>
                <th>Day</th>
                <th>Sentiment</th>
                <th>News</th>
              </tr>
            </thead>
            <tbody>
              {watchRows.map((row, idx) => {
                const item = asRecord(row);
                const ticker = String(item.ticker || "-");
                const id = String(item.instrument_id || `row-${idx}`);
                return (
                  <tr key={id}>
                    <td><Link href={`/stocks/${encodeURIComponent(ticker)}`}>{ticker}</Link></td>
                    <td>{String(item.name || "-")}</td>
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

      <div className="grid-2">
        <Panel title="Sector Leaders">
          <ul className="list-clean">
            {sectorLeaders.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <Link href={`/sectors/${encodeURIComponent(row.id)}`}>{row.name}</Link>
                  <span className="tone-positive">{formatNumber(row.score)}</span>
                </div>
                <small>{row.driver}</small>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Sector Laggards">
          <ul className="list-clean">
            {sectorLaggards.length ? sectorLaggards.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <Link href={`/sectors/${encodeURIComponent(row.id)}`}>{row.name}</Link>
                  <span className={changeClass(-row.score)}>{formatNumber(row.score)}</span>
                </div>
                <small>{row.driver}</small>
              </li>
            )) : (
              <li>Not enough distinct sectors to show a separate laggards set.</li>
            )}
          </ul>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Stock Coverage (sample)">
          <ul className="list-clean">
            {stocks.slice(0, 10).map((stock) => (
              <li key={String(stock.id)}>
                <div className="row-head">
                  <Link href={`/stocks/${encodeURIComponent(String(stock.id))}`}>{String(stock.symbol || stock.id)}</Link>
                  <span className={changeClass(asRecord(stock.price).changePct)}>{formatPct(asRecord(stock.price).changePct)}</span>
                </div>
                <small>{String(stock.name || "")}</small>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Sector Coverage">
          <ul className="list-clean">
            {sectors.slice(0, 10).map((sector) => (
              <li key={String(sector.id)}>
                <div className="row-head">
                  <Link href={`/sectors/${encodeURIComponent(String(sector.id))}`}>{String(sector.name || sector.id)}</Link>
                  <span className={changeClass(asRecord(sector.sentiment).overall)}>{formatNumber(asRecord(sector.sentiment).overall)}</span>
                </div>
                <small>Updated {formatDateTime(sector.lastUpdated)}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <JsonDetails label="Raw market doc" value={ctx.marketsUs} />
      <JsonDetails label="Raw tm dashboard doc" value={ctx.tmViewsDashboardUs} />
      <JsonDetails label="Raw active universe config" value={ctx.activeUniverseRaw} />
    </AppShell>
  );
}
