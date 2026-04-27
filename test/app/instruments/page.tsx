import Link from "next/link";

import { AppShell, Panel } from "@/components/ui";
import { listUsInstruments } from "@/lib/data";
import { toText } from "@/lib/format";

export default async function InstrumentsPage() {
  const instruments = await listUsInstruments(250);

  return (
    <AppShell title="US Instruments" subtitle="Universe master list used by TM pipelines">
      <Panel title={`Instruments (${instruments.length})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instrument ID</th>
                <th>Ticker</th>
                <th>Name</th>
                <th>Sector</th>
                <th>Exchange</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <tr key={String(instrument.id)}>
                  <td>
                    <Link href={`/instruments/${encodeURIComponent(String(instrument.id))}`}>
                      {String(instrument.id)}
                    </Link>
                  </td>
                  <td>{toText(instrument.ticker)}</td>
                  <td>{toText(instrument.name)}</td>
                  <td>{toText(instrument.sector)}</td>
                  <td>{toText(instrument.exchange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
