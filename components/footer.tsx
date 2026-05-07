import Link from "next/link";

type Column = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

const COLUMNS: Column[] = [
  {
    title: "Product",
    links: [
      { label: "Markets", href: "/" },
      { label: "Heat", href: "/heat" },
      { label: "News", href: "/news" },
      { label: "Radar", href: "/watchlist" },
      { label: "Screens", href: "/screens" },
    ],
  },
  {
    title: "Coverage",
    links: [
      { label: "US stocks", href: "/" },
      { label: "Sectors", href: "/" },
      { label: "Indices & macro", href: "/" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Pricing", href: "/subscribe" },
      { label: "Learn", href: "/learn" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "mailto:hello@tikrr.com", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of service", href: "/legal/terms" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Cookie policy", href: "/legal/cookies" },
      { label: "Disclaimer", href: "/legal/disclaimer" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 bg-[#0b1228] text-white">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          {/* Wordmark + tagline */}
          <div className="col-span-2 flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-1.5 w-fit">
              <span className="text-[20px] font-semibold tracking-[-0.04em] text-white leading-none">
                tikrr
              </span>
            </Link>
            <p className="text-[14px] leading-[1.55] text-white/65 max-w-[280px]">
              Market intelligence for the stocks you actually care about — US markets today, more coming soon.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/85">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                </span>
                Live now
              </span>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h3 className="text-[12px] font-semibold tracking-[0.1em] uppercase text-white/55">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-[14px] text-white/80 hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[14px] text-white/80 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[12px] text-white/55">
            © {year} Tikrr. All rights reserved.
          </p>
          <p className="text-[12px] text-white/45 max-w-[640px]">
            Tikrr provides market data and analytics for informational purposes only. Nothing here is investment advice. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </footer>
  );
}
