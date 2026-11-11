/**
 * The subjects a plain-English basket can be about, and how each one is
 * recognised in our data. Pure: no I/O.
 *
 * A subject never names tickers. A company belongs to it because of a field
 * we store: its sector, its industry label, its company name, the role our
 * research themes give it (tm_config/research_themes), or the words of our
 * own research note on it (the screener's `thesis` and `call_reason`). The
 * reason that matched is kept, so every line can say why it is in.
 *
 * The request side (`words`) is matched against the lowercased request. The
 * longer, more specific phrases are listed first in TOPICS so "data center
 * REITs" wins over "REITs".
 */

import type { GicsSector } from "@/lib/gics-sector";

export type TopicId =
  | "ai"
  | "power"
  | "grid"
  | "cooling"
  | "nuclear"
  | "data_centers"
  | "semiconductors"
  | "software"
  | "cybersecurity"
  | "internet"
  | "hardware"
  | "banks"
  | "insurance"
  | "payments"
  | "asset_managers"
  | "exchanges"
  | "oil_gas"
  | "renewables"
  | "defense"
  | "aerospace"
  | "space"
  | "airlines"
  | "robotics"
  | "water"
  | "mining"
  | "copper"
  | "lithium"
  | "chemicals"
  | "biotech"
  | "pharma"
  | "medtech"
  | "health_insurers"
  | "obesity"
  | "retail"
  | "restaurants"
  | "autos"
  | "homebuilders"
  | "reits"
  | "telecom"
  | "media"
  | "video_games"
  | "travel"
  | "transport"
  | "food_drink"
  | "tobacco"
  | "sector_technology"
  | "sector_health_care"
  | "sector_financials"
  | "sector_energy"
  | "sector_utilities"
  | "sector_industrials"
  | "sector_materials"
  | "sector_real_estate"
  | "sector_staples"
  | "sector_discretionary"
  | "sector_communication"
  | "power_demand";

export type ThemeRule = {
  /** A research theme slug, or "*" for any theme. */
  slug: string;
  /** Only lines whose role and reasoning match this. */
  text?: RegExp;
  /** Only lines whose role (the short label, "Power & cooling") matches this. */
  role?: RegExp;
};

export type Topic = {
  id: TopicId;
  /** The subject on its own at the start of a sentence: "Banks", "Power producers". */
  noun: string;
  /** The subject after "companies in": "banking", "power generation". */
  label: string;
  /** The request words that mean this subject. Matched on the lowercased request. */
  words: RegExp;
  sectors?: GicsSector[];
  industry?: RegExp;
  /** Industries that look like a match but are not ("Exchange Traded Fund" for exchanges). */
  industryNot?: RegExp;
  /** Company names that give the subject away ("Bancorp"). */
  names?: RegExp;
  themes?: ThemeRule[];
  /** Words in our own research note on the company. Case-sensitive where the word is an acronym. */
  research?: RegExp;
  /** The read-back when this subject is a condition on another one: "that our research ties to AI demand". */
  tie?: string;
};

