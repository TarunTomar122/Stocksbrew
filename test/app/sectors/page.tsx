import Link from "next/link";

import { AppShell, Panel } from "@/components/ui";
import { listUsSectors } from "@/lib/data";
import { asArray, asRecord, changeClass, formatDateTime, formatNumber } from "@/lib/format";

export default async function SectorsPage() {
  const sectors = await listUsSectors();

  return (
    <AppShell title="US Sectors" subtitle="Sector intelligence and key drivers">
      <Panel title={`Sectors (${sectors.length})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sector</th>
                <th>Sentiment</th>
                <th>Score</th>
                <th>Coverage</th>
                <th>Top Driver</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((sector) => {
                const sentiment = asRecord(sector.sentiment);
                const raw = asRecord(sector.raw);
                const topDriver = String(asArray(raw.today_key_points)[0] || raw.today_brief || "-");
                return (
                  <tr key={String(sector.id)}>
                    <td>
                      <Link href={`/sectors/${encodeURIComponent(String(sector.id))}`}>{String(sector.name || sector.id)}</Link>
                    </td>
                    <td className={changeClass(sentiment.overall)}>{String(sentiment.label || "-")}</td>
                    <td className={changeClass(sentiment.overall)}>{formatNumber(sentiment.overall)}</td>
                    <td>{formatNumber(raw.article_count)}</td>
                    <td>{topDriver}</td>
                    <td>{formatDateTime(sector.lastUpdated)}</td>
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
