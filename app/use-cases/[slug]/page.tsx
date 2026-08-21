import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { USE_CASES, getUseCase } from "@/lib/use-cases-data";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) return { title: "Not Found" };
  return {
    title: uc.title,
    description: uc.description,
    alternates: { canonical: `/use-cases/${slug}` },
    openGraph: {
      title: `${uc.title} · stocksbrew`,
      description: uc.description,
      url: `https://www.stocksbrew.online/use-cases/${slug}`,
    },
  };
}

const H2 = "text-[22px] font-medium tracking-tight text-oa-fg";

export default async function UseCasePage({ params }: Props) {
  const { slug } = await params;
  const uc = getUseCase(slug);
  if (!uc) notFound();

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <MarketingSchema
        path={`/use-cases/${slug}`}
        name={uc.title}
        description={uc.description}
        faqs={uc.faqs}
        breadcrumbLabel={uc.title}
        parent={{ name: "Use cases", path: "/use-cases" }}
      />
      <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="flex flex-col gap-4">
          <Link
            href="/use-cases"
            className="group inline-flex w-fit items-center gap-1 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg"
          >
            <span aria-hidden className="transition-transform duration-200 group-hover:-translate-x-0.5">‹</span> All use cases
          </Link>
          <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2.25rem] leading-[1.08] sm:text-[3rem] sm:leading-[1.06]">
            {uc.title}
          </h1>
          <p className="text-lg leading-relaxed text-oa-fg/80">{uc.headline}</p>
          <p className="text-[15px] leading-relaxed text-oa-muted-fg">{uc.pain}</p>
          <Link
            href="/watchlist"
            className="inline-flex h-11 w-fit items-center rounded-full bg-oa-primary px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
          >
            Add stocks to Watchlist
          </Link>
        </header>

        <section className="flex flex-col gap-5" aria-labelledby="uc-workflow">
          <h2 id="uc-workflow" className={H2}>Your workflow</h2>
          <ol className="flex flex-col rounded-[22px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:px-6">
            {uc.steps.map((step, i) => (
              <li key={i} className="flex gap-4 border-b border-oa-border py-4 last:border-b-0">
                <span className="oa-mono shrink-0 pt-0.5 text-xs tabular-nums text-oa-muted-fg">0{i + 1}</span>
                <p className="text-sm leading-relaxed text-oa-fg/80">
                  {step.text}{" "}
                  {step.href && step.linkLabel && (
                    <Link href={step.href} className="font-medium text-oa-primary underline-offset-4 hover:underline">
                      {step.linkLabel}
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="uc-tools">
          <h2 id="uc-tools" className={H2}>Tools for this workflow</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {uc.features.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="group flex flex-col gap-1 rounded-[18px] border border-oa-border bg-oa-bg p-4 transition-colors hover:bg-oa-card"
              >
                <span className="flex items-center gap-1 text-sm font-medium tracking-tight text-oa-fg transition-colors group-hover:text-oa-primary">
                  {f.name}
                  <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">›</span>
                </span>
                <span className="text-[13px] leading-relaxed text-oa-muted-fg">{f.description}</span>
              </Link>
            ))}
          </div>
        </section>

        <FaqSection faqs={uc.faqs} />

        <section className="flex flex-col items-center gap-5 rounded-[22px] border border-oa-border bg-oa-bg px-6 py-12 text-center">
          <h2 className="max-w-[420px] text-balance text-[26px] font-medium leading-tight tracking-tight text-oa-fg">
            Start with 3 stocks free
          </h2>
          <p className="max-w-[440px] text-[15px] leading-relaxed text-oa-muted-fg">
            Match this workflow in your Watchlist. Upgrade to Pro for unlimited names and full alert coverage.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/watchlist"
              className="inline-flex h-11 items-center rounded-full bg-oa-primary px-6 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:bg-[color-mix(in_srgb,var(--oa-primary)_88%,black)] active:translate-y-px active:scale-[0.98]"
            >
              Open Watchlist
            </Link>
            <Link
              href="/subscribe"
              className="inline-flex h-11 items-center rounded-full border border-oa-border bg-oa-card px-6 text-sm font-medium text-oa-fg transition-colors hover:border-oa-fg/30"
            >
              See Pro
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
