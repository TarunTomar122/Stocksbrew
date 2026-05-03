import { posts_1_10 } from "@/lib/learn/content-1";
import { posts_11_20 } from "@/lib/learn/content-2";
import { posts_21_30 } from "@/lib/learn/content-3";
import { posts_31_40 } from "@/lib/learn/content-4";
import { posts_41_50 } from "@/lib/learn/content-5";

export function getLearnContent(slug: string): string {
  const post = POSTS[slug];
  if (!post) return "<p>Content coming soon. We're writing this guide right now.</p>";
  return post;
}

const POSTS: Record<string, string> = {
  ...posts_1_10,
  ...posts_11_20,
  ...posts_21_30,
  ...posts_31_40,
  ...posts_41_50,
};
