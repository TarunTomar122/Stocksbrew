import { PulsePageSkeleton } from "@/components/pulse-hub-skeleton";

export default function PulseLoading() {
  return (
    <main className="pulse-page flex-grow">
      <div className="pulse-shell">
        <PulsePageSkeleton />
      </div>
    </main>
  );
}
