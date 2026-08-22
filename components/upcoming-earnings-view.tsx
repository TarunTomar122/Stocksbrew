import { PreEarningsEventCard } from "@/components/pre-earnings-event-card";
import { UpcomingEarningsPaywall } from "@/components/upcoming-earnings-paywall";
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
        <h1 className="text-[32px] font-medium tracking-[-0.02em] text-[var(--oa-fg)] md:text-[40px]">
          Upcoming earnings
        </h1>
        <p className="max-w-[720px] text-[16px] leading-[1.6] text-[var(--oa-fg)] md:text-[18px]">
          AI pre-earnings setups for stocks reporting in the next 7 days.
          Each card shows what we expect on EPS and how the stock may trade after the print.
        </p>
      </header>

      {upcoming.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--oa-border)] bg-[#fafafa] p-10 text-center">
          <p className="text-[13px] text-[var(--oa-muted-fg)] italic">
            No upcoming setups right now. Check back as more companies enter the reporting window.
          </p>
        </div>
      ) : isSubscribed ? (
        <div className="flex flex-col gap-10">
          <p className="text-[13px] text-[var(--oa-muted-fg)]">Pre-earnings research · next 7 days</p>
          {upcomingSections.map((section) => (
            <section key={`upcoming-${section.dateKey}`} className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[15px] font-medium tracking-[-0.01em] text-[#b45309]">
                  {section.label}
                </h2>
                {section.dateKey !== "unknown" ? (
                  <span className="text-[12px] font-medium tabular-nums text-[var(--oa-muted-fg)]">
                    {section.dateKey}
                  </span>
                ) : null}
                <span className="text-[12px] text-[var(--oa-muted-fg)]">
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
      ) : (
        <UpcomingEarningsPaywall
          setupCount={upcoming.length}
          tickers={[...new Set(upcoming.map((doc) => doc.ticker.toUpperCase()))]}
        />
      )}

      <p className="text-[11px] text-[var(--oa-muted-fg)]">Not investment advice.</p>
    </div>
  );
}