export const TOPICS: Topic[] = [
  {
    id: "data_centers",
    noun: "Data-center owners",
    label: "data-center real estate",
    words: /\bdata[- ]?cent(?:er|re)s?\s+(?:reits?|landlords?|owners?|real estate)\b|\bdata[- ]?cent(?:er|re) reits?\b/,
    industry: /data cent(er|re)/i,
    themes: [{ slug: "ai-capex", text: /data cent(er|re)s?\b.*\b(rent|space)|^data centers/i }],
  },
  {
    id: "cooling",
    noun: "Data-center cooling makers",
    label: "data-center cooling",
    words: /\b(?:data[- ]?cent(?:er|re) )?cooling\b|\bthermal management\b/,
    industry: /thermal/i,
    themes: [{ slug: "*", role: /cooling|thermal/i }],
  },
  {
    id: "ai",
    noun: "AI companies",
    label: "AI",
    words: /\b(?:ai|artificial intelligence|machine learning|gen(?:erative)? ?ai|llms?|gpus?|ai[- ]related|ai[- ]exposed|data[- ]?cent(?:er|re)s?)\b/,
    themes: [{ slug: "ai-capex" }, { slug: "*", text: /\bAI\b|data[- ]cent(er|re)s?|artificial intelligence/ }],
    research: /\bAI\b|artificial intelligence|data[- ]cent(?:er|re)s?|\bGPUs?\b|accelerated computing/,
    tie: "that our research ties to AI demand",
  },
  {
    id: "nuclear",
    noun: "Nuclear power and uranium companies",
    label: "nuclear power and uranium",
    words: /\buranium(?: min(?:ers|ing)| companies| stocks)?\b|\bnuclear\b|\bsmrs?\b|\breactors?\b/,
    industry: /uranium|nuclear/i,
    themes: [{ slug: "*", role: /nuclear|uranium/i }, { slug: "*", text: /nuclear (?:plants|reactors|fuel)|\buranium\b/i }],
    research: /\bnuclear\b|\buranium\b/i,
  },
  {
    id: "grid",
    noun: "Grid equipment makers",
    label: "grid equipment",
    words: /\bgrid\b|\belectrical (?:equipment|gear|infrastructure)\b|\btransmission\b|\belectrification\b/,
    industry: /electrical (equipment|components)|electrical equipment & parts|construction & engineering|engineering & construction/i,
    themes: [{ slug: "*", role: /grid|electrical|power & cooling/i }],
  },
  {
    id: "power",
    noun: "Power producers",
    label: "power generation",
    words: /\bpower (?:producers?|generators?|generation|plants?|companies|stocks|names|plays?)\b|(?<!pricing )\bpower\b|\belectricity\b|\bindependent power\b|\bipps?\b/,
    industry: /independent power|electric utilities|utilities - (independent power|renewable|regulated electric)|renewable/i,
    themes: [{ slug: "energy", role: /power|generation|renewables/i }, { slug: "ai-capex", role: /reliable power/i }],
  },
  {
    id: "renewables",
    noun: "Renewable energy companies",
    label: "solar, wind and renewables",
    words: /\bsolar\b|\bwind\b|\brenewables?\b|\bclean energy\b|\bgreen energy\b/,
    industry: /solar|renewable/i,
    themes: [{ slug: "*", text: /renewable|solar|wind/i }],
  },
  {
    id: "oil_gas",
    noun: "Oil and gas companies",
    label: "oil and gas",
    words: /\boil (?:and|&) gas\b|\boil\b|\bnatural gas\b|\blng\b|\bpipelines?\b|\bmidstream\b|\brefiners?\b|\bdrillers?\b|\bfossil fuels?\b/,
    industry: /oil|gas e&p|midstream|refining|integrated oil|exploration & production/i,
    industryNot: /gas utilities/i,
    themes: [{ slug: "energy", text: /natural gas|lng|oil/i }],
  },
  {
    id: "semiconductors",
    noun: "Chipmakers",
    label: "chips",
    words: /\bsemis?\b|\bsemiconductors?\b|\bchips?\b|\bchipmakers?\b|\bfoundr(?:y|ies)\b/,
    industry: /semiconductor/i,
  },
  {
    id: "cybersecurity",
    noun: "Cybersecurity companies",
    label: "cybersecurity",
    words: /\bcyber ?security\b|\bcyber\b|\bsecurity software\b/,
    industry: /cyber ?security/i,
    themes: [{ slug: "cybersecurity" }],
  },
  {
    id: "software",
    noun: "Software companies",
    label: "software",
    words: /\bsoftware\b|\bsaas\b|\bcloud\b/,
    industry: /software/i,
  },
  {
    id: "internet",
    noun: "Internet companies",
    label: "internet services",
    words: /\binternet\b|\bsocial media\b|\bsearch engines?\b|\bonline platforms?\b/,
    industry: /internet content|internet services|interactive media/i,
  },
  {
    id: "hardware",
    noun: "Hardware makers",
    label: "computer and network hardware",
    words: /\bhardware\b|\bservers?\b|\bnetworking\b|\bdata storage\b/,
    industry: /hardware|server|communications? equipment|electronic components|technology distributors/i,
  },
  {
    id: "banks",
    noun: "Banks",
    label: "banking",
    words: /\bbanks?\b|\bbanking\b|\blenders?\b/,
    industry: /\bbank/i,
    industryNot: /asset management|custody/i,
    names: /\bbank\b|\bbancorp|\bbancshares|\bbanc\b/i,
    themes: [{ slug: "financials", role: /bank/i }],
  },
  {
    id: "health_insurers",
    noun: "Health insurers",
    label: "health insurance",
    words: /\bhealth insurers?\b|\bmanaged care\b|\bhealth plans?\b/,
    industry: /healthcare plans|managed health/i,
  },
  {
    id: "insurance",
    noun: "Insurers",
    label: "insurance",
    words: /\binsurers?\b|\binsurance\b|\breinsurers?\b|\bunderwriters?\b/,
    industry: /insurance|reinsurance/i,
    themes: [{ slug: "financials", text: /insurance/i }],
  },
  {
    id: "payments",
    noun: "Payments companies",
    label: "payments",
    words: /\bpayments?\b|\bfintech\b|\bcredit cards?\b/,
    industry: /payment|credit services|transaction|financial technology/i,
    themes: [{ slug: "financials", text: /payment/i }],
  },
  {
    id: "asset_managers",
    noun: "Asset managers",
    label: "asset management",
    words: /\basset managers?\b|\basset management\b|\bprivate equity\b|\bprivate credit\b|\bbrokers?\b|\binvestment banks?\b/,
    industry: /asset management|capital markets/i,
    themes: [{ slug: "financials", text: /asset management|private credit|capital markets/i }],
  },
  {
    id: "exchanges",
    noun: "Exchanges and market-data companies",
    label: "exchanges and market data",
    words: /\bexchanges?\b|\bmarket data\b/,
    industry: /exchange|financial data/i,
    industryNot: /exchange traded fund/i,
    themes: [{ slug: "financials", text: /exchange|futures/i }],
  },
  {
    id: "defense",
    noun: "Defense companies",
    label: "defense",
    words: /\bdefen[cs]e\b|\bmilitary\b|\bweapons?\b|\bmissiles?\b|\bmunitions\b/,
    industry: /aerospace & defen[cs]e|defen[cs]e/i,
    themes: [{ slug: "defense" }],
  },
  {
    id: "space",
    noun: "Space companies",
    label: "space",
    words: /\bspace\b|\bsatellites?\b|\brockets?\b|\borbit(?:al)?\b/,
    themes: [{ slug: "space-infrastructure" }],
  },
  {
    id: "aerospace",
    noun: "Aerospace companies",
    label: "aerospace",
    words: /\baerospace\b|\baircraft\b|\bjet engines?\b/,
    industry: /aerospace/i,
  },
  {
    id: "airlines",
    noun: "Airlines",
    label: "airlines",
    words: /\bairlines?\b|\bair carriers?\b/,
    industry: /airline/i,
  },
  {
    id: "robotics",
    noun: "Robotics and automation companies",
    label: "robotics and automation",
    words: /\brobot(?:s|ics)?\b|\bautomation\b|\bhumanoids?\b/,
    themes: [{ slug: "robotics-automation" }],
  },
  {
    id: "water",
    noun: "Water companies",
    label: "water",
    words: /\bwater(?: utilit(?:y|ies)| companies| stocks)?\b/,
    industry: /water/i,
    themes: [{ slug: "water-infrastructure" }],
  },
  {
    id: "copper",
    noun: "Copper companies",
    label: "copper",
    words: /\bcopper(?: min(?:ers|ing))?\b/,
    industry: /copper/i,
    themes: [{ slug: "critical-materials", text: /copper/i }],
  },
  {
    id: "lithium",
    noun: "Lithium and rare-earth companies",
    label: "lithium and rare earths",
    words: /\blithium\b|\brare earths?\b|\bbattery metals?\b/,
    themes: [{ slug: "critical-materials", text: /lithium|rare earth/i }],
  },
  {
    id: "mining",
    noun: "Miners and metal makers",
    label: "mining and metals",
    words: /\bmin(?:ers|ing)\b|\bmetals?\b|\bgold\b|\bsilver\b|\bsteel\b|\baluminum\b|\bcritical materials\b/,
    industry: /mining|metals|gold|silver|steel|aluminum|copper|uranium/i,
    themes: [{ slug: "critical-materials" }],
  },
  {
    id: "chemicals",
    noun: "Chemical makers",
    label: "chemicals",
    words: /\bchemicals?\b|\bfertili[sz]ers?\b|\bindustrial gases\b/,
    industry: /chemical|fertili[sz]er|industrial gases/i,
  },
  {
    id: "obesity",
    noun: "Obesity and diabetes drugmakers",
    label: "obesity and diabetes drugs",
    words: /\bobesity\b|\bglp-?1s?\b|\bweight[- ]loss\b|\bdiabetes\b/,
    themes: [{ slug: "healthcare", text: /obesity|glp|diabetes|metabolic/i }],
    research: /\bobesity\b|\bGLP-?1\b|weight[- ]loss|diabetes/i,
  },
  {
    id: "biotech",
    noun: "Biotech companies",
    label: "biotech",
    words: /\bbiotechs?\b|\bbiotechnology\b/,
    industry: /biotech/i,
  },
  {
    id: "pharma",
    noun: "Drugmakers",
    label: "drugmaking",
    words: /\bpharma(?:ceuticals?)?\b|\bdrug ?makers?\b|\bdrug companies\b|\bdrugs\b/,
    industry: /drug manufacturers|pharmaceutical/i,
  },
  {
    id: "medtech",
    noun: "Medical device makers",
    label: "medical devices",
    words: /\bmedical devices?\b|\bmedtech\b|\bmedical equipment\b|\bdiagnostics\b/,
    industry: /medical (devices|instruments|equipment)|health ?care equipment|health ?care supplies|diagnostics/i,
  },
  {
    id: "restaurants",
    noun: "Restaurant chains",
    label: "restaurants",
    words: /\brestaurants?\b|\bfast food\b/,
    industry: /restaurant/i,
  },
  {
    id: "retail",
    noun: "Retailers",
    label: "retail",
    words: /\bretail(?:ers?)?\b|\bstores?\b|\be-?commerce\b|\bshops?\b/,
    industry: /retail|discount stores|department stores/i,
  },
  {
    id: "autos",
    noun: "Carmakers and auto-parts makers",
    label: "cars and auto parts",
    words: /\bauto(?:s|makers?|mobiles?)?\b|\bcar ?makers?\b|\bcars\b|\bauto parts\b/,
    industry: /auto/i,
  },
  {
    id: "homebuilders",
    noun: "Homebuilders and building-products makers",
    label: "homebuilding and building products",
    words: /\bhome ?builders?\b|\bhousing\b|\bbuilding products\b|\bconstruction materials\b/,
    industry: /homebuilding|residential construction|building products|construction materials/i,
  },
  {
    id: "reits",
    noun: "Real estate investment trusts",
    label: "real estate investment trusts",
    words: /\breits?\b|\blandlords?\b|\breal estate investment trusts?\b/,
    industry: /reit/i,
  },
  {
    id: "telecom",
    noun: "Telecom companies",
    label: "telecoms",
    words: /\btelecoms?\b|\btelcos?\b|\bwireless carriers?\b|\bcable\b|\bbroadband\b/,
    industry: /telecom|wireless|cable/i,
  },
  {
    id: "video_games",
    noun: "Video game companies",
    label: "video games",
    words: /\bvideo ?games?\b|\bgaming\b|\besports\b/,
    industry: /interactive home entertainment|electronic gaming/i,
  },
  {
    id: "media",
    noun: "Media and entertainment companies",
    label: "media and entertainment",
    words: /\bmedia\b|\bstreaming\b|\bentertainment\b|\bmovies?\b|\bmusic\b/,
    industry: /entertainment|broadcasting|publishing|media/i,
    industryNot: /interactive home entertainment/i,
  },
  {
    id: "travel",
    noun: "Travel and leisure companies",
    label: "travel and leisure",
    words: /\btravel\b|\bhotels?\b|\bcruises?\b|\bleisure\b|\bcasinos?\b/,
    industry: /travel|hotel|lodging|cruise|casino|resorts/i,
  },
  {
    id: "transport",
    noun: "Railroads, truckers and logistics companies",
    label: "railroads, trucking and logistics",
    words: /\brail(?:roads?|ways?)?\b|\btrucking\b|\blogistics\b|\bshipping\b|\bfreight\b|\btransport(?:ation)?\b/,
    industry: /rail|trucking|freight|logistics|marine shipping|transportation/i,
  },
  {
    id: "food_drink",
    noun: "Food and drink companies",
    label: "food and drink",
    words: /\bfood\b|\bbeverages?\b|\bdrinks?\b|\bsnacks?\b|\bgrocer(?:s|y|ies)\b/,
    industry: /food|beverage|packaged|distillers|brewers|grocery|agricultural products/i,
  },
  {
    id: "tobacco",
    noun: "Tobacco companies",
    label: "tobacco",
    words: /\btobacco\b|\bcigarettes?\b/,
    industry: /tobacco/i,
  },
  // Whole sectors come last: a narrower subject in the same request wins.
  {
    id: "sector_technology",
    noun: "Technology companies",
    label: "technology",
    words: /\btech(?:nology)?\b|\binformation technology\b/,
    sectors: ["Technology"],
  },
  {
    id: "sector_health_care",
    noun: "Health care companies",
    label: "health care",
    words: /\bhealth ?care\b|\bmedical\b|\bhealth\b/,
    sectors: ["Health Care"],
  },
  {
    id: "sector_financials",
    noun: "Financial companies",
    label: "financials",
    words: /\bfinancials?\b|\bfinancial services\b|\bfinance\b/,
    sectors: ["Financials"],
  },
  {
    id: "sector_energy",
    noun: "Energy companies",
    label: "energy",
    words: /\benergy\b/,
    sectors: ["Energy"],
  },
  {
    id: "sector_utilities",
    noun: "Utilities",
    label: "utilities",
    words: /\butilit(?:y|ies)\b/,
    sectors: ["Utilities"],
  },
  {
    id: "sector_industrials",
    noun: "Industrial companies",
    label: "industrials",
    words: /\bindustrials?\b|\bmanufactur(?:ers?|ing)\b|\bmachinery\b/,
    sectors: ["Industrials"],
  },
  {
    id: "sector_materials",
    noun: "Materials companies",
    label: "materials",
    words: /\bmaterials\b|\bcommodit(?:y|ies)\b/,
    sectors: ["Materials"],
  },
  {
    id: "sector_real_estate",
    noun: "Real estate companies",
    label: "real estate",
    words: /\breal estate\b|\bproperty (?:companies|stocks|owners)\b/,
    sectors: ["Real Estate"],
  },
  {
    id: "sector_staples",
    noun: "Consumer staples companies",
    label: "consumer staples",
    words: /\bconsumer staples\b|\bstaples\b|\bdefensive consumer\b/,
    sectors: ["Consumer Staples"],
  },
  {
    id: "sector_discretionary",
    noun: "Consumer discretionary companies",
    label: "consumer discretionary",
    words: /\bconsumer discretionary\b|\bdiscretionary\b|\bconsumer\b/,
    sectors: ["Consumer Discretionary"],
  },
  {
    id: "sector_communication",
    noun: "Communication services companies",
    label: "communication services",
    words: /\bcommunication services\b|\bcommunications\b/,
    sectors: ["Communication Services"],
  },
];

