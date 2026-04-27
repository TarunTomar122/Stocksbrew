import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { ReactNode } from "react";

import "@/app/globals.css";

const uiFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

export const metadata = {
  title: "Tikrr Test Frontend",
  description: "US market explorer",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${uiFont.variable} ${bodyFont.variable}`}>
      <body style={{ fontFamily: "var(--font-body)" }}>{children}</body>
    </html>
  );
}
