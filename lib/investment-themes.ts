import themeSeed from "@/backend/config/research_themes_seed.json";

export type ThemeCandidate = {
  company: string;
  ticker: string;
  role: string;
  benefitMechanism: string;
  catalyst?: string;
  failureCase: string;
  stocksbrewLabel: string;
  stocksbrewScore?: number;
  evidence?: string;
  coverageNote?: string;
};

export type ThemeResource = {
  label: string;
  href: string;
};

export type InvestmentTheme = {
  slug: string;
  name: string;
  cardDescription: string;
  description: string;
  resilienceNote: string;
  candidates: ThemeCandidate[];
  watchlist: ThemeCandidate[];
  resources: ThemeResource[];
};

export const INVESTMENT_THEMES: InvestmentTheme[] = themeSeed;

export const INVESTMENT_THEME_MAP = new Map(
  INVESTMENT_THEMES.map((theme) => [theme.slug, theme]),
);

export function getInvestmentTheme(slug: string): InvestmentTheme | null {
  return INVESTMENT_THEME_MAP.get(slug.toLowerCase()) ?? null;
}
