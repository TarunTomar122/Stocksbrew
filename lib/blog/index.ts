import { blogContent } from "@/lib/blog/content";
import { seoBlogContent } from "@/lib/blog/seo-content";
import { researchBlogContent } from "@/lib/blog/research-content";
import { agentBlogContent } from "@/lib/blog/agent-content";
import { analysisAppBlogContent } from "@/lib/blog/analysis-app-content";

export function getBlogContent(slug: string): string {
  const post = analysisAppBlogContent[slug] ?? agentBlogContent[slug] ?? researchBlogContent[slug] ?? seoBlogContent[slug] ?? blogContent[slug];
  if (!post) return "<p>Content coming soon. We're writing this piece right now.</p>";
  return post;
}
