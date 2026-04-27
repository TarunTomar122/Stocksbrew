import Link from "next/link";

import { AppShell, Panel } from "@/components/ui";
import { searchUsData } from "@/lib/data";
import { asRecord, formatPct } from "@/lib/format";

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const q = String(searchParams?.q || "").trim();
  const result = await searchUsData(q);

  return (
    <AppShell title="Search US Market Data" subtitle="Search across stocks, instruments, and sectors">
      <Panel title={`Query: ${q || "(empty)"}`}>
        <p>
          Matches: {result.stocks.length} stocks, {result.instruments.length} instruments, {result.sectors.length} sectors
        </p>
      </Panel>

      <div className="grid-2">
        <Panel title="Stocks">
          <ul className="list-clean">
            {result.stocks.slice(0, 80).map((row) => {
              const price = asRecord(row.price);
              return (
                <li key={String(row.id)}>
                  <div className="row-head">
                    <Link href={`/stocks/${encodeURIComponent(String(row.id))}`}>{String(row.symbol || row.id)}</Link>
                    <span>{formatPct(price.changePct)}</span>
                  </div>
                  <small>{String(row.name || "-")}</small>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Instruments">
          <ul className="list-clean">
            {result.instruments.slice(0, 80).map((row) => (
              <li key={String(row.id)}>
                <div className="row-head">
                  <Link href={`/instruments/${encodeURIComponent(String(row.id))}`}>{String(row.ticker || row.id)}</Link>
                  <span>{String(row.exchange || "-")}</span>
                </div>
                <small>{String(row.name || "-")}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Sectors">
        <ul className="list-clean">
          {result.sectors.slice(0, 80).map((row) => (
            <li key={String(row.id)}>
              <div className="row-head">
                <Link href={`/sectors/${encodeURIComponent(String(row.id))}`}>{String(row.id)}</Link>
                <span>{String(asRecord(row.sentiment).label || "-")}</span>
              </div>
              <small>{String(row.name || "US Sector")}</small>
            </li>
          ))}
        </ul>
      </Panel>
    </AppShell>
  );
}
