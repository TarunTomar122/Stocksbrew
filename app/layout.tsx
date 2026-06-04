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
import { LaunchBanner } from "@/components/launch-banner";
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
      logo: "https://www.stocksbrew.online/hero.png",
      sameAs: ["https://www.stocksbrew.online"],
      contactPoint: {
        "@type": "ContactPoint",
        email: "tomartarun2001@gmail.com",
        contactType: "customer support",
      },
    },
    {
      "@type": "WebApplication",
      "@id": "https://www.stocksbrew.online/#webapp",
      name: "stocksbrew",
      url: "https://www.stocksbrew.online",
      description: MEDIUM_DESCRIPTION,
      applicationCategory: "FinanceApplication",
      operatingSystem: "All",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
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
  ],
  authors: [{ name: "stocksbrew" }],
  creator: "stocksbrew",
  publisher: "stocksbrew",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "stocksbrew",
    title: SITE_TITLE_DEFAULT,
    description: MEDIUM_DESCRIPTION,
    url: "https://www.stocksbrew.online",
    locale: "en_US",
    images: [
      {
        url: "/hero.png",
        width: 1200,
        height: 630,
        alt: SITE_TITLE_DEFAULT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: MEDIUM_DESCRIPTION,
    images: ["/hero.png"],
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
};

async function SubscriptionBannerGate() {
  const { isSubscribed } = await getLayoutUserData();
  return isSubscribed ? null : <LaunchBanner />;
}

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
    <header className="sticky top-0 z-[65] w-full border-b border-[#e5e7eb] bg-white">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between gap-2 px-6 md:px-10 lg:px-16">
        <a
          href="/"
          className="flex shrink-0 items-center gap-2 text-[20px] font-semibold leading-none tracking-[-0.04em] text-[#111111]"
        >
          stocksbrew
        </a>
        <div className="hidden items-center gap-1 md:flex" aria-hidden="true">
          <div className="h-9 w-24 rounded-full bg-[#f3f4f6]" />
          <div className="h-9 w-20 rounded-full bg-[#f3f4f6]" />
          <div className="h-9 w-16 rounded-full bg-[#f3f4f6]" />
        </div>
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="hidden h-10 w-56 rounded-lg bg-[#f3f4f6] sm:block" />
          <div className="h-9 w-24 rounded-full bg-[#f3f4f6]" />
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
          <Suspense fallback={null}>
            <SubscriptionBannerGate />
          </Suspense>
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
