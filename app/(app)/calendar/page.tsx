import type { Metadata } from "next";

import { CalendarControls, ListView, MonthView, PeriodNav, WeekView, preReadIsException } from "@/components/calendar/calendar-view";
import { AppPage, Empty, PageHead, Panel, Segmented } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { getSessionUser } from "@/lib/auth-server";
import { loadCalendarRange, loadReportContext } from "@/lib/calendar";
import { bigReportTickers, biggestReports } from "@/lib/calendar-insights";
import {
  CALENDAR_TYPES,
  bucketByDay,
  calendarHref,
  filterItems,
  parseCalendarFilters,
  todayET,
  viewRange,
  type CalendarType,
} from "@/lib/calendar-shared";
import { getTrackedStocks } from "@/lib/watchlist";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "One agenda for US earnings reports, economic releases, IPOs and ex-dividend dates. Week, month and list views; past days show the result and how the stock moved.";

const FAQS = [
  {
    question: "What does the earnings calendar show for a day that has passed?",
    answer:
      "The reported earnings per share next to the estimate, the size of the surprise, and how the stock closed around the report. When the report time was not given, the move covers two sessions and is marked 2d.",
  },
  {
    question: "Where do the dates come from?",
    answer:
      "Earnings dates, IPOs and ex-dividend dates come from Nasdaq's public calendars. Economic releases come from the schedules the Bureau of Labor Statistics, the Bureau of Economic Analysis and the Federal Reserve publish.",
  },
  {
    question: "Why can a stock fall after beating earnings estimates?",
    answer:
      "The reported quarter is one input. Guidance, margins, demand and what was already priced in can matter more than the headline number, which is why the calendar shows the stock's move beside the surprise.",
  },
];

/** Each type of event is its own search (an earnings calendar, an IPO calendar), so each gets its own title and address. */
const TYPE_META: Record<string, { title: string; description: string }> = {
  earnings: {
    title: "Earnings Calendar: US Earnings Reports This Week",
    description:
      "US earnings reports day by day, with the report time and the EPS estimate. Past days show the reported number against the estimate and how the stock moved.",
  },
  economic: {
    title: "Economic Calendar: US Data Releases This Week",
    description: "Scheduled US economic releases day by day, taken from the schedules the agencies publish.",
  },
  ipo: {
    title: "IPO Calendar: Upcoming US IPOs",
    description: "Upcoming US IPOs by expected date, from Nasdaq's public calendar.",
  },
  dividend: {
    title: "Ex-Dividend Calendar: Upcoming Ex-Dividend Dates for US Stocks",
    description: "Ex-dividend dates for US stocks day by day, from Nasdaq's public calendar.",
  },
};

export function generateMetadata({ searchParams }: { searchParams?: SearchParams }): Metadata {
  const raw = searchParams?.type;
  const typeRaw = String((Array.isArray(raw) ? raw[0] : raw) ?? "").toLowerCase();
  const type = CALENDAR_TYPES.find((entry) => entry.id === typeRaw)?.id ?? null;
  const own = type ? TYPE_META[type] : undefined;
  const title = own?.title ?? "Earnings Calendar, Economic Releases and IPOs";
  const description = own?.description ?? DESCRIPTION;
  // Week, month, day and "mine" are views of the same agenda: they keep the address of their type.
  const canonical = own ? `/calendar?type=${type}` : "/calendar";
  const shareImage = ogImage(["page", "calendar"], "This week's earnings, IPOs and economic releases", { daily: true });
  return {
    title,
    description,
    keywords: ["earnings calendar", "US earnings this week", "economic calendar", "IPO calendar", "ex-dividend dates"],
    alternates: { canonical },
    openGraph: { title: `${title} · stocksbrew`, description, url: `https://www.stocksbrew.online${canonical}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CalendarPage({ searchParams }: { searchParams?: SearchParams }) {
  const today = todayET();
  const filters = parseCalendarFilters(searchParams, today);
  const range = viewRange(filters);

  const session = await getSessionUser().catch(() => null);
  const [data, tracked] = await Promise.all([
    loadCalendarRange(range.from, range.to, today),
    session ? getTrackedStocks(session.uid).catch(() => []) : Promise.resolve([] as string[]),
  ]);
  const mine = new Set(tracked.map((id) => id.replace(/^[A-Z]{2}_/, "").toUpperCase()));
  const mineSet = session && mine.size > 0 ? mine : null;
  const effective = { ...filters, mine: filters.mine && mineSet !== null };

  // Chip counts ignore the type filter so each chip says what it would show.
  const scoped = filterItems(data.items, { type: null, mine: effective.mine }, mineSet);
  const counts = Object.fromEntries(
    CALENDAR_TYPES.map((type) => [type.id, scoped.filter((item) => item.kind === type.id).length]),
  ) as Record<CalendarType, number>;
  // The biggest reports still to come carry the move after their last report on their own row (owner rules 7 and 8:
  // no separate cards repeating the stocks listed right below). The loader takes eight names at most.
  const contextTickers = bigReportTickers(scoped, today).slice(0, 8);
  const big =
    data.failed || effective.type === "economic" || effective.type === "ipo" || effective.type === "dividend"
      ? []
      : biggestReports(scoped, today, await loadReportContext(contextTickers, today));
  const lastReports = new Map(big.map((report) => [report.item.id, { pct: report.lastPct, note: report.size }]));
  const days = bucketByDay(
    filterItems(data.items, effective, mineSet).map((item) =>
      item.kind === "earnings" && lastReports.has(item.id) ? { ...item, lastReport: lastReports.get(item.id)! } : item,
    ),
  );

  const markPreRead = preReadIsException(days);

  const tabs = (["week", "month", "list"] as const).map((view) => ({
    id: view,
    label: view === "week" ? "Week" : view === "month" ? "Month" : "List",
    href: calendarHref(effective, today, { view, day: null }),
  }));

  return (
    <AppPage>
      <MarketingSchema
        path="/calendar"
        name="Earnings Calendar, Economic Releases and IPOs"
        description={DESCRIPTION}
        breadcrumbLabel="Calendar"
        faqs={FAQS}
      />
      <PageHead
        title="Calendar"
        inline
        actions={
          <>
            <Segmented items={tabs} current={effective.view} label="Calendar view" />
            <PeriodNav filters={effective} today={today} className="max-lg:hidden" />
          </>
        }
      />
      <CalendarControls filters={effective} today={today} counts={counts} mineAvailable={mineSet !== null} days={days} />

      {data.failed ? (
        <Panel>
          <Empty title="The calendar did not load">
            We could not read the agenda just now, so this is not an empty week. Reload the page in a minute.
          </Empty>
        </Panel>
      ) : (
        <>
          {effective.view === "week" ? <WeekView days={days} filters={effective} today={today} markPreRead={markPreRead} /> : null}
          {effective.view === "month" ? <MonthView days={days} filters={effective} today={today} /> : null}
          {effective.view === "list" ? <ListView days={days} filters={effective} today={today} markPreRead={markPreRead} /> : null}
        </>
      )}

      {/* GATE: our add/hold/trim call per reporting company is not shown here; it belongs to the entitled view once lib/entitlements.ts lands. */}
    </AppPage>
  );
}
