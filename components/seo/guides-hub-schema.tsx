import { GUIDES_FAQS } from "@/lib/guides-hub-data";

const BASE = "https://www.stocksbrew.online";

export function GuidesHubSchema() {
  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Stock Research Guide",
    description:
      "Free tools, comparisons and tutorials for US stock research on stocksbrew. Start with Watchlist, Should I Buy or the Learn library.",
    url: `${BASE}/guides`,
    isPartOf: { "@type": "WebSite", name: "stocksbrew", url: BASE },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Stock Research Guide", item: `${BASE}/guides` },
    ],
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: GUIDES_FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
    </>
  );
}
