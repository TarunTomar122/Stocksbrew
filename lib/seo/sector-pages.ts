export type SeoSectorPage = {
  slug: string;
  name: string;
  description: string;
  focus: string;
};

export const SEO_SECTOR_PAGES: SeoSectorPage[] = [
  {
    slug: "semiconductors",
    name: "Semiconductor Stocks",
    description:
      "Follow US semiconductor stocks across AI accelerators, memory, networking, foundries, and chip equipment.",
    focus: "Demand, margins, capacity, product cycles, valuation, and the risks moving chip stocks.",
  },
  {
    slug: "ai-infrastructure",
    name: "AI Infrastructure Stocks",
    description:
      "Track the companies supplying compute, cloud capacity, networking, memory, and software for AI workloads.",
    focus: "Capital spending, customer concentration, supply constraints, adoption, and return on investment.",
  },
  {
    slug: "big-tech",
    name: "Big Tech Stocks",
    description:
      "Compare the largest US technology platforms across growth, margins, AI spending, valuation, and market leadership.",
    focus: "Cloud growth, advertising, devices, AI monetization, regulation, and capital allocation.",
  },
  {
    slug: "financials",
    name: "Financial Stocks",
    description:
      "Follow major US banks and financial companies through rates, credit, capital, trading, and consumer health.",
    focus: "Net interest income, credit quality, deposits, capital ratios, fee income, and rate sensitivity.",
  },
  {
    slug: "healthcare",
    name: "Healthcare Stocks",
    description:
      "Track large US healthcare and pharmaceutical companies across product demand, pipelines, policy, and valuation.",
    focus: "Clinical milestones, patent exposure, reimbursement, utilization, margins, and pipeline quality.",
  },
  {
    slug: "energy",
    name: "Energy Stocks",
    description:
      "Follow integrated oil, exploration, refining, and services companies through commodity and capacity cycles.",
    focus: "Oil and gas prices, production, refining spreads, capital discipline, cash returns, and geopolitics.",
  },
  {
    slug: "industrials",
    name: "Industrial Stocks",
    description:
      "Track aerospace, defense, machinery, and infrastructure companies across orders, backlog, margins, and cycles.",
    focus: "Backlog, book-to-bill, government spending, input costs, execution, and end-market demand.",
  },
  {
    slug: "consumer",
    name: "Consumer Stocks",
    description:
      "Follow major US consumer companies through spending, pricing, demand, inventory, and changing preferences.",
    focus: "Comparable sales, unit growth, pricing power, inventory, consumer health, and operating leverage.",
  },
];

const SECTOR_BY_SLUG = new Map(SEO_SECTOR_PAGES.map((sector) => [sector.slug, sector]));

export function getSeoSectorPage(slug: string): SeoSectorPage | null {
  return SECTOR_BY_SLUG.get(String(slug || "").trim().toLowerCase()) ?? null;
}

export function resolveSeoSectorSlug(input: {
  candidate?: string | null;
  sector?: string | null;
  industry?: string | null;
}): string | null {
  const candidate = String(input.candidate || "").trim().toLowerCase();
  if (candidate && SECTOR_BY_SLUG.has(candidate)) return candidate;

  const sector = String(input.sector || "").trim().toLowerCase();
  const industry = String(input.industry || "").trim().toLowerCase();
  if (industry.includes("semiconductor")) return "semiconductors";
  if (industry.includes("bank") || sector.includes("financial")) return "financials";
  if (sector.includes("health")) return "healthcare";
  if (sector.includes("energy")) return "energy";
  if (sector.includes("industrial")) return "industrials";
  if (sector.includes("consumer")) return "consumer";
  return null;
}
