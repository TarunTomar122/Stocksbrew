export type SeoPostMeta = {
  primaryKeyword: string;
  secondaryKeywords: string[];
  author: string;
  faqs: { question: string; answer: string }[];
};

export const seoPostMeta: Record<string, SeoPostMeta> = {};

export function getSeoMeta(slug: string): SeoPostMeta | null {
  return seoPostMeta[slug] ?? null;
}
