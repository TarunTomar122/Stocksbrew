import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { VercelAnalytics } from "@/components/vercel-analytics";

import "./globals.css";

export const metadata: Metadata = {
  title: "tikrr — Market Intelligence",
  description: "Real-time precision analytics for your global portfolio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#F9F8F6] font-body text-[#1A1A1A] antialiased">
        {children}
        <VercelAnalytics />
      </body>
    </html>
  );
}
