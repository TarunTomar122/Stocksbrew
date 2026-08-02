import type { Metadata } from "next";
import { Suspense } from "react";
import { cache } from "react";
import { cookies } from "next/headers";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  MEDIUM_DESCRIPTION,
  SITE_TITLE_DEFAULT,
} from "@/lib/brand-copy";
import { Providers } from "./providers";
import "./globals.css";

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
      contactPoint: {
        "@type": "ContactPoint",
        email: "tomartarun2001@gmail.com",
        contactType: "customer support",
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
        "Stock calls and target context",
        "Radar tracking and alerts",
        "Current structured stock context for AI agents",
        "Read-only stock intelligence API",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};
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
  title: {
    default: SITE_TITLE_DEFAULT,
    template: "%s · stocksbrew",
  },
  description: MEDIUM_DESCRIPTION,
  keywords: [
    "stock calls",
    "buy hold sell guidance",
    "risk flags",
    "investment opportunities",
    "watchlist radar",
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
  alternates: {
    canonical: "/",
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
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: MEDIUM_DESCRIPTION,
    creator: "@stocksbrew",
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

async function HeaderData() {
  const { market, trackedIds, isSubscribed } = await getLayoutUserData();
  return (
    <Header
      market={market}
      trackedIds={trackedIds}
      isSubscribed={isSubscribed}
    />
  );
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-[65] w-full border-b border-outline-variant bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-4 px-6 md:px-10 lg:px-16">
        <a
          href="/"
          className="shrink-0 font-display text-[17px] font-extrabold leading-none tracking-tight text-landing-brand"
        >
          stocksbrew
        </a>
        <div className="hidden items-center gap-1 md:flex" aria-hidden="true">
          <div className="h-8 w-16 rounded-full bg-surface-container" />
          <div className="h-8 w-14 rounded-full bg-surface-container" />
        </div>
        <div className="hidden min-w-0 flex-1 md:block" aria-hidden="true">
          <div className="h-10 w-full rounded-full bg-surface-container-low" />
        </div>
        <div className="ml-auto flex items-center gap-3" aria-hidden="true">
          <div className="hidden h-9 w-9 rounded-full border border-outline-variant bg-surface-container sm:block" />
          <div className="h-9 w-9 rounded-full bg-surface-container-high" />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hasSessionCookie = Boolean(cookies().get(SESSION_COOKIE_NAME)?.value);
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta property="og:image" content="https://www.stocksbrew.online/api/og" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="stocksbrew — clear buy, hold, and sell calls on US stocks" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://www.stocksbrew.online/api/og" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,800,900&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('sb-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
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
          <Suspense fallback={<HeaderFallback />}>
            <HeaderData />
          </Suspense>
          <div className="flex min-h-0 w-full flex-1 flex-col px-0 md:px-8 lg:px-12 xl:px-32">
            {children}
          </div>
          <Footer />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