TOPICS.push({
  // Never typed on its own: "AI power" reads as power, grid and cooling companies with this tie.
  id: "power_demand",
  noun: "Companies tied to AI and power demand",
  label: "AI and power demand",
  words: /(?!)/,
  themes: [{ slug: "ai-capex" }, { slug: "energy", role: /power|generation|grid|electrical|thermal|renewables/i }],
  research: /\bAI\b|artificial intelligence|data[- ]cent(?:er|re)s?|electricity demand|power demand/,
  tie: "that our research ties to AI or to rising electricity demand",
});

export const TOPIC_BY_ID: ReadonlyMap<TopicId, Topic> = new Map(TOPICS.map((topic) => [topic.id, topic]));
export const TOPIC_IDS = TOPICS.map((topic) => topic.id) as [TopicId, ...TopicId[]];

/**
 * "AI power stocks", "power for AI", "AI energy plays": the person means the
 * companies that supply electricity to AI, which is wider than generators.
 */
export const AI_POWER_WORDS =
  /\bai[- ](?:power|energy|electricity|infrastructure power)\b|\b(?:power|energy|electricity) (?:for|behind|to) (?:ai|data[- ]?cent(?:er|re)s)\b|\bdata[- ]?cent(?:er|re) (?:power|energy|electricity)\b/;
