import type { Metadata } from "next";
import { Suspense } from "react";
import { cache } from "react";
import { cookies } from "next/headers";
import Script from "next/script";

import { Footer } from "@/components/footer";
import { monoFont, uiFont } from "@/components/oa/font";
import { MarketStatusTab } from "@/components/market-status";
import { getSessionUser } from "@/lib/auth-server";
import { CONTACT_EMAIL } from "@/lib/docs/site";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  CALL_COVERAGE,
  MEDIUM_DESCRIPTION,
  SITE_TITLE_DEFAULT,
} from "@/lib/brand-copy";
import { FREE_COVERED_STOCKS } from "@/lib/paywall-flag";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { US_PRO_MONTHLY, US_PRO_TRIAL_DAYS, US_PRO_YEARLY } from "@/lib/pricing";
import { ogImage } from "@/lib/og/url";
import { Providers } from "./providers";
import "./globals.css";
import "./styles/transitions.css";

const SESSION_COOKIE_NAME = "tikrr_session";
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.stocksbrew.online/#organization",
      name: "stocksbrew",
      url: "https://www.stocksbrew.online",
      description: MEDIUM_DESCRIPTION,
      logo: "https://www.stocksbrew.online/icon.svg",
      email: CONTACT_EMAIL,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        availableLanguage: "en",
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://www.stocksbrew.online/#website",
      name: "stocksbrew",
      url: "https://www.stocksbrew.online",
      description: MEDIUM_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": "https://www.stocksbrew.online/#organization" },
      // /ask takes a typed question in `q`, so it is the site's search address.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://www.stocksbrew.online/ask?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebApplication",
      "@id": "https://www.stocksbrew.online/#webapp",
      name: "stocksbrew",
      url: "https://www.stocksbrew.online",
      isPartOf: { "@id": "https://www.stocksbrew.online/#website" },
      provider: { "@id": "https://www.stocksbrew.online/#organization" },
      description: MEDIUM_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "All",
      featureList: [
        `A dated ${Object.values(CALL_PLAIN).join(" / ")} call with its reasons on ${CALL_COVERAGE}`,
        "A daily briefing on the stocks you follow: what moved, why, and what is coming up",
        "Agents that watch prices, earnings, SEC filings, news, Congress trades and insider trades",
        "Ask: sourced answers about any stock or your portfolio",
        "Financials, valuation, filings, earnings, analyst targets and news for US stocks",
        "API, MCP server and CLI for your own AI agent (Pro)",
      ],
      // Two plans, three prices. A single price of 0 made engines describe the whole product as free.
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "0",
        highPrice: String(US_PRO_YEARLY),
        offerCount: 3,
        offers: [
          {
            "@type": "Offer",
            name: "Free",
            price: "0",
            priceCurrency: "USD",
            url: "https://www.stocksbrew.online/pricing",
            description: `Our call on ${CALL_COVERAGE}, stock reports and filings, free to read. A free account adds the full report on ${FREE_COVERED_STOCKS} stocks you pick.`,
          },
          {
            "@type": "Offer",
            name: "Pro, monthly",
            price: String(US_PRO_MONTHLY),
            priceCurrency: "USD",
            url: "https://www.stocksbrew.online/pricing",
            description: `The full report on every stock you track. ${US_PRO_TRIAL_DAYS}-day free trial at US checkout for a first subscription; a card is required.`,
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: String(US_PRO_MONTHLY),
              priceCurrency: "USD",
              billingDuration: "P1M",
              unitCode: "MON",
            },
          },
          {
            "@type": "Offer",
            name: "Pro, yearly",
            price: String(US_PRO_YEARLY),
            priceCurrency: "USD",
            url: "https://www.stocksbrew.online/pricing",
            description: "Pro billed once a year.",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: String(US_PRO_YEARLY),
              priceCurrency: "USD",
              billingDuration: "P1Y",
              unitCode: "ANN",
            },
          },
        ],
      },
    },
  ],
};
// The default share card: the headline and today's call on a real stock. Pages with their own card replace it.
const DEFAULT_SHARE_IMAGE = ogImage([], "stocksbrew: the investing platform that tells you what to buy and why", { daily: true });

const siteVerification: Metadata["verification"] = {
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : {}),
  other: {
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : {}),
    "directree-verify": "directree-verify=95b766d1987089b3ef6fb7718d74e6d4",
  },
};
export const metadata: Metadata = {
  metadataBase: new URL("https://www.stocksbrew.online"),
  // viewport-fit=cover lets the phone tab bar run under the home indicator
  // (its padding uses env(safe-area-inset-bottom)) instead of leaving a gap.
  viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" },
  title: {
    default: SITE_TITLE_DEFAULT,
    template: "%s · stocksbrew",
  },
  description: MEDIUM_DESCRIPTION,
  keywords: [
    "stock analysis app",
    "AI stock research",
    "US stock analysis",
    "stock watchlist app",
    "stock news alerts",
    "stock financials",
    "Stock Watchlist tracking",
    "stock analysis",
    "AI briefs",
    "portfolio tracking",
    "stock screener",
    "investing",
    "US equities",
    "stock market MCP server",
    "AI agent for stock analysis",
    "structured stock intelligence API",
  ],
  authors: [{ name: "stocksbrew" }],
  creator: "stocksbrew",
  publisher: "stocksbrew",
  formatDetection: { email: false, address: false, telephone: false },
  // No canonical here: a default would make every page that forgets its own
  // point at the home page. Each page sets its own address.
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    siteName: "stocksbrew",
    title: SITE_TITLE_DEFAULT,
    description: MEDIUM_DESCRIPTION,
    url: "https://www.stocksbrew.online",
    locale: "en_US",
    images: [DEFAULT_SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: MEDIUM_DESCRIPTION,
    creator: "@stocksbrew",
    images: [DEFAULT_SHARE_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  ...(siteVerification && (siteVerification.google || siteVerification.other)
    ? { verification: siteVerification }
    : {}),
};

const getLayoutUserData = cache(async () => {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const trackedIds: string[] = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const isSubscribed = resolveIsSubscribed(userDoc);
  return { market, trackedIds, isSubscribed };
});

async function FooterData() {
  const { isSubscribed } = await getLayoutUserData();
  return <Footer isSubscribed={isSubscribed} />;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hasSessionCookie = Boolean(cookies().get(SESSION_COOKIE_NAME)?.value);
  return (
    <html lang="en" className={`${uiFont.variable} ${monoFont.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sb-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          defer
          data-site="39i601nr"
          data-domain="stocksbrew.online"
          src="https://piqo.app/piqo.js"
        />
        {process.env.NODE_ENV === "production" && GA_MEASUREMENT_ID ? (
          <>
            <Script
              id="ga-loader"
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  window.gtag = window.gtag || gtag;
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
                `,
              }}
            />
          </>
        ) : null}
      </head>
      <body className="bg-background font-body text-on-background antialiased min-h-screen flex flex-col">
        <Providers initialAuthed={hasSessionCookie}>
          <div className="oa-shell-frame flex min-h-0 w-full flex-1 flex-col px-0 md:px-8 lg:px-12 xl:px-32">
            {children}
          </div>
          <Suspense fallback={null}>
            <FooterData />
          </Suspense>
        </Providers>
        <div className="oa-market-tab">
          <MarketStatusTab nowIso={new Date().toISOString()} />
        </div>
      </body>
    </html>
  );
}
