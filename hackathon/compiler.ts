import type {
  DisproofCondition,
  EvidenceHook,
  ThesisDraft,
  ThesisDriver,
  ThesisEntity,
} from "./types";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Thesis families — curated defaults for known sectors/themes
// ---------------------------------------------------------------------------

type DriverTemplate = Pick<ThesisDriver, "label" | "description" | "polarity" | "category" | "weight" | "horizon" | "evidenceKeywords">;

interface FamilyDef {
  name: string;
  aliases: string[];
  sectors: string[];
  summarySnippet: string;
  entities: EntitySeed[];
  drivers: DriverTemplate[];
}

type EntitySeed = {
  name: string;
  aliases: string[];
  type: ThesisEntity["type"];
  ticker?: string;
  role?: ThesisEntity["role"];
  description: string;
};

const FAMILIES: FamilyDef[] = [
  {
    name: "Semiconductors",
    aliases: ["semiconductor", "semis", "chip", "chips", "nvidia", "nvda", "tsmc", "gpu", "hbm", "cowos", "foundry", "micron", "asic"],
    sectors: ["Semiconductors", "AI Infrastructure"],
    summarySnippet: "AI-driven semiconductor demand expands structurally as hyperscaler capex, GPU shipments, HBM pricing, and advanced packaging remain strong.",
    entities: [
      { name: "NVIDIA", aliases: ["nvidia", "nvda"], type: "company", ticker: "NVDA", role: "beneficiary", description: "Primary AI GPU vendor and demand signal owner." },
      { name: "TSMC", aliases: ["tsmc", "taiwan semiconductor", "tsm"], type: "company", ticker: "TSM", role: "beneficiary", description: "Foundry bottleneck and utilization signal owner." },
      { name: "Micron", aliases: ["micron", "mu"], type: "company", ticker: "MU", role: "beneficiary", description: "HBM and memory pricing signal owner." },
      { name: "Broadcom", aliases: ["broadcom", "avgo"], type: "company", ticker: "AVGO", role: "risk", description: "Custom ASIC competitor and disproof signal owner." },
      { name: "AMD", aliases: ["amd"], type: "company", ticker: "AMD", role: "risk", description: "Alternative accelerator competitor." },
      { name: "Microsoft", aliases: ["microsoft", "msft"], type: "company", ticker: "MSFT", role: "signal-owner", description: "Hyperscaler capex demand signal owner." },
      { name: "Meta", aliases: ["meta"], type: "company", ticker: "META", role: "signal-owner", description: "Hyperscaler capex demand signal owner." },
      { name: "Amazon", aliases: ["amazon", "aws", "amzn"], type: "company", ticker: "AMZN", role: "signal-owner", description: "Cloud and infrastructure demand signal owner." },
      { name: "Alphabet", aliases: ["alphabet", "google", "googl"], type: "company", ticker: "GOOGL", role: "signal-owner", description: "Cloud and search infrastructure demand signal owner." },
      { name: "Semiconductors", aliases: ["semiconductor", "semis", "chip", "chips"], type: "sector", description: "Broader semiconductor sector exposure." },
      { name: "AI Infrastructure", aliases: ["ai", "artificial intelligence", "ai infrastructure", "datacenter", "data center"], type: "theme", description: "AI infrastructure buildout and compute demand." },
      { name: "HBM", aliases: ["hbm", "hbm3e"], type: "product", description: "High-bandwidth memory demand and pricing." },
      { name: "CoWoS", aliases: ["cowos"], type: "product", description: "Advanced packaging capacity and bottleneck signal." },
    ],
    drivers: [
      {
        label: "AI demand continues to outstrip available capacity",
        description: "Hyperscaler and enterprise compute spend keeps pushing GPU and networking volumes higher, supporting pricing and margins.",
        polarity: "bullish", category: "demand", weight: 0.35, horizon: "long",
        evidenceKeywords: ["capex", "gpu shipments", "orders", "bookings", "datacenter growth"],
      },
      {
        label: "Supply constraints ease without crushing pricing",
        description: "Advanced packaging and HBM capacity expands enough to meet orders while ASPs stay healthy, driving revenue growth.",
        polarity: "bullish", category: "supply", weight: 0.25, horizon: "medium",
        evidenceKeywords: ["capacity", "utilization", "lead times", "cowos", "hbm", "allocation"],
      },
      {
        label: "Custom ASIC competition stays manageable",
        description: "Alternative accelerator designs do not meaningfully reduce merchant GPU demand or market share.",
        polarity: "bearish", category: "competition", weight: 0.20, horizon: "long",
        evidenceKeywords: ["asic", "custom silicon", "merchant gpu", "share", "inference"],
      },
      {
        label: "Export controls do not materially impair demand",
        description: "Regulatory tightening adds friction but does not break the demand story for core beneficiaries.",
        polarity: "bearish", category: "regulation", weight: 0.20, horizon: "medium",
        evidenceKeywords: ["export controls", "licensing", "china", "restrictions"],
      },
    ],
  },
  {
    name: "Healthcare",
    aliases: ["healthcare", "health care", "health", "medicare", "medicaid", "pharma", "biotech", "biopharma", "payer", "hospital", "medical", "glp-1", "obesity", "medtech", "drug", "clinical", "unh", "unitedhealth", "lly", "eli lilly", "novo", "isrg", "intuitive surgical"],
    sectors: ["Healthcare"],
    summarySnippet: "Healthcare sector benefits from structural demand tailwinds — aging demographics, GLP-1 adoption, and surgical robotics innovation — while regulatory and patent-cliff risks persist.",
    entities: [
      { name: "UnitedHealth", aliases: ["unitedhealth", "unh"], type: "company", ticker: "UNH", role: "beneficiary", description: "Largest US managed-care payer and diversified health services platform." },
      { name: "Eli Lilly", aliases: ["eli lilly", "lilly", "lly"], type: "company", ticker: "LLY", role: "beneficiary", description: "GLP-1 leader driving obesity and diabetes drug growth." },
      { name: "Novo Nordisk", aliases: ["novo nordisk", "novo", "nvo"], type: "company", ticker: "NVO", role: "beneficiary", description: "GLP-1 pioneer with Ozempic and Wegovy dominating global obesity care." },
      { name: "Intuitive Surgical", aliases: ["intuitive surgical", "intuitive", "isrg"], type: "company", ticker: "ISRG", role: "beneficiary", description: "Robotic-assisted surgery leader with recurring instrument revenue." },
      { name: "Cigna", aliases: ["cigna", "ci"], type: "company", ticker: "CI", role: "beneficiary", description: "Diversified health services and pharmacy benefit manager." },
      { name: "CVS Health", aliases: ["cvs", "cvs health"], type: "company", ticker: "CVS", role: "risk", description: "Integrated pharmacy and clinic model facing reimbursement and competitive pressure." },
      { name: "Pfizer", aliases: ["pfizer", "pfe"], type: "company", ticker: "PFE", role: "risk", description: "Faces patent cliffs and pipeline transition risk." },
      { name: "Healthcare", aliases: ["healthcare", "health care", "health", "medical"], type: "sector", description: "Broader healthcare sector exposure." },
      { name: "GLP-1", aliases: ["glp-1", "glp1", "semaglutide", "tirzepatide", "obesity", "wegovy", "ozempic", "mounjaro"], type: "product", description: "GLP-1 agonist class transforming obesity and diabetes care." },
      { name: "Robotic Surgery", aliases: ["robotic surgery", "surgical robot", "surgical robotics", "da vinci"], type: "theme", description: "Robotic-assisted surgery platform adoption and procedure growth." },
    ],
    drivers: [
      {
        label: "GLP-1 adoption expands the total addressable market",
        description: "Obesity and metabolic drug volumes continue to grow as payers broaden coverage and manufacturing capacity scales, lifting revenue for leaders.",
        polarity: "bullish", category: "demand", weight: 0.30, horizon: "long",
        evidenceKeywords: ["glp-1 prescriptions", "payer coverage", "capacity expansion", "global rollout", "volumes"],
      },
      {
        label: "Aging demographics and procedure volume growth support medtech",
        description: "An aging population and expanding insurance coverage drive surgical volumes and device utilization higher across developed markets.",
        polarity: "bullish", category: "demand", weight: 0.25, horizon: "long",
        evidenceKeywords: ["procedure volumes", "demographics", "surgical growth", "hospital admissions", "device utilization"],
      },
      {
        label: "Regulatory and pricing pressure compresses margins",
        description: "IRA drug-price negotiations, Medicaid redeterminations, and commercial pricing scrutiny could reduce profitability for payers and pharma.",
        polarity: "bearish", category: "regulation", weight: 0.25, horizon: "medium",
        evidenceKeywords: ["drug pricing", "IRA negotiations", "medicaid", "regulation", "reimbursement"],
      },
      {
        label: "Patent cliffs and pipeline gaps weaken incumbents",
        description: "Key blockbuster patents expiring over the next 3–5 years create revenue headwinds that new launches may not fully offset.",
        polarity: "bearish", category: "competition", weight: 0.20, horizon: "long",
        evidenceKeywords: ["patent expiry", "biosimilars", "pipeline", "looming cliff", "generic entry"],
      },
    ],
  },
  {
    name: "Energy",
    aliases: ["energy", "oil", "gas", "natural gas", "renewable", "renewables", "solar", "wind", "nuclear", "utility", "utilities", "power", "electric", "crude", "lng", "xom", "cvx", "exxon", "chevron"],
    sectors: ["Energy", "Utilities"],
    summarySnippet: "Energy demand grows from electrification, AI data-center load, and LNG exports, while supply discipline and energy-transition capex reshape the landscape.",
    entities: [
      { name: "ExxonMobil", aliases: ["exxon", "xom"], type: "company", ticker: "XOM", role: "beneficiary", description: "Integrated oil major with growing low-carbon and trading businesses." },
      { name: "Chevron", aliases: ["chevron", "cvx"], type: "company", ticker: "CVX", role: "beneficiary", description: "Integrated supermajor with strong Permian and LNG positions." },
      { name: "NextEra Energy", aliases: ["nextera", "nextera energy", "nee"], type: "company", ticker: "NEE", role: "beneficiary", description: "Largest US renewable energy developer and utility operator." },
      { name: "Constellation Energy", aliases: ["constellation energy", "constellation", "ceg"], type: "company", ticker: "CEG", role: "beneficiary", description: "Leading nuclear and clean power provider benefiting from data-center demand." },
      { name: "Halliburton", aliases: ["halliburton", "hal"], type: "company", ticker: "HAL", role: "risk", description: "Oilfield services exposure to upstream capex cycles." },
      { name: "Energy", aliases: ["energy", "oil", "gas", "power"], type: "sector", description: "Broader energy sector exposure." },
      { name: "Utilities", aliases: ["utility", "utilities", "electric", "power"], type: "sector", description: "Electric utility and power generation." },
      { name: "LNG", aliases: ["lng", "liquefied natural gas"], type: "product", description: "LNG export and global gas demand growth." },
    ],
    drivers: [
      {
        label: "Electrification and AI data-center load drive power demand",
        description: "Growing electricity demand from AI data centers, EVs, and re-industrialization pushes grid investment and power prices higher.",
        polarity: "bullish", category: "demand", weight: 0.30, horizon: "long",
        evidenceKeywords: ["electricity demand", "data center", "grid load", "electrification", "power prices"],
      },
      {
        label: "LNG export capacity expands, lifting natural gas demand",
        description: "New LNG terminals coming online increase US gas export volumes, tightening domestic balances and supporting prices.",
        polarity: "bullish", category: "demand", weight: 0.25, horizon: "long",
        evidenceKeywords: ["lng exports", "terminal capacity", "henry hub", "global gas", "liquefaction"],
      },
      {
        label: "Oil supply discipline keeps prices rangebound high",
        description: "OPEC+ production management and US shale capital discipline limit supply growth, supporting crude prices above pre-pandemic averages.",
        polarity: "bullish", category: "supply", weight: 0.25, horizon: "medium",
        evidenceKeywords: ["opec", "supply discipline", "capex restraint", "crude inventory", "rig count"],
      },
      {
        label: "Energy transition risks strand legacy assets",
        description: "Accelerating decarbonization policy or demand shifts could devalue long-lived fossil assets before their economic life ends.",
        polarity: "bearish", category: "regulation", weight: 0.20, horizon: "long",
        evidenceKeywords: ["carbon policy", "stranded assets", "decarbonization", "transition risk", "esg"],
      },
    ],
  },
  {
    name: "Fintech / Payments",
    aliases: ["fintech", "payments", "payment", "digital bank", "neobank", "blockchain", "crypto", "bitcoin", "btc", "defi", "stablecoin", "paypal", "square", "stripe"],
    sectors: ["Financials", "Technology"],
    summarySnippet: "Digital payments, embedded finance, and crypto infrastructure adoption accelerate as cash-to-digital migration and regulatory clarity improve.",
    entities: [
      { name: "PayPal", aliases: ["paypal", "pypl"], type: "company", ticker: "PYPL", role: "beneficiary", description: "Global digital payments and merchant platform." },
      { name: "Block (Square)", aliases: ["block", "square", "sq"], type: "company", ticker: "SQ", role: "beneficiary", description: "Seller ecosystem and Cash App consumer platform." },
      { name: "Coinbase", aliases: ["coinbase", "coin"], type: "company", ticker: "COIN", role: "beneficiary", description: "Largest US crypto exchange and on-chain infrastructure provider." },
      { name: "Adyen", aliases: ["adyen", "adyey"], type: "company", ticker: "ADYEY", role: "beneficiary", description: "Enterprise payment processor with unified commerce platform." },
      { name: "Visa", aliases: ["visa", "v"], type: "company", ticker: "V", role: "signal-owner", description: "Global card-network operator signaling consumer spending trends." },
      { name: "Mastercard", aliases: ["mastercard", "ma"], type: "company", ticker: "MA", role: "signal-owner", description: "Global card-network operator signaling cross-border volume trends." },
      { name: "Fintech", aliases: ["fintech", "digital payment", "embedded finance"], type: "theme", description: "Technology-driven financial services." },
      { name: "Payments", aliases: ["payment", "payments", "digital wallet"], type: "theme", description: "Digital and card-based payment flows." },
      { name: "Crypto", aliases: ["crypto", "bitcoin", "btc", "defi", "stablecoin", "blockchain"], type: "theme", description: "Crypto infrastructure and digital-asset adoption." },
    ],
    drivers: [
      {
        label: "Cash-to-digital migration continues globally",
        description: "Digital wallet and contactless adoption expands merchant acceptance and payment volumes across emerging and developed markets.",
        polarity: "bullish", category: "demand", weight: 0.30, horizon: "long",
        evidenceKeywords: ["digital wallet", "contactless", "payment volumes", "take rate", "merchant acceptance"],
      },
      {
        label: "Embedded finance expands fintech distribution",
        description: "Non-financial platforms integrate lending, payments, and insurance — creating new revenue streams for fintech infrastructure providers.",
        polarity: "bullish", category: "demand", weight: 0.25, horizon: "long",
        evidenceKeywords: ["embedded finance", "platform integration", "bnpl", "lending", "api"],
      },
      {
        label: "Regulatory clarity unlocks institutional crypto adoption",
        description: "Stablecoin legislation and ETF approvals bring institutional capital and broader retail access, but full execution is uncertain.",
        polarity: "bullish", category: "regulation", weight: 0.25, horizon: "medium",
        evidenceKeywords: ["stablecoin bill", "crypto etf", "institutional", "custody", "regulation"],
      },
      {
        label: "Competition and compression pressure take rates",
        description: "New entrants, open banking, and merchant pushback on interchange could compress the fees that sustain fintech margins.",
        polarity: "bearish", category: "competition", weight: 0.20, horizon: "medium",
        evidenceKeywords: ["open banking", "interchange", "take rate", "competition", "merchant pushback"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Family detection
// ---------------------------------------------------------------------------

function detectFamily(rawText: string): FamilyDef | null {
  const lower = rawText.toLowerCase();
  let best: FamilyDef | null = null;
  let bestScore = 0;
  for (const family of FAMILIES) {
    const score = family.aliases.filter((a) => lower.includes(a)).length;
    if (score > bestScore) {
      bestScore = score;
      best = family;
    }
  }
  return bestScore > 0 ? best : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsAlias(text: string, aliases: string[]) {
  return aliases.some((alias) => text.includes(alias));
}

function titleFromRaw(rawText: string, fallback: string, family: FamilyDef | null) {
  const compact = rawText.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  if (compact.length <= 50) {
    const label = family ? `${family.name} Thesis` : compact;
    return label.length > 72 ? `${label.slice(0, 69).trim()}...` : label;
  }
  return compact.length > 72 ? `${compact.slice(0, 69).trim()}...` : compact;
}

function deriveSummary(rawText: string, family: FamilyDef | null) {
  const compact = rawText.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (family && compact.length < 100) return family.summarySnippet;
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
}

function inferHorizonMonths(rawText: string) {
  const lower = rawText.toLowerCase();
  const yearMatch = lower.match(/(\d+)\s*year/);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  const monthMatch = lower.match(/(\d+)\s*month/);
  if (monthMatch) return Number(monthMatch[1]);
  if (lower.includes("long term") || lower.includes("structural") || lower.includes("secular")) return 24;
  return 12;
}

// ---------------------------------------------------------------------------
// Entity & sector extraction
// ---------------------------------------------------------------------------

function extractEntities(rawText: string, family: FamilyDef | null): ThesisEntity[] {
  const lower = rawText.toLowerCase();
  const seedPool = family ? family.entities : ENTITY_SEEDS;
  const userMatched = seedPool.filter((seed) => containsAlias(lower, seed.aliases));
  const seen = new Set(userMatched.map((e) => e.name));

  if (!family) return userMatched.map(fromSeed);
  const defaultEntities = family.entities
    .filter((e) => !seen.has(e.name) && (e.role === "beneficiary" || e.role === "risk" || e.type === "sector" || e.type === "theme"))
    .map(fromSeed);
  return [...userMatched, ...defaultEntities];
}

const ENTITY_SEEDS: EntitySeed[] = [];

function fromSeed(seed: EntitySeed): ThesisEntity {
  return { name: seed.name, type: seed.type, ticker: seed.ticker, role: seed.role, description: seed.description };
}

function inferBeneficiaries(entities: ThesisEntity[]) {
  return entities.filter((entity) => entity.role === "beneficiary" && entity.ticker).map((entity) => entity.ticker as string);
}

function inferRisks(entities: ThesisEntity[]) {
  return entities.filter((entity) => entity.role === "risk" && entity.ticker).map((entity) => entity.ticker as string);
}

function inferSectors(rawText: string, family: FamilyDef | null) {
  if (family && family.sectors.length > 0) return [...family.sectors];
  const lower = rawText.toLowerCase();
  const sectors = new Set<string>();
  for (const f of FAMILIES) {
    if (f.aliases.some((a) => lower.includes(a))) {
      for (const s of f.sectors) sectors.add(s);
    }
  }
  return [...sectors];
}

// ---------------------------------------------------------------------------
// Driver compilation
// ---------------------------------------------------------------------------

function driverHorizon(familyHorizon: ThesisDriver["horizon"], horizonMonths: number): ThesisDriver["horizon"] {
  if (familyHorizon === "short" || familyHorizon === "long") return familyHorizon;
  if (horizonMonths >= 24) return "long";
  if (horizonMonths <= 6) return "short";
  return "medium";
}

function entitiesForDriver(description: string, entities: ThesisEntity[]) {
  const lower = description.toLowerCase();
  const matched = entities.filter((entity) => lower.includes(entity.name.toLowerCase()) || lower.includes((entity.ticker || "").toLowerCase()));
  return matched.length > 0 ? matched.map((entity) => entity.name) : entities.filter((entity) => entity.role !== "risk").map((entity) => entity.name).slice(0, 4);
}

function inferDriverCategory(description: string): ThesisDriver["category"] {
  const lower = description.toLowerCase();
  if (containsAlias(lower, ["demand", "capex", "spend", "orders", "adoption", "volume", "volumes", "growth"])) return "demand";
  if (containsAlias(lower, ["supply", "capacity", "utilization", "lead time", "packaging"])) return "supply";
  if (containsAlias(lower, ["pricing", "margin", "asp", "price"])) return "pricing";
  if (containsAlias(lower, ["competition", "asic", "share", "merchant gpu", "patent", "generic"])) return "competition";
  if (containsAlias(lower, ["export", "regulation", "control", "ban", "policy", "ira", "cms", "fda"])) return "regulation";
  return "profitability";
}

function parseExplicitDrivers(rawText: string, entities: ThesisEntity[], horizonMonths: number): ThesisDriver[] {
  const parts = rawText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const drivers: ThesisDriver[] = [];
  let index = 0;

  for (const part of parts) {
    const normalized = part.replace(/\s+/g, " ");
    const lower = normalized.toLowerCase();
    const polarity: ThesisDriver["polarity"] =
      lower.startsWith("bear") || containsAlias(lower, ["threat", "risk", "pressure", "cut", "slowdown"])
        ? "bearish"
        : "bullish";
    const cleaned = normalized.replace(/^(bull|bear)(ish)?\s*(case|driver)?\s*[:\-]?\s*/i, "").trim();
    if (!cleaned || cleaned.length < 10) continue;
    const category = inferDriverCategory(cleaned);
    drivers.push({
      id: `driver_${index++}`,
      label: cleaned.length > 84 ? `${cleaned.slice(0, 81).trim()}...` : cleaned,
      description: cleaned.length > 200 ? `${cleaned.slice(0, 197).trim()}...` : cleaned,
      polarity,
      category,
      weight: 1,
      horizon: (horizonMonths >= 24 ? "long" : horizonMonths <= 6 ? "short" : "medium") as ThesisDriver["horizon"],
      trackedEntityNames: entitiesForDriver(cleaned, entities),
      evidenceKeywords: keywordsForDriver(cleaned, category),
    });
  }

  const total = drivers.length || 1;
  return drivers.map((d) => ({ ...d, weight: 1 / total }));
}

function keywordsForDriver(description: string, category: ThesisDriver["category"]) {
  const base = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  const categoryKeywords: Record<ThesisDriver["category"], string[]> = {
    demand: ["capex", "guidance", "orders", "demand", "spending", "adoption", "growth", "volumes"],
    supply: ["capacity", "utilization", "lead times", "allocation", "bottleneck", "expansion"],
    pricing: ["pricing", "asp", "margins", "reimbursement", "take rate"],
    competition: ["competition", "share", "patent", "generic", "biosimilar", "entry"],
    regulation: ["regulation", "policy", "export controls", "licensing", "ira", "cms", "fda", "approval"],
    profitability: ["margin", "gross margin", "profitability", "mix", "efficiency"],
  };
  return [...new Set([...categoryKeywords[category], ...base])].slice(0, 8);
}

function buildFamilyDrivers(family: FamilyDef, entities: ThesisEntity[], horizonMonths: number): ThesisDriver[] {
  const matched = family.drivers.map((tmpl, i) => ({
    id: `driver_${i}`,
    label: tmpl.label,
    description: tmpl.description,
    polarity: tmpl.polarity,
    category: tmpl.category,
    weight: tmpl.weight,
    horizon: driverHorizon(tmpl.horizon, horizonMonths),
    trackedEntityNames: entitiesForDriver(tmpl.description, entities),
    evidenceKeywords: tmpl.evidenceKeywords,
  }));

  const total = matched.reduce((s, d) => s + d.weight, 0) || 1;
  return matched.map((d) => ({ ...d, weight: d.weight / total }));
}

function buildGenericDrivers(rawText: string, entities: ThesisEntity[], horizonMonths: number): ThesisDriver[] {
  const bullNames = entities.filter((e) => e.role === "beneficiary").map((e) => e.name);
  const riskNames = entities.filter((e) => e.role === "risk").map((e) => e.name);

  const drivers: ThesisDriver[] = [];

  drivers.push({
    id: "driver_0",
    label: "Demand growth continues to expand",
    description: bullNames.length
      ? `Structural demand drivers keep boosting volumes and pricing for ${bullNames.slice(0, 3).join(", ")}.`
      : "Structural demand drivers keep boosting volumes and pricing for the sector.",
    polarity: "bullish",
    category: "demand",
    weight: 0.50,
    horizon: horizonMonths >= 24 ? "long" : "medium",
    trackedEntityNames: bullNames.slice(0, 4),
    evidenceKeywords: ["demand", "volumes", "guidance", "growth", "orders", "adoption"],
  });

  const bearLabel = riskNames.length
    ? `Competitive or regulatory risks challenge ${riskNames.slice(0, 2).join(", ")}`
    : "Competitive or regulatory headwinds emerge";
  drivers.push({
    id: "driver_1",
    label: bearLabel,
    description: riskNames.length
      ? `New entrants, pricing pressure, or policy changes could erode margins and slow the thesis payoff.`
      : "New entrants, pricing pressure, or policy changes could erode margins and slow the thesis payoff.",
    polarity: "bearish",
    category: "competition",
    weight: 0.50,
    horizon: "medium",
    trackedEntityNames: [...bullNames, ...riskNames].slice(0, 4),
    evidenceKeywords: ["competition", "margin", "regulation", "headwinds", "risk"],
  });

  return drivers;
}

function hasExplicitDriverParagraphs(rawText: string): boolean {
  const parts = rawText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  let markerCount = 0;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (/^(bull|bear)(ish)?\s*(case|driver)?\s*[:\-]?/i.test(lower)) markerCount++;
  }
  return markerCount >= 2;
}

function compileDrivers(rawText: string, entities: ThesisEntity[], horizonMonths: number, family: FamilyDef | null): ThesisDriver[] {
  if (hasExplicitDriverParagraphs(rawText)) {
    const explicit = parseExplicitDrivers(rawText, entities, horizonMonths);
    if (explicit.length >= 2) return explicit;
    if (explicit.length === 1 && family) {
      const familyDrivers = buildFamilyDrivers(family, entities, horizonMonths);
      const ids = new Set(explicit.map((d) => d.id));
      const merged = [...explicit, ...familyDrivers.filter((d) => !ids.has(d.id))];
      return merged.slice(0, 4);
    }
  }

  if (family) return buildFamilyDrivers(family, entities, horizonMonths);

  const explicit = parseExplicitDrivers(rawText, entities, horizonMonths);
  if (explicit.length >= 2) return explicit;

  return buildGenericDrivers(rawText, entities, horizonMonths);
}

// ---------------------------------------------------------------------------
// Disproof & hooks (unchanged logic)
// ---------------------------------------------------------------------------

function deriveDisproofConditions(drivers: ThesisDriver[]): DisproofCondition[] {
  return drivers.map((driver) => ({
    id: `disproof_${driver.id}`,
    condition: `The ${driver.category} leg breaks: ${driver.label.toLowerCase()}`,
    driverId: driver.id,
    threshold: "driver score falls below 35%",
    horizon: driver.horizon,
    signals: driver.evidenceKeywords.slice(0, 4),
  }));
}

function sourceTypesForCategory(category: ThesisDriver["category"]): string[] {
  switch (category) {
    case "demand":      return ["transcript", "filing", "reported-news"];
    case "supply":      return ["transcript", "industry-data", "reported-news"];
    case "pricing":     return ["transcript", "industry-data", "market-data"];
    case "competition": return ["transcript", "reported-news", "filing"];
    case "regulation":  return ["filing", "reported-news", "macro"];
    default:            return ["transcript", "filing", "reported-news"];
  }
}

function deriveEvidenceHooks(drivers: ThesisDriver[]): EvidenceHook[] {
  return drivers.flatMap((driver) => [
    {
      id: `hook_confirm_${driver.id}`,
      label: `${driver.label} confirms`,
      driverId: driver.id,
      kind: "confirming" as const,
      entityNames: driver.trackedEntityNames,
      keywords: driver.evidenceKeywords,
      sourceTypes: sourceTypesForCategory(driver.category),
    },
    {
      id: `hook_disconfirm_${driver.id}`,
      label: `${driver.label} weakens`,
      driverId: driver.id,
      kind: "disconfirming" as const,
      entityNames: driver.trackedEntityNames,
      keywords: driver.evidenceKeywords,
      sourceTypes: sourceTypesForCategory(driver.category),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Normalize (unchanged)
// ---------------------------------------------------------------------------

export function normalizeThesisDraft(thesis: ThesisDraft): ThesisDraft {
  const now = new Date().toISOString();
  const sectors = Array.isArray(thesis.sectors) ? [...new Set(thesis.sectors.filter(Boolean))] : [];
  const beneficiaryTickers = Array.isArray(thesis.beneficiaryTickers)
    ? [...new Set(thesis.beneficiaryTickers.filter(Boolean).map((t) => t.toUpperCase()))]
    : [];
  const riskTickers = Array.isArray(thesis.riskTickers)
    ? [...new Set(thesis.riskTickers.filter(Boolean).map((t) => t.toUpperCase()))].filter(
        (t) => !beneficiaryTickers.includes(t)
      )
    : [];
  const entities: ThesisEntity[] = Array.isArray(thesis.entities)
    ? thesis.entities.map((e) => ({
        name: e.name || "",
        type: e.type || "company",
        ticker: e.ticker?.toUpperCase() || undefined,
        role: e.role || undefined,
        description: e.description || "",
      }))
    : [];
  const drivers: ThesisDriver[] = Array.isArray(thesis.drivers)
    ? thesis.drivers
        .filter((d) => d.label || d.description)
        .map((d, i) => ({
          id: d.id || `driver_${i}`,
          label: (d.label || d.description || `Driver ${i + 1}`).slice(0, 84),
          description: (d.description || d.label || `Driver ${i + 1}`).slice(0, 200),
          polarity: d.polarity === "bearish" ? "bearish" : "bullish",
          category: ["demand", "supply", "pricing", "competition", "regulation", "profitability"].includes(d.category)
            ? d.category
            : "demand",
          weight: typeof d.weight === "number" && d.weight > 0 ? d.weight : 0,
          horizon: ["short", "medium", "long"].includes(d.horizon) ? d.horizon : "medium",
          trackedEntityNames: Array.isArray(d.trackedEntityNames)
            ? d.trackedEntityNames.filter(Boolean)
            : [],
          evidenceKeywords: Array.isArray(d.evidenceKeywords)
            ? d.evidenceKeywords.filter(Boolean).slice(0, 8)
            : [],
        }))
    : [];
  const totalWeight = drivers.reduce((s, d) => s + d.weight, 0) || 1;
  const normalizedDrivers = drivers.map((d) => ({ ...d, weight: d.weight / totalWeight }));
  const driverIds = new Set(normalizedDrivers.map((d) => d.id));
  const disproofConditions: DisproofCondition[] = Array.isArray(thesis.disproofConditions)
    ? thesis.disproofConditions
        .filter((dc) => dc.condition && driverIds.has(dc.driverId))
        .map((dc, i) => ({
          id: dc.id || `disproof_${dc.driverId}_${i}`,
          condition: dc.condition,
          driverId: dc.driverId,
          threshold: dc.threshold || "driver score falls below 35%",
          horizon: ["short", "medium", "long"].includes(dc.horizon) ? dc.horizon : "medium",
          signals: Array.isArray(dc.signals) ? dc.signals.filter(Boolean).slice(0, 4) : [],
        }))
    : [];
  const evidenceHooks: EvidenceHook[] = Array.isArray(thesis.evidenceHooks)
    ? thesis.evidenceHooks
        .filter((h) => h.label && driverIds.has(h.driverId))
        .map((h, i) => ({
          id: h.id || `hook_${h.kind || "confirming"}_${h.driverId}_${i}`,
          label: h.label,
          driverId: h.driverId,
          kind: h.kind === "disconfirming" ? "disconfirming" : "confirming",
          entityNames: Array.isArray(h.entityNames) ? h.entityNames.filter(Boolean) : [],
          keywords: Array.isArray(h.keywords) ? h.keywords.filter(Boolean) : [],
          sourceTypes: Array.isArray(h.sourceTypes)
            ? h.sourceTypes.filter((s) =>
                ["transcript", "filing", "reported-news", "industry-data", "macro", "market-data"].includes(s)
              )
            : ["transcript", "filing", "reported-news"],
        }))
    : [];
  const horizonMonths =
    typeof thesis.horizonMonths === "number" && thesis.horizonMonths > 0 && thesis.horizonMonths <= 60
      ? Math.round(thesis.horizonMonths)
      : 12;

  return {
    id: thesis.id || `thesis_${Date.now()}`,
    title: (thesis.title || thesis.summary || "Untitled Thesis").slice(0, 72),
    rawText: thesis.rawText || "",
    summary: (thesis.summary || thesis.rawText || "").slice(0, 180),
    horizonMonths,
    sectors,
    beneficiaryTickers,
    riskTickers,
    entities,
    drivers: normalizedDrivers,
    disproofConditions,
    evidenceHooks,
    createdAt: thesis.createdAt || now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compileThesis(rawText: string, title?: string): ThesisDraft {
  const now = new Date().toISOString();
  const trimmed = rawText.trim();
  const family = detectFamily(trimmed);
  const entities = extractEntities(trimmed, family);
  const horizonMonths = inferHorizonMonths(trimmed);
  const drivers = compileDrivers(trimmed, entities, horizonMonths, family);

  return {
    id: `thesis_${Date.now()}`,
    title: title || titleFromRaw(trimmed, `Thesis ${now.slice(0, 10)}`, family),
    rawText: trimmed,
    summary: deriveSummary(trimmed, family),
    horizonMonths,
    sectors: inferSectors(trimmed, family),
    beneficiaryTickers: inferBeneficiaries(entities),
    riskTickers: inferRisks(entities),
    entities,
    drivers,
    disproofConditions: deriveDisproofConditions(drivers),
    evidenceHooks: deriveEvidenceHooks(drivers),
    createdAt: now,
    updatedAt: now,
  };
}

export function validateThesisDraft(thesis: ThesisDraft): ValidationResult {
  const issues: string[] = [];

  if (thesis.drivers.length === 0) {
    issues.push("Thesis has zero drivers — add at least one bull or bear driver.");
  }

  const weightSum = thesis.drivers.reduce((sum, d) => sum + d.weight, 0);
  if (thesis.drivers.length > 0 && (weightSum < 0.9 || weightSum > 1.1)) {
    issues.push(
      `Driver weights sum to ${weightSum.toFixed(2)} (expected 1.0). Check weight normalization.`
    );
  }

  for (const dc of thesis.disproofConditions) {
    if (!thesis.drivers.some((d) => d.id === dc.driverId)) {
      issues.push(
        `Disproof condition "${dc.id}" references missing driver "${dc.driverId}".`
      );
    }
  }

  for (const hook of thesis.evidenceHooks) {
    if (!thesis.drivers.some((d) => d.id === hook.driverId)) {
      issues.push(
        `Evidence hook "${hook.id}" references missing driver "${hook.driverId}".`
      );
    }
  }

  for (const ticker of thesis.beneficiaryTickers) {
    if (!thesis.entities.some((e) => e.ticker === ticker && e.role !== "risk")) {
      issues.push(
        `Beneficiary ticker "${ticker}" has no matching non-risk entity.`
      );
    }
  }

  for (const ticker of thesis.riskTickers) {
    if (!thesis.entities.some((e) => e.ticker === ticker)) {
      issues.push(
        `Risk ticker "${ticker}" has no matching entity.`
      );
    }
  }

  if (thesis.disproofConditions.length === 0 && thesis.drivers.length > 0) {
    issues.push("Thesis has drivers but zero disproof conditions — every driver should have a falsification path.");
  }

  return { valid: issues.length === 0, issues };
}
