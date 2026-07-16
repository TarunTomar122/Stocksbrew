type Props = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
};

const BASE = "https://www.stocksbrew.online";

export function ArticleSchema({
  slug,
  title,
  description,
  datePublished,
  dateModified,
  image = `${BASE}/api/og`,
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
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
  };

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
    </>
  );
}
