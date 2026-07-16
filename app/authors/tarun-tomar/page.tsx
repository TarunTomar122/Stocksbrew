import type { Metadata } from "next";
import Link from "next/link";

const BASE = "https://www.stocksbrew.online";

export const metadata: Metadata = {
  title: "Tarun Tomar — Author",
  description:
    "Tarun Tomar is the founder and product builder behind stocksbrew, writing about evidence-first stock research and watchlist workflows.",
  alternates: { canonical: "/authors/tarun-tomar" },
  openGraph: {
    title: "Tarun Tomar — stocksbrew author",
    description: "Founder and product builder behind stocksbrew.",
    url: `${BASE}/authors/tarun-tomar`,
  },
};

export default function TarunTomarAuthorPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      "@id": `${BASE}/authors/tarun-tomar#person`,
      name: "Tarun Tomar",
      url: `${BASE}/authors/tarun-tomar`,
      jobTitle: "Founder and product builder",
      worksFor: {
        "@type": "Organization",
        name: "stocksbrew",
        url: BASE,
      },
    },
  };

  return (
    <main className="flex-grow">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <article className="mx-auto flex w-full max-w-[800px] flex-col gap-10 px-6 py-16 md:px-10 md:py-24 lg:px-16">
        <header className="flex flex-col gap-4">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">Author</span>
          <h1 className="text-[42px] font-semibold leading-[1.05] tracking-[-0.04em] text-[#111111] md:text-[54px]">
            Tarun Tomar
          </h1>
          <p className="max-w-[680px] text-[17px] leading-[1.65] text-[#374151]">
            Tarun is the founder and product builder behind stocksbrew. He writes about research systems for individual investors, especially the practical work of filtering news, monitoring a watchlist, preparing for earnings, and documenting why a view changed.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111]">Scope and experience</h2>
          <p className="text-[15px] leading-[1.75] text-[#374151]">
            His first-hand experience comes from building and operating stocksbrew&apos;s data pipelines and product: normalizing market data, grouping company-specific news, presenting earnings context, and designing calls and alerts that show their evidence. He is not presented as a licensed investment adviser, portfolio manager, or broker.
          </p>
          <p className="text-[15px] leading-[1.75] text-[#374151]">
            Articles distinguish primary evidence from interpretation and are written for education and product research. Any decision involving your money remains yours.
          </p>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-6">
          <h2 className="mb-3 text-[18px] font-semibold text-[#111111]">How the work is reviewed</h2>
          <p className="text-[14px] leading-relaxed text-[#6b7280]">
            Product claims are checked against the live app. Material company facts should link to filings or other primary sources. Comparison pages link to competitors&apos; official feature and pricing pages and disclose when conclusions are based on desk research rather than paid hands-on testing.
          </p>
          <Link href="/editorial-policy" className="mt-4 inline-flex text-[13px] font-semibold text-[#111111] underline underline-offset-4">
            Read the editorial policy →
          </Link>
        </section>

        <nav className="flex flex-wrap gap-3">
          <Link href="/blog" className="inline-flex h-10 items-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white">
            Read the blog
          </Link>
          <Link href="/about" className="inline-flex h-10 items-center rounded-full border border-[#e5e7eb] px-5 text-[13px] font-semibold text-[#111111]">
            About stocksbrew
          </Link>
        </nav>
      </article>
    </main>
  );
}
