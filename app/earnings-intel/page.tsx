import type { Metadata } from "next";
import { AnimatedIcon } from "@/components/animated-icon";
import type { ReactNode } from "react";
import { EarningsIntelList } from "@/components/earnings-intel-list";
import { getCurrentMarket } from "@/lib/market";
import { listAllEarningsIntelDocs } from "@/lib/earnings-intel";
import { getStockSummary } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings Reports: What Changed & What to Do Next",
  description:
    "Free post-earnings reports that explain what changed in revenue, margins, guidance, and the stock's setup — plus what to watch next.",
  alternates: { canonical: "/earnings-intel" },
  openGraph: {
    title: "Earnings Reports: What Changed & What to Do Next · stocksbrew",
    description:
      "Free post-earnings reports that explain what changed in revenue, margins, guidance, and the stock's setup — plus what to watch next.",
    url: "https://www.stocksbrew.online/earnings-intel",
  },
  twitter: {
    card: "summary_large_image",
    title: "Earnings Reports: What Changed & What to Do Next · stocksbrew",
    description:
      "Free post-earnings reports that explain what changed in revenue, margins, guidance, and the stock's setup — plus what to watch next.",
  },
};

const VALUE_PROPS = [
  {
    icon: "receipt_long",
    title: "What happened",
    body: "Earnings print, guidance, and price reaction in one place.",
  },
  {
    icon: "lightbulb",
    title: "So what",
    body: "Plain-English read on what changed and what the market is pricing.",
  },
  {
    icon: "alt_route",
    title: "What to do",
    body: "Bull / base / bear scenarios plus holder vs watcher guidance.",
  },
] as const;

function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex-grow overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-0 py-6 sm:gap-10 sm:px-10 sm:py-10 md:px-14 lg:px-16">
        {children}
      </div>
    </main>
  );
}

export default async function EarningsIntelPage() {
  const market = getCurrentMarket();
  const docs = await listAllEarningsIntelDocs().catch(() => []);

  const stockPairs = await Promise.all(
    docs.map(async (doc) => {
      const stock = await getStockSummary(doc.ticker, doc.market ?? market).catch(() => null);
      return [doc.ticker, stock] as const;
    }),
  );
  const stockByTicker = Object.fromEntries(stockPairs) as Record<
    string,
    Awaited<ReturnType<typeof getStockSummary>>
  >;

  return (
    <PageShell>
      <header className="px-4 sm:px-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#6b38d4]">Free</span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#111111] sm:text-4xl">
          Earnings Intel
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#6b7280] sm:text-lg">
          Post-earnings reports for every name we&apos;ve published. What happened, so what, and what
          to do next. No sign-in required.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {VALUE_PROPS.map(({ icon, title, body }) => (
            <div
              key={title}
              className="flex gap-3 rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#111111] ring-1 ring-[#e5e7eb]">
                <AnimatedIcon name={icon} size={20} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111111]">{title}</p>
                <p className="mt-1 text-sm leading-snug text-[#6b7280]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </header>

      <EarningsIntelList docs={docs} stockByTicker={stockByTicker} market={market} />
    </PageShell>
  );
}
