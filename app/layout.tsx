import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getSearchIndex } from "@/lib/search";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { Providers } from "./providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "tikrr — Market Intelligence",
  description: "Real-time precision analytics for your global portfolio.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const searchIndex = await getSearchIndex(market).catch(() => []);
  const trackedIds: string[] = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];
  const isSubscribed = resolveIsSubscribed(userDoc);
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
      </head>
      <body className="bg-background font-body text-on-background antialiased min-h-screen flex flex-col">
        <Providers>
          <Header
            searchIndex={searchIndex}
            market={market}
            trackedIds={trackedIds}
            isSubscribed={isSubscribed}
          />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
