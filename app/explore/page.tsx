import type { Metadata } from "next";

import { PublicHomePage } from "@/components/public-home-page";

export const metadata: Metadata = {
  title: "Explore StocksBrew",
  description:
    "Explore StocksBrew stock calls, market context, Radar tracking, and public investing tools.",
  alternates: { canonical: "/explore" },
};

export default function ExplorePage() {
  return <PublicHomePage />;
}
