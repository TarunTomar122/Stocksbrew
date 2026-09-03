import { cache } from "react";
import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  INVESTMENT_THEMES,
  type InvestmentTheme,
  type ThemeCandidate,
  type ThemeResource,
} from "@/lib/investment-themes";

function isCandidate(value: unknown): value is ThemeCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return [
    "company",
    "ticker",
    "role",
    "benefitMechanism",
    "failureCase",
    "stocksbrewLabel",
  ].every((key) => typeof candidate[key] === "string" && candidate[key]);
}

function isResource(value: unknown): value is ThemeResource {
  if (!value || typeof value !== "object") return false;
  const resource = value as Record<string, unknown>;
  return typeof resource.label === "string" && typeof resource.href === "string";
}

function isTheme(value: unknown): value is InvestmentTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.slug === "string" &&
    typeof theme.name === "string" &&
    typeof theme.cardDescription === "string" &&
    typeof theme.description === "string" &&
    typeof theme.resilienceNote === "string" &&
    Array.isArray(theme.candidates) &&
    theme.candidates.length >= 8 &&
    theme.candidates.length <= 12 &&
    theme.candidates.every(isCandidate) &&
    new Set(theme.candidates.map((candidate) => candidate.ticker)).size ===
      theme.candidates.length &&
    Array.isArray(theme.watchlist) &&
    theme.watchlist.every(isCandidate) &&
    Array.isArray(theme.resources) &&
    theme.resources.every(isResource)
  );
}

/** Merge Firestore config per theme so one bad weekly result cannot blank the page. */
export function mergeResearchThemes(remote: unknown): InvestmentTheme[] {
  if (!remote || typeof remote !== "object") return INVESTMENT_THEMES;
  const rows = Array.isArray(remote)
    ? remote
    : Array.isArray((remote as { themes?: unknown }).themes)
      ? (remote as { themes: unknown[] }).themes
      : [];
  const remoteBySlug = new Map(
    rows
      .filter(isTheme)
      .map((theme) => [theme.slug, theme] as const),
  );
  return INVESTMENT_THEMES.map((fallback) => remoteBySlug.get(fallback.slug) ?? fallback);
}

async function readLiveResearchThemes(): Promise<InvestmentTheme[]> {
  try {
    const doc = await adminFirestore.collection("tm_config").doc("research_themes").get();
    return mergeResearchThemes(doc.exists ? doc.data() : null);
  } catch {
    return INVESTMENT_THEMES;
  }
}

const getCachedResearchThemes = unstable_cache(
  readLiveResearchThemes,
  ["research-themes-runtime-v2"],
  { revalidate: 900 },
);

export const getLiveInvestmentThemes = cache(async (): Promise<InvestmentTheme[]> => {
  return getCachedResearchThemes();
});

export const getLiveInvestmentTheme = cache(async (slug: string): Promise<InvestmentTheme | null> => {
  const theme = (await getLiveInvestmentThemes()).find((candidate) => candidate.slug === slug);
  return theme ?? null;
});