export const AI_POWER_TOPICS: TopicId[] = ["power", "grid", "cooling"];

/* ── matching one company to one subject ─────────────────────────────────── */

export type ThemeLine = { slug: string; theme: string; role: string; text: string };

/** What we know about a company for subject matching. */
export type TopicFacts = {
  name: string | null;
  sector: string | null;
  industry: string | null;
  /** The research-theme lines the company appears on. */
  themes: ThemeLine[];
  /** Our research note on it: thesis and call reason. */
  research: string | null;
};

export type TopicHit = {
  topic: TopicId;
  /** For a research-theme match: the theme's name and the role it gives the company, so two hits can be told as one. */
  theme?: { name: string; role: string };
  /** Which stored field made it a match. */
  via: "theme" | "industry" | "name" | "research" | "sector";
  /** A clause for the "why it's in" line: "our AI capex research lists it for power and cooling". */
  clause: string;
};

/** "Banks - Diversified" as "diversified banks", "Utilities - Independent Power Producers" as "independent power producers". */
export function industryWords(industry: string): string {
  const [head, tail] = industry.split(/\s+-\s+/);
  if (!tail) return industry.toLowerCase();
  return (tail.trim().split(/\s+/).length === 1 ? `${tail} ${head}` : tail).toLowerCase();
}

