import Link from "next/link";

export const metadata = {
  title: "Blog · Tikrr",
  description: "Posts on building Tikrr, what we're seeing in markets, and the methodology behind our briefs and screens.",
};

export default function BlogPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-[800px] px-6 md:px-10 lg:px-16 py-16 md:py-24 flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Blog
          </span>
          <h1 className="text-[40px] md:text-[52px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.05]">
            Notes from the desk.
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55] max-w-[640px]">
            Posts on building Tikrr, what we're seeing in markets, and the methodology behind our briefs and screens. First post coming soon.
          </p>
        </header>

        <section className="rounded-2xl border border-dashed border-[#e5e7eb] bg-[#f8f9fa] px-6 py-10 flex flex-col items-start gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.1em] uppercase text-[#6b7280]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0052ff]" />
            Coming soon
          </span>
          <h2 className="text-[20px] font-semibold text-[#111111] tracking-[-0.01em]">
            We're writing the first few pieces.
          </h2>
          <p className="text-[14px] text-[#6b7280] leading-[1.55] max-w-[560px]">
            In the meantime, check out our <Link href="/learn" className="text-[#0052ff] font-medium underline">Learn to Invest</Link> section — 50 free guides for beginners and intermediate investors.
          </p>
          <a
            href="mailto:hello@tikrr.com?subject=Blog%20updates"
            className="mt-2 inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            Notify me
          </a>
        </section>
      </div>
    </main>
  );
}
