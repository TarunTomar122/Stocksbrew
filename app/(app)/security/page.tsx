import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { ReadPage } from "@/components/docs/read-page";
import { StatStrip } from "@/components/oa/kit";
import { SECURITY_BLOCKS } from "@/lib/docs/company";
import { SITE_URL } from "@/lib/docs/site";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "security"], "How stocksbrew handles your account and data");

export const metadata: Metadata = {
  title: "Security: how stocksbrew handles accounts, data and money",
  description:
    "Exactly how stocksbrew handles sign-in, what it stores about you, who else receives data, how payments work, and how to export or delete your account. Includes what is not built yet.",
  alternates: { canonical: "/security" },
  openGraph: {
    title: "Security at stocksbrew",
    description: "No brokerage connection, no trading, Google sign-in, and a plain list of what is stored and what is not built yet.",
    url: `${SITE_URL}/security`,
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export default function SecurityPage() {
  return (
    <ReadPage
      label="Security"
      title="How accounts, data and money are handled"
      lede="No brokerage connection, no trading, no password. Below is what we store, where it goes, and the things we have not built yet."
      meta="Written from the code · last reviewed Nov 10, 2026"
      blocks={SECURITY_BLOCKS}
      intro={
        <StatStrip
          stats={[
            { label: "Brokerage connection", value: "None" },
            { label: "Trading", value: "None" },
            { label: "Sign-in", value: "Google only" },
            { label: "Card details", value: "Never reach us" },
          ]}
        />
      }
      before={
        <>
          <JsonLd
            data={[
              { "@context": "https://schema.org", "@type": "WebPage", name: "Security at stocksbrew", url: `${SITE_URL}/security`, dateModified: "2026-11-10" },
              breadcrumbLd([
                { name: "Home", path: "/" },
                { name: "Security", path: "/security" },
              ]),
            ]}
          />
        </>
      }
    />
  );
}
