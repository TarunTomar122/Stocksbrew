import { EmptyState } from "@/components/empty-state";
import { Instrument } from "@/components/instrument";
import { Shell } from "@/components/shell";
import { getInstrumentView } from "@/lib/firestore-views";

type InstrumentPageProps = {
  params: Promise<{ instrumentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InstrumentPage({ params, searchParams }: InstrumentPageProps) {
  const { instrumentId } = await params;
  const sp = await searchParams;
  const universe = readString(sp?.universe);
  const view = await getInstrumentView(instrumentId, universe);

  return (
    <Shell>
      {view ? (
        <Instrument view={view} />
      ) : (
        <EmptyState
          title="No instrument view yet"
          body="No materialized Firestore instrument view exists for this stock yet. Run the backend materialization scripts, then reload."
        />
      )}
    </Shell>
  );
}
