import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { AppPage, PageHead } from "@/components/oa/kit";
import { NavIcon } from "@/components/oa/nav-icon";
import { WidgetBuilder } from "@/components/widgets/widget-builder";
import { SITE_URL } from "@/lib/docs/site";
import { DEFAULT_WIDGET_SYMBOL, widgetSize, widgetSymbol } from "@/lib/embed/stock-widget";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["stock", "NVDA"], "NVDA price, today's move and our call, as the widget shows it");
const DESCRIPTION =
  "A free stock widget for your website or blog: price, today's move, a three-month line and our call on any US stock. Paste one snippet, no sign-up.";

export const metadata: Metadata = {
  title: "Free Stock Widget for Your Website or Blog",
  description: DESCRIPTION,
  keywords: ["free stock widget", "stock price widget", "stock ticker widget for website", "embed stock price", "stock widget for blog"],
  alternates: { canonical: "/widgets" },
  openGraph: {
    title: "Free stock widget for your website or blog",
    description: "Price, today's move and our call on any US stock. Paste one snippet.",
    url: `${SITE_URL}/widgets`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /widgets?symbol=TSLA opens the builder on that stock, and &theme=dark&size=wide on those choices. (Those addresses
 * are not indexed: the canonical is /widgets, and crawlers are kept off query strings.)
 */
export default function WidgetsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const symbol = widgetSymbol(first(searchParams?.symbol)) ?? DEFAULT_WIDGET_SYMBOL;
  const theme = first(searchParams?.theme) === "dark" ? "dark" : "light";
  const size = widgetSize(first(searchParams?.size)).id;
  return (
    <AppPage width="wide">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "stocksbrew stock widget",
            description: DESCRIPTION,
            url: `${SITE_URL}/widgets`,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            provider: { "@type": "Organization", name: "stocksbrew", url: SITE_URL },
          },
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Stock widget", path: "/widgets" },
          ]),
        ]}
      />
      <PageHead
        title={
          // Not a place in the nav, so PageHead draws no icon of its own: the Developers icon, which this page sits beside.
          <span className="flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-card text-oa-primary sm:size-9">
              <NavIcon name="api" className="size-[18px] sm:size-5" />
            </span>
            Free stock widget for your site
          </span>
        }
        full
      />
      <WidgetBuilder initialSymbol={symbol} initialTheme={theme} initialSize={size} />
    </AppPage>
  );
}
