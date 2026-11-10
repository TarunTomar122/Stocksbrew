import type { Metadata } from "next";

import { OaLanding } from "@/components/oa/oa-landing";
import { HERO_HEADLINE, HERO_SUBHEAD } from "@/lib/brand-copy";
import { ogImage, shareMetadata } from "@/lib/og/url";

export function generateMetadata(): Metadata {
  return {
    alternates: {
      canonical: "/",
      types: { "application/rss+xml": "/feed.xml" },
    },
    // The share card leads with the headline and today's call on a real stock.
    ...shareMetadata({
      title: `stocksbrew: ${HERO_HEADLINE.charAt(0).toLowerCase()}${HERO_HEADLINE.slice(1)}`,
      description: HERO_SUBHEAD,
      path: "/",
      image: ogImage([], `stocksbrew: ${HERO_HEADLINE}`, { daily: true }),
    }),
  };
}

export default function HomePage() {
  return <OaLanding />;
}