function lowerFirst(text: string): string {
  return text && /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}

/** Whether a company belongs to a subject, and why. The strongest reason wins: our research, then the industry label. */
export function matchTopic(topic: Topic, facts: TopicFacts): TopicHit | null {
  for (const rule of topic.themes ?? []) {
    const line = facts.themes.find(
      (item) =>
        (rule.slug === "*" || item.slug === rule.slug) &&
        (!rule.text || rule.text.test(`${item.role} ${item.text}`)) &&
        (!rule.role || rule.role.test(item.role)),
    );
    if (line) {
      return { topic: topic.id, via: "theme", theme: { name: line.theme, role: line.role }, clause: `our ${line.theme} research lists it for ${lowerFirst(line.role)}` };
    }
  }
  const industry = (facts.industry ?? "").trim();
  if (topic.industry && industry && topic.industry.test(industry) && !(topic.industryNot && topic.industryNot.test(industry))) {
    return { topic: topic.id, via: "industry", clause: `it is in ${industryWords(industry)}` };
  }
  if (topic.names && facts.name && topic.names.test(facts.name)) {
    return { topic: topic.id, via: "name", clause: `by its name, it is one of the ${topic.noun.toLowerCase()}` };
  }
  if (topic.research && facts.research && topic.research.test(facts.research)) {
    return { topic: topic.id, via: "research", clause: `our research note on it talks about ${topic.label}` };
  }
  if (topic.sectors && facts.sector && (topic.sectors as string[]).includes(facts.sector)) {
    return { topic: topic.id, via: "sector", clause: `it is in the ${facts.sector.toLowerCase()} sector` };
  }
  return null;
}
