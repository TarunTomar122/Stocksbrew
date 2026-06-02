import { PreEarningsEventCard } from "@/components/pre-earnings-event-card";
import { ProLockOverlay } from "@/components/pro-lock-overlay";
import { groupUpcomingByReportDate } from "@/lib/market-events-shared";
import type { PreEarningsCardQuote, PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";

type Props = {
  upcoming: PreEarningsIntelDoc[];
  namesByTicker?: Map<string, string>;
  quoteByInstrumentId?: Map<string, PreEarningsCardQuote>;
  isSubscribed: boolean;
};

export function UpcomingEarningsView({
  upcoming,
  namesByTicker,
  quoteByInstrumentId,
  isSubscribed,
}: Props) {
  const upcomingSections = groupUpcomingByReportDate(
    upcoming.map((doc) => ({
      id: doc.doc_id,
      kind: "earnings",
      scope: "upcoming",
      market: doc.market,
      ticker: doc.ticker,
      instrument_id: doc.instrument_id,
      name: namesByTicker?.get(doc.ticker.toUpperCase()) ?? "",
      sector: "",
      logo_url: null,
      title: doc.report?.headline ?? "",
      body: doc.report?.summary ?? "",
      direction: "neutral",
      urgency: doc.report?.confidence?.score_0_100 ?? 0,
      evidence: [],
      event_date: doc.event_date,
    })),
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[40px]">
          Upcoming earnings
        </h1>
        <p className="max-w-[720px] text-[16px] leading-[1.6] text-[#374151] md:text-[18px]">
          AI pre-earnings setups for stocks reporting in the next 7 days.
          Each card shows what we expect on EPS and how the stock may trade after the print.
        </p>
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#e5e7eb] bg-[#fafafa] p-10 text-center">
          <p className="text-[13px] text-[#6b7280] italic">
            No upcoming setups right now. Check back as more companies enter the reporting window.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            className={`flex flex-col gap-10 ${!isSubscribed ? "max-h-[520px] overflow-hidden rounded-[20px]" : ""}`}
          >
            <p className="text-[13px] text-[#6b7280]">
              Pre-earnings research · next 7 days
            </p>
            {upcomingSections.map((section) => (
              <section key={`upcoming-${section.dateKey}`} className="flex flex-col gap-4">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#b45309]">
                    {section.label}
                  </h2>
                  {section.dateKey !== "unknown" ? (
                    <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
                      {section.dateKey}
                    </span>
                  ) : null}
                  <span className="text-[12px] text-[#9ca3af]">
                    · {section.events.length} setup
                    {section.events.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                  {section.events.map((event) => {
                    const doc = upcoming.find(
                      (row) => row.ticker === event.ticker && row.event_date === event.event_date,
                    );
                    if (!doc) return null;
                    return (
                      <PreEarningsEventCard
                        key={doc.doc_id}
                        doc={doc}
                        name={namesByTicker?.get(doc.ticker.toUpperCase())}
                        quote={quoteByInstrumentId?.get(doc.instrument_id)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {!isSubscribed ? (
            <ProLockOverlay
              title="Upcoming earnings intel is Pro"
              description="Unlock AI setups before the print: expected EPS, likely stock move, and what to do."
            />
          ) : null}
        </div>
      )}

      <p className="text-[11px] text-[#9ca3af]">Not investment advice.</p>
    </div>
  );
}
