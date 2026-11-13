"use client";

import { RecipeSheet } from "./recipe-sheet";
import { recipesFor } from "@/lib/agent-recipes/recipes";
import type { RecipeContext } from "@/lib/agent-recipes/server";

/** The sheet at the plan's limit, for the local preview page (app/dev/agent-recipes). Nothing is saved from it. */
export function RecipeLimitPreview() {
  const context: RecipeContext = {
    subject: { key: "stock:NVDA", kind: "stock", name: "NVDA" },
    signedIn: true,
    plan: "free",
    running: 2,
    limit: 2,
    recipes: recipesFor({ kind: "stock", ticker: "NVDA", name: "NVIDIA" }).map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      line: recipe.line,
      source: recipe.source,
      icon: recipe.icon,
      ...(recipe.choices ? { choices: recipe.choices } : {}),
      rule: null,
      standing: null,
      proOnly: false,
      ready: true,
    })),
  };
  return <RecipeSheet subject="stock:NVDA" initial={context} onClose={() => {}} preview />;
}
