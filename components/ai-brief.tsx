import type { HeroBrief } from "@/lib/types";

type Props = {
  brief: HeroBrief | null;
  mocked?: boolean;
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function AiBrief({ brief, mocked }: Props) {
  const data: HeroBrief =
    brief ?? {
      title: "Market Intelligence Briefing",
      body: "No brief available right now. Once the pipeline runs, a synthesized market summary will appear here with verified sources and a live update timestamp.",
      verified_source_count: 0,
      updated_at: new Date().toISOString(),
    };

  return (
    <div className="bg-surface-container-lowest brutalist-border p-6 flex flex-col h-full relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-primary animate-pulse"
            aria-hidden="true"
          />
          <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase text-outline">
            AI Brief
          </h3>
        </div>
        {mocked && (
          <span
            title="Mocked - tm_views_dashboard doc not available."
            className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
          >
            Mock
          </span>
        )}
      </div>

      <h2 className="text-[26px] font-bold tracking-tight text-on-surface leading-tight mb-4 relative">
        {data.title}
      </h2>

      <p className="text-[16px] leading-relaxed text-on-surface-variant flex-1 relative whitespace-pre-line">
        {data.body}
      </p>

      <div className="mt-4 pt-4 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-bold tracking-[0.15em] uppercase text-outline relative">
        <span>{data.verified_source_count} verified sources</span>
        <span>Updated {formatRelative(data.updated_at)}</span>
      </div>
    </div>
  );
}
