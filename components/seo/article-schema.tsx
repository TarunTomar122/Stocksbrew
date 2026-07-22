type Props = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  keywords?: string[];
  faqs?: { question: string; answer: string }[];
};

const BASE = "https://www.stocksbrew.online";

export function ArticleSchema({
  slug,
  title,
  description,
  datePublished,
  dateModified,
  image = `${BASE}/api/og`,
  keywords = [],
  faqs = [],
}: Props) {
  const url = `${BASE}/blog/${slug}`;

  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    image: [image],
    author: {
      "@type": "Person",
      name: "Tarun Tomar",
      url: `${BASE}/authors/tarun-tomar`,
    },
    publisher: {
      "@type": "Organization",
      name: "stocksbrew",
      url: BASE,
    },
    datePublished,
    dateModified: dateModified ?? datePublished,
    isAccessibleForFree: true,
    keywords,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };

  const faq = faqs.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : null;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${BASE}/blog` },
      { "@type": "ListItem", position: 3, name: title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {faq ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} /> : null}
    </>
  );
}
