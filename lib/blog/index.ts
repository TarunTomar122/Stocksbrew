import { blogContent } from "@/lib/blog/content";
import { seoBlogContent } from "@/lib/blog/seo-content";

export function getBlogContent(slug: string): string {
  const post = seoBlogContent[slug] ?? blogContent[slug];
  if (!post) return "<p>Content coming soon. We're writing this piece right now.</p>";
  return post;
}
