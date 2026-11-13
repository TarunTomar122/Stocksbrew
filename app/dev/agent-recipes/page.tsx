import { notFound } from "next/navigation";

import { interTight } from "@/components/oa/font";
import { RecipeLimitPreview } from "@/components/agent-recipes/limit-preview";

/**
 * Local only: the recipe sheet for NVDA as a Free account at its agent limit sees it (2 of 2 running), with the real
 * replay. The owner's own account is Pro, so this state cannot be shown on it.
 */
export default function AgentRecipesPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`oa-landing ${interTight.variable} min-h-screen bg-oa-page`}>
      <RecipeLimitPreview />
    </main>
  );
}
