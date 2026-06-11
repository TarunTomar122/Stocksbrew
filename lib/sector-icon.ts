export type SectorIconTheme = {
  icon: string;
  bg: string;
  fg: string;
};

const DEFAULT_THEME: SectorIconTheme = {
  icon: "category",
  bg: "#e5e7eb",
  fg: "#374151",
};

const EXACT_THEMES: Record<string, SectorIconTheme> = {
  semiconductors: { icon: "memory", bg: "#7c3aed", fg: "#ffffff" },
  software: { icon: "code", bg: "#0052ff", fg: "#ffffff" },
  energy: { icon: "bolt", bg: "#f59e0b", fg: "#ffffff" },
  healthcare: { icon: "medical_services", bg: "#10b981", fg: "#ffffff" },
  financials: { icon: "account_balance", bg: "#0f766e", fg: "#ffffff" },
  consumer: { icon: "shopping_bag", bg: "#ec4899", fg: "#ffffff" },
  industrials: { icon: "precision_manufacturing", bg: "#475569", fg: "#ffffff" },
  defense: { icon: "shield", bg: "#0f172a", fg: "#ffffff" },
  "big tech": { icon: "computer", bg: "#0052ff", fg: "#ffffff" },
  "ai infrastructure": { icon: "psychology", bg: "#6366f1", fg: "#ffffff" },
  banking: { icon: "landmark", bg: "#0f766e", fg: "#ffffff" },
  "information technology": { icon: "code", bg: "#0052ff", fg: "#ffffff" },
  "oil & gas": { icon: "local_gas_station", bg: "#d97706", fg: "#ffffff" },
  "real estate": { icon: "apartment", bg: "#78716c", fg: "#ffffff" },
  metals: { icon: "hardware", bg: "#57534e", fg: "#ffffff" },
  fmcg: { icon: "shopping_cart", bg: "#db2777", fg: "#ffffff" },
  telecom: { icon: "cell_tower", bg: "#0284c7", fg: "#ffffff" },
  crypto: { icon: "currency_bitcoin", bg: "#f97316", fg: "#ffffff" },
  other: { icon: "domain", bg: "#9ca3af", fg: "#ffffff" },
};

const KEYWORD_RULES: Array<{ pattern: RegExp; theme: SectorIconTheme }> = [
  { pattern: /semi|chip|foundry|wafer/, theme: EXACT_THEMES.semiconductors },
  { pattern: /software|saas|cloud|internet|application/, theme: EXACT_THEMES.software },
  { pattern: /ai\b|artificial|machine learning|data center/, theme: EXACT_THEMES["ai infrastructure"] },
  { pattern: /tech\b|technology|computer/, theme: EXACT_THEMES["big tech"] },
  { pattern: /oil|gas|petro|energy|utility|utilities|power/, theme: EXACT_THEMES.energy },
  { pattern: /pharma|biotech|health|medical|drug|hospital/, theme: EXACT_THEMES.healthcare },
  { pattern: /bank|finance|financial|insurance|capital market|nbfc|lending/, theme: EXACT_THEMES.financials },
  { pattern: /consumer|retail|fmcg|commerce|restaurant|apparel/, theme: EXACT_THEMES.consumer },
  { pattern: /auto|mobility|vehicle|motor/, theme: { icon: "directions_car", bg: "#2563eb", fg: "#ffffff" } },
  { pattern: /industrial|capital good|manufactur|machinery|aerospace/, theme: EXACT_THEMES.industrials },
  { pattern: /defense|military|weapon/, theme: EXACT_THEMES.defense },
  { pattern: /real estate|reit|property/, theme: EXACT_THEMES["real estate"] },
  { pattern: /metal|mining|steel|aluminum|copper/, theme: EXACT_THEMES.metals },
  { pattern: /telecom|media|wireless|broadcast/, theme: EXACT_THEMES.telecom },
  { pattern: /crypto|bitcoin|blockchain/, theme: EXACT_THEMES.crypto },
];

function normalizeLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map a bucket/sector label to a Material Symbol icon + accent colors. */
export function resolveSectorIcon(label: string): SectorIconTheme {
  const key = normalizeLabel(label);
  if (!key) return DEFAULT_THEME;
  if (EXACT_THEMES[key]) return EXACT_THEMES[key];

  for (const { pattern, theme } of KEYWORD_RULES) {
    if (pattern.test(key)) return theme;
  }

  return DEFAULT_THEME;
}
