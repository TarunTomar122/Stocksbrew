import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LaunchBanner } from "@/components/launch-banner";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getSearchIndex } from "@/lib/search";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { Providers } from "./providers";
import "./globals.css";

const SESSION_COOKIE_NAME = "tikrr_session";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.tikrr.online/#organization",
      name: "tikrr",
      url: "https://www.tikrr.online",
      description: "Market intelligence platform providing AI-powered stock briefs, market sentiment analysis, heat lists, and thematic screens for US equities.",
      logo: "https://www.tikrr.online/hero.png",
      sameAs: ["https://twitter.com/tikrr"],
      contactPoint: {
        "@type": "ContactPoint",
        email: "hello@tikrr.com",
        contactType: "customer support",
      },
    },
    {
      "@type": "WebApplication",
      "@id": "https://www.tikrr.online/#webapp",
      name: "tikrr",
      url: "https://www.tikrr.online",
      description: "Real-time precision analytics for your global portfolio.",
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
  metadataBase: new URL("https://www.tikrr.online"),
  title: {
    default: "tikrr - Market Intelligence",
    template: "%s · tikrr",
  },
  description: "Real-time precision analytics for your global portfolio. AI-powered stock briefs, market sentiment, heat lists, and thematic screens for US equities.",
  keywords: ["stock market", "market intelligence", "stock analysis", "AI briefs", "market sentiment", "stock screener", "investing", "equities", "technical analysis", "fundamental analysis"],
  authors: [{ name: "tikrr" }],
  creator: "tikrr",
  publisher: "tikrr",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "tikrr",
    title: "tikrr - Market Intelligence",
    description: "Real-time precision analytics for your global portfolio. AI-powered stock briefs, market sentiment, heat lists, and thematic screens.",
    url: "https://www.tikrr.online",
    locale: "en_US",
    images: [
      {
        url: "/hero.png",
        width: 1200,
        height: 630,
        alt: "tikrr - Market Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "tikrr - Market Intelligence",
    description: "Real-time precision analytics for your global portfolio. AI-powered stock briefs, market sentiment, heat lists, and thematic screens.",
    images: ["/hero.png"],
    creator: "@tikrr",
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
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  return isSubscribed ? null : <LaunchBanner />;
}

async function HeaderData() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const searchIndex = await getSearchIndex(market).catch(() => []);
  const trackedIds: string[] = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const isSubscribed = resolveIsSubscribed(userDoc);
  return (
    <Header
      searchIndex={searchIndex}
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
          tikrr
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
