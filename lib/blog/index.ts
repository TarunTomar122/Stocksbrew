import { blogContent } from "@/lib/blog/content";

export function getBlogContent(slug: string): string {
  const post = blogContent[slug];
  if (!post) return "<p>Content coming soon. We're writing this piece right now.</p>";
  return post;
}
