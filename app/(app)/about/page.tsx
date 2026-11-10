import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { ReadPage } from "@/components/docs/read-page";
import { FOCUS } from "@/components/oa/kit";
import { ABOUT_BLOCKS } from "@/lib/docs/company";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "about"], "About stocksbrew");

export const metadata: Metadata = {
  title: "About stocksbrew: why we built it",
  description: "Why stocksbrew exists, what it refuses to do, who is behind it and how it pays for itself. A small independent product for people who follow US stocks.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About stocksbrew",
    description: "Why it exists, what it will not do, and who is behind it.",
    url: `${SITE_URL}/about`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: "About stocksbrew", description: "Why it exists, what it will not do, and who is behind it.", images: [SHARE_IMAGE] },
};

const NEXT = [
  { href: "/docs/start/what-stocksbrew-is", title: "What stocksbrew is and is not", text: "The product in one page." },
  { href: "/security", title: "Security", text: "How accounts, data and money are handled." },
  { href: "/docs/methodology/data-sources", title: "Where the data comes from", text: "Every source and how to tell how old the data is." },
  { href: "/blog", title: "Blog", text: "Longer pieces on analysing stocks." },
];

export default function AboutPage() {
  return (
    <ReadPage
      label="About"
      title="Why we built it"
      lede="A research tool for people who follow US stocks and make their own decisions. It reads so you do not have to reopen the same tabs every day."
      blocks={ABOUT_BLOCKS}
      contents={false}
      before={
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "AboutPage",
              name: "About stocksbrew",
              url: `${SITE_URL}/about`,
              mainEntity: {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: "stocksbrew",
                url: SITE_URL,
                founder: { "@type": "Person", name: "Tarun Tomar", url: `${SITE_URL}/docs/methodology/who-writes-this` },
              },
            },
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: "About", path: "/about" },
            ]),
          ]}
        />
      }
      after={
        <nav aria-label="More about stocksbrew" className="mt-10">
          <p className="oa-label mb-2">Keep reading</p>
          <ul className="oa-surface grid overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-2">
            {NEXT.map((item) => (
              <li key={item.href} className="-mb-px -mr-px border-b border-r border-oa-border">
                <a href={item.href} className={`group block h-full px-4 py-3 hover:bg-oa-accent ${FOCUS}`}>
                  <span className="block text-[15px] font-medium leading-6 text-oa-fg group-hover:underline">{item.title}</span>
                  <span className="block text-[13.5px] leading-5 text-oa-muted-fg">{item.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      }
    />
  );
}
