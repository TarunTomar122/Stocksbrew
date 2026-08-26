import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MarketFeedPageSkeleton } from "@/components/page-stream-skeletons";
import { ThemePageStream } from "@/components/theme-page-stream";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { INVESTMENT_THEMES, getInvestmentTheme } from "@/lib/investment-themes";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return INVESTMENT_THEMES.map((theme) => ({ slug: theme.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const theme = getInvestmentTheme(slug);
  if (!theme) return {};
  return {
    title: `${theme.name} theme`,
    description: theme.description,
    alternates: { canonical: `/themes/${theme.slug}` },
    openGraph: {
      title: `${theme.name} theme · Stocksbrew`,
      description: theme.description,
      url: `https://www.stocksbrew.online/themes/${theme.slug}`,
    },
  };
}

export default async function ThemePage({ params }: Props) {
  const { slug } = await params;
  if (!getInvestmentTheme(slug)) notFound();

  return (
    <main className="oa-landing flex-grow overflow-x-clip">
      <OaSiteHeader />
      <Suspense fallback={<MarketFeedPageSkeleton />}>
        <ThemePageStream slug={slug} />
      </Suspense>
    </main>
  );
}
