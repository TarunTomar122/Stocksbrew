import { Newsreader } from "next/font/google";

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-market-editorial",
});

export default function MarketDailyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={newsreader.variable}>{children}</div>;
}
