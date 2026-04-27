import { AppShell, JsonDetails, Panel, StatCard } from "@/components/ui";
import { getSectorDoc } from "@/lib/data";
import { asArray, asRecord, changeClass, formatDateTime, formatNumber } from "@/lib/format";

export default async function SectorDetailPage({
  params,
}: {
  params: { sectorId: string };
}) {
  const sectorId = decodeURIComponent(params.sectorId);
  const sectorRaw = await getSectorDoc(sectorId);

  const sector = asRecord(sectorRaw);
  const sentiment = asRecord(sector.sentiment);
  const raw = asRecord(sector.raw);
  const todayPoints = asArray(raw.today_key_points).map((item) => String(item)).filter(Boolean);
  const weekPoints = asArray(raw.week_key_points).map((item) => String(item)).filter(Boolean);
  const whatChanged = todayPoints[0] || String(raw.today_brief || "-");
  const whyItMatters = todayPoints[1] || String(raw.week_brief || "-");
  const whatToWatch = todayPoints[2] || weekPoints[0] || "-";

  return (
    <AppShell title={`Sector: ${String(sector.name || sectorId)}`} subtitle={sectorId}>
      <Panel title="Sector Health">
        <div className="stats-grid">
          <StatCard label="Signal" value={String(sentiment.label || "-")} tone={changeClass(sentiment.overall)} />
          <StatCard label="Signal Score" value={formatNumber(sentiment.overall)} tone={changeClass(sentiment.overall)} />
          <StatCard label="Coverage" value={formatNumber(raw.article_count)} />
          <StatCard label="Drivers (Today)" value={formatNumber(todayPoints.length)} />
          <StatCard label="Updated" value={formatDateTime(sector.lastUpdated)} />
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

        <Panel title="Today Drivers">
          <ul className="list-clean">
            {todayPoints.slice(0, 10).map((driver, idx) => (
              <li key={`${driver}-${idx}`}>{driver}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Prior-Week Drivers">
          <ul className="list-clean">
            {weekPoints.slice(0, 10).map((point, idx) => (
              <li key={`${point}-${idx}`}>{point}</li>
            ))}
          </ul>
      </Panel>

      <Panel title="Context Briefs">
        <p><strong>Today</strong>: {String(raw.today_brief || "-")}</p>
        <p><strong>Week</strong>: {String(raw.week_brief || "-")}</p>
        <p><strong>Articles</strong>: {formatNumber(raw.article_count)}</p>
      </Panel>

      <JsonDetails label="Raw sector doc" value={sectorRaw} />
    </AppShell>
  );
}
