import {
  AI_CAPEX_BENEFICIARIES,
  AI_CAPEX_WATCHLIST,
  type AiCapexBeneficiary,
  type AiCapexWatchItem,
} from "@/lib/ai-capex";

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

function aiCandidate(row: AiCapexBeneficiary): ThemeCandidate {
  return {
    company: row.company,
    ticker: row.ticker,
    role: row.role,
    benefitMechanism: row.whyItBenefits,
    failureCase: row.breaksThesis,
    stocksbrewLabel: row.stocksbrewLabel,
    stocksbrewScore: row.stocksbrewScore,
    coverageNote: row.coverageNote,
  };
}

function aiWatchCandidate(row: AiCapexWatchItem): ThemeCandidate {
  return {
    company: row.company,
    ticker: row.ticker,
    role: row.role,
    benefitMechanism: row.whyItBenefits,
    failureCase:
      "Execution risk, slower customer spending, or a weaker capex cycle.",
    stocksbrewLabel: "Not covered",
    coverageNote: row.coverageNote,
  };
}

export const INVESTMENT_THEMES: InvestmentTheme[] = [
  {
    slug: "ai-capex",
    name: "AI capex",
    cardDescription:
      "The compute, memory, networking, power, and platform layer behind the AI buildout.",
    description:
      "A research map of the public companies exposed to AI infrastructure spending, from accelerators and memory to power, cooling, and software monetization.",
    resilienceNote:
      "NVIDIA, memory, and networking are tightly linked to AI spending. Power, electrical equipment, and reliable generation can benefit from broader infrastructure demand even if AI progress slows.",
    candidates: AI_CAPEX_BENEFICIARIES.map(aiCandidate),
    watchlist: AI_CAPEX_WATCHLIST.map(aiWatchCandidate),
    resources: [],
  },
  {
    slug: "energy",
    name: "Energy",
    cardDescription:
      "Electricity demand, grid bottlenecks, nuclear reliability, natural gas, and infrastructure buildout.",
    description:
      "The strongest energy angle is bigger than oil prices: power demand is colliding with a slow-moving grid, creating opportunities across generation, transmission, equipment, fuel, and gas infrastructure.",
    resilienceNote:
      "CEG, PWR, ETN, and VST can benefit even if AI progress slows because grid reliability and electricity infrastructure have wider demand drivers. MOD, GEV, and other data-center-linked names are more exposed to an AI-capex digestion cycle.",
    candidates: [
      {
        company: "Constellation Energy",
        ticker: "CEG",
        role: "Reliable power",
        benefitMechanism:
          "Existing nuclear fleet can supply reliable power to AI data centers.",
        catalyst: "Long-term power contracts and demand for firm generation.",
        failureCase:
          "Contracts fail to produce attractive margins or nuclear outages increase.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 69.8,
      },
      {
        company: "Quanta Services",
        ticker: "PWR",
        role: "Grid infrastructure",
        benefitMechanism:
          "Builds transmission, substations, and grid infrastructure required for new power demand.",
        catalyst:
          "$44B backlog and roughly 70% of revenue from utility and power work.",
        failureCase:
          "Permitting and interconnection delays slow backlog conversion.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "Eaton",
        ticker: "ETN",
        role: "Electrical equipment",
        benefitMechanism:
          "Sells switchgear, breakers, busways, and power-management systems.",
        catalyst: "Data-center and grid-upgrade orders compound over time.",
        failureCase:
          "Data-center and electrical orders normalize after overbuilding.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 60.3,
      },
      {
        company: "GE Vernova",
        ticker: "GEV",
        role: "Generation and grid",
        benefitMechanism:
          "Gas turbines, grid equipment, and electrification systems support rising power demand.",
        catalyst: "Turbine, grid, and electrification backlog conversion.",
        failureCase:
          "Turbine orders are delayed or renewable and storage economics improve faster.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "Vistra",
        ticker: "VST",
        role: "Dispatchable generation",
        benefitMechanism:
          "Dispatchable generation and retail power exposure create leverage to scarcity pricing.",
        catalyst:
          "Power scarcity and a recovery after a roughly 19% one-month drawdown.",
        failureCase: "High leverage and falling power prices damage cash flow.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 64.3,
      },
      {
        company: "Cameco",
        ticker: "CCJ",
        role: "Nuclear fuel",
        benefitMechanism:
          "Uranium supply supports the expected expansion of nuclear power.",
        catalyst: "Long-cycle nuclear demand and uranium contracting.",
        failureCase: "Nuclear projects remain delayed or uranium prices fall.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "NextEra Energy",
        ticker: "NEE",
        role: "Renewables and storage",
        benefitMechanism:
          "Large renewable, storage, and utility-development platform.",
        catalyst:
          "Renewable deployment, storage growth, and utility investment.",
        failureCase: "Higher rates and project costs reduce renewable returns.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 63.8,
      },
      {
        company: "Williams",
        ticker: "WMB",
        role: "Natural gas",
        benefitMechanism:
          "Natural-gas pipelines can supply gas-fired generation and industrial load.",
        catalyst:
          "Growing gas demand from power generation and industrial projects.",
        failureCase:
          "Gas demand disappoints or regulation limits new infrastructure.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "Cheniere Energy",
        ticker: "LNG",
        role: "LNG exports",
        benefitMechanism:
          "LNG export capacity benefits from global gas demand and power scarcity.",
        catalyst: "Export growth and global demand for flexible gas supply.",
        failureCase: "LNG prices fall or export growth is restricted.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "Modine Manufacturing",
        ticker: "MOD",
        role: "Thermal management",
        benefitMechanism:
          "Thermal-management and cooling systems support high-density data centers.",
        catalyst: "Data-center cooling demand and higher rack density.",
        failureCase:
          "Customers adopt competing cooling designs or capex slows.",
        stocksbrewLabel: "Not covered",
      },
    ],
    watchlist: [],
    resources: [
      { label: "Volts", href: "https://www.volts.wtf/" },
      {
        label: "Columbia Energy Policy",
        href: "https://www.energypolicy.columbia.edu/podcasts/",
      },
      {
        label: "Catalyst with Shayle Kann",
        href: "https://www.canarymedia.com/podcasts/catalyst",
      },
      {
        label: "The Energy Gang",
        href: "https://www.woodmac.com/podcasts/the-energy-gang/",
      },
    ],
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    cardDescription:
      "GLP-1s, diagnostics, life-sciences software, devices, and drug-development infrastructure.",
    description:
      "Healthcare combines structural demand with very different risk profiles: recurring software and diagnostics, procedure growth, drug pipelines, and payer economics.",
    resilienceNote:
      "The key failure modes are drug-price regulation, clinical failures, payer pressure, patent cliffs, and GLP-1 competition. DXCM, VEEV, and TMO offer a more balanced research starting point than the highest-multiple drug and robotics names.",
    candidates: [
      {
        company: "Eli Lilly",
        ticker: "LLY",
        role: "Obesity and diabetes",
        benefitMechanism:
          "Obesity and diabetes drugs, especially the GLP-1 franchise, expand into a huge metabolic-health market.",
        catalyst: "Capacity expansion and new obesity indications.",
        failureCase:
          "Pricing pressure, safety issues, or stronger competition.",
        stocksbrewLabel: "Strong",
        stocksbrewScore: 76.8,
        evidence: "P/E 42.9",
      },
      {
        company: "Dexcom",
        ticker: "DXCM",
        role: "Metabolic monitoring",
        benefitMechanism:
          "Continuous glucose monitoring expands beyond insulin users and into metabolic health.",
        catalyst: "New product launches and broader reimbursement.",
        failureCase: "Insurance restrictions or cheaper competing sensors.",
        stocksbrewLabel: "Strong",
        stocksbrewScore: 78.1,
        evidence: "$29B market cap",
      },
      {
        company: "Veeva Systems",
        ticker: "VEEV",
        role: "Life-sciences software",
        benefitMechanism:
          "Life-sciences software benefits from digitized trials, compliance, and AI workflows.",
        catalyst: "Vault expansion and AI-enabled workflows.",
        failureCase:
          "Pharma customers reduce software spending or build internally.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 72.3,
        evidence: "P/E 30.8",
      },
      {
        company: "Intuitive Surgical",
        ticker: "ISRG",
        role: "Robotic surgery",
        benefitMechanism:
          "Robotic surgery adoption increases procedure volume and recurring instrument revenue.",
        catalyst: "More procedures, systems, and international adoption.",
        failureCase:
          "Hospitals delay capital purchases or cheaper robots gain share.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 66.2,
        evidence: "P/E 40.5",
      },
      {
        company: "Thermo Fisher",
        ticker: "TMO",
        role: "Research tools",
        benefitMechanism:
          "Instruments, reagents, and services support drug development and biotech labs.",
        catalyst: "Biotech funding and pharma R&D recovery.",
        failureCase: "Weak biotech funding or lab-budget cuts.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 61.1,
        evidence: "P/E 28.7",
      },
      {
        company: "Novo Nordisk",
        ticker: "NVO",
        role: "GLP-1 franchise",
        benefitMechanism:
          "Wegovy, Ozempic, and Rybelsus give Novo broad global obesity and diabetes exposure.",
        catalyst: "Oral obesity drugs and manufacturing capacity.",
        failureCase:
          "Lilly competition, pricing pressure, or disappointing trial data.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "UnitedHealth",
        ticker: "UNH",
        role: "Managed care",
        benefitMechanism:
          "An aging population supports healthcare-services demand across insurance and care delivery.",
        catalyst: "Medical-cost normalization and Optum growth.",
        failureCase:
          "Medical-cost inflation, regulation, or reimbursement cuts.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 56.1,
        evidence: "P/E 31.6",
      },
      {
        company: "Abbott",
        ticker: "ABT",
        role: "Devices and diagnostics",
        benefitMechanism:
          "Diagnostics, medical devices, diabetes monitoring, and nutrition diversify the growth engine.",
        catalyst: "Device and glucose-monitoring growth.",
        failureCase: "Product recalls or slower device growth.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 56.8,
        evidence: "P/E 32.3",
      },
      {
        company: "Regeneron",
        ticker: "REGN",
        role: "Biologic medicines",
        benefitMechanism:
          "Biologic medicines and an oncology and eye-care pipeline create multiple shots on goal.",
        catalyst: "Pipeline approvals and label expansion.",
        failureCase: "Clinical failures or biosimilar erosion.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "CVS Health",
        ticker: "CVS",
        role: "Integrated care",
        benefitMechanism:
          "Insurance, pharmacy, and healthcare delivery integration can compound when costs are controlled.",
        catalyst: "Cost-control and insurance-margin recovery.",
        failureCase: "Weak Medicare Advantage economics or debt pressure.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 55.5,
        evidence: "P/E 46.3",
      },
    ],
    watchlist: [],
    resources: [
      {
        label: "The Peter Attia Drive",
        href: "https://peterattiamd.com/podcast/",
      },
      { label: "STAT", href: "https://www.statnews.com/" },
      { label: "BioCentury", href: "https://www.biocentury.com/" },
      { label: "The Readout LO", href: "https://www.biopharmadive.com/" },
    ],
  },
  {
    slug: "defense",
    name: "Defense",
    cardDescription:
      "Missile replenishment, air defense, cyber, autonomy, space, and long-duration programs.",
    description:
      "Defense spending is moving through missiles, air defense, naval programs, cyber, intelligence, autonomy, and space rather than a single equipment cycle.",
    resilienceNote:
      "Political budget changes, fixed-price contract losses, procurement delays, labor shortages, and export restrictions remain the main risks. NOC, CACI, and GD offer a quality and value starting point; KTOS, AVAV, and PLTR carry more beta.",
    candidates: [
      {
        company: "RTX",
        ticker: "RTX",
        role: "Missiles and engines",
        benefitMechanism:
          "Missiles, air defense, avionics, and Pratt & Whitney engines cover several defense demand pools.",
        catalyst: "Missile replenishment and defense-budget growth.",
        failureCase: "Engine problems, delays, or cost overruns.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 67.8,
        evidence: "P/E 37.9",
      },
      {
        company: "Northrop Grumman",
        ticker: "NOC",
        role: "Strategic systems",
        benefitMechanism:
          "Strategic deterrence, space, missile defense, and autonomous systems provide long-duration program exposure.",
        catalyst: "Long-duration U.S. defense programs.",
        failureCase: "Program cancellations or execution problems.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 66.2,
        evidence: "P/E 17.0",
      },
      {
        company: "CACI International",
        ticker: "CACI",
        role: "Cyber and intelligence",
        benefitMechanism:
          "Intelligence, cyber, electronic warfare, and mission software support modern defense operations.",
        catalyst: "Government contract wins and acquisitions.",
        failureCase: "Contract delays or budget cuts.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 66.0,
        evidence: "P/E 18.2",
      },
      {
        company: "General Dynamics",
        ticker: "GD",
        role: "Naval and land systems",
        benefitMechanism:
          "Submarines, armored vehicles, munitions, and IT services diversify defense exposure.",
        catalyst: "Submarine and munitions demand.",
        failureCase: "Shipbuilding delays and labor shortages.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 64.9,
        evidence: "P/E 24.0",
      },
      {
        company: "Kratos Defense",
        ticker: "KTOS",
        role: "Autonomy and hypersonics",
        benefitMechanism:
          "Drones, hypersonics, missile systems, and autonomous platforms offer high-beta program exposure.",
        catalyst: "Drone and hypersonic program awards.",
        failureCase:
          "High valuation with weak profitability or program delays.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 63.3,
        evidence: "P/E 258",
      },
      {
        company: "Lockheed Martin",
        ticker: "LMT",
        role: "Missiles and space",
        benefitMechanism:
          "Missiles, air defense, F-35, space, and hypersonics anchor strategic programs.",
        catalyst: "Missile replenishment and allied rearmament.",
        failureCase: "Slow growth, fixed-price contracts, or budget pressure.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 57.8,
        evidence: "P/E 21.0",
      },
      {
        company: "AeroVironment",
        ticker: "AVAV",
        role: "Small drones",
        benefitMechanism:
          "Small drones and loitering munitions connect battlefield lessons to procurement demand.",
        catalyst: "Battlefield-proven drone demand.",
        failureCase: "Competition, procurement delays, or weak margins.",
        stocksbrewLabel: "Mixed",
        stocksbrewScore: 49.7,
      },
      {
        company: "Palantir",
        ticker: "PLTR",
        role: "Defense software",
        benefitMechanism:
          "AI-enabled defense and intelligence software can spread across U.S. and allied customers.",
        catalyst: "U.S. government and allied adoption.",
        failureCase:
          "Extreme valuation or customers choosing internal systems.",
        stocksbrewLabel: "Strong",
        stocksbrewScore: 76.1,
        evidence: "P/E 138",
      },
      {
        company: "Huntington Ingalls",
        ticker: "HII",
        role: "Naval shipbuilding",
        benefitMechanism:
          "Nuclear submarines, carriers, and naval shipbuilding support fleet modernization.",
        catalyst: "Submarine and fleet-modernization spending.",
        failureCase: "Shipyard delays, labor shortages, or contract penalties.",
        stocksbrewLabel: "Not covered",
      },
      {
        company: "BWX Technologies",
        ticker: "BWXT",
        role: "Nuclear systems",
        benefitMechanism:
          "Nuclear reactors, naval propulsion, and advanced nuclear components support strategic programs.",
        catalyst: "Naval nuclear demand and microreactors.",
        failureCase: "Program delays or cost overruns.",
        stocksbrewLabel: "Not covered",
      },
    ],
    watchlist: [],
    resources: [
      { label: "War on the Rocks", href: "https://warontherocks.com/" },
      { label: "CSIS podcasts", href: "https://www.csis.org/podcasts" },
      {
        label: "Defense & Aerospace Report",
        href: "https://defaeroreport.com/",
      },
      { label: "The OODAcast", href: "https://oodaloop.com/podcasts/" },
    ],
  },
  {
    slug: "financials",
    name: "Financials",
    cardDescription:
      "Exchanges, payments, asset managers, private credit, and diversified banking platforms.",
    description:
      "Financial infrastructure earns from the flow of money: payments, trading, clearing, data, capital markets, asset gathering, and lending at scale.",
    resilienceNote:
      "Credit losses, a yield-curve reversal, commercial-real-estate stress, regulation, and funding-market problems are the main cross-theme risks. V, MA, and ICE lead on quality; JPM, GS, and COF lead on valuation; BX and BLK connect to infrastructure financing.",
    candidates: [
      {
        company: "Intercontinental Exchange",
        ticker: "ICE",
        role: "Exchanges and data",
        benefitMechanism:
          "Exchanges, data, clearing, and mortgage infrastructure monetize financial activity in several ways.",
        catalyst: "Trading volumes, data growth, and mortgage recovery.",
        failureCase: "Lower volatility or regulatory pressure.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 71.1,
        evidence: "P/E 22.5",
      },
      {
        company: "Visa",
        ticker: "V",
        role: "Digital payments",
        benefitMechanism:
          "Digital-payment volume grows with global consumption and the shift away from cash.",
        catalyst: "Cross-border payments and cash-to-card conversion.",
        failureCase: "Interchange regulation or new payment rails.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 68.9,
        evidence: "P/E 32.1",
      },
      {
        company: "Mastercard",
        ticker: "MA",
        role: "Digital payments",
        benefitMechanism:
          "Commercial payments, cross-border spending, and network effects compound across the global economy.",
        catalyst: "Commercial payments and international spending.",
        failureCase: "Regulation or wallet and instant-payment competition.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 68.8,
        evidence: "P/E 32.6",
      },
      {
        company: "Goldman Sachs",
        ticker: "GS",
        role: "Capital markets",
        benefitMechanism:
          "Capital markets, trading, investment banking, and private credit benefit from deal activity.",
        catalyst: "IPO and M&A recovery with higher trading activity.",
        failureCase: "Credit losses or weak deal activity.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 61.7,
        evidence: "P/E 15.1",
      },
      {
        company: "JPMorgan",
        ticker: "JPM",
        role: "Diversified banking",
        benefitMechanism:
          "Scale banking, payments, cards, and investment banking create a broad earnings platform.",
        catalyst: "Strong credit quality and capital-markets recovery.",
        failureCase: "Recession, loan losses, or falling net-interest income.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 60.0,
        evidence: "P/E 14.8",
      },
      {
        company: "CME Group",
        ticker: "CME",
        role: "Futures and options",
        benefitMechanism:
          "Volatility and rate uncertainty increase futures, options, and clearing volumes.",
        catalyst: "Higher trading volumes and new contracts.",
        failureCase: "Calm markets or exchange-fee pressure.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 60.4,
        evidence: "P/E 22.5 · 65.6% operating margin",
      },
      {
        company: "Blackstone",
        ticker: "BX",
        role: "Private credit",
        benefitMechanism:
          "Private credit and infrastructure financing capture growth in data centers and real assets.",
        catalyst: "Fundraising and infrastructure AUM growth.",
        failureCase:
          "Higher defaults, weak realizations, or fundraising slowdown.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 63.4,
        evidence: "P/E 29.0",
      },
      {
        company: "BlackRock",
        ticker: "BLK",
        role: "Asset management",
        benefitMechanism:
          "ETF, index, private-market, and infrastructure assets scale on a global distribution platform.",
        catalyst: "ETF and private-credit inflows.",
        failureCase: "Fee compression or a broad market decline.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 63.2,
        evidence: "P/E 25.9",
      },
      {
        company: "Capital One",
        ticker: "COF",
        role: "Consumer lending",
        benefitMechanism:
          "Consumer lending and the Discover integration create potential scale benefits.",
        catalyst: "Integration synergies and credit normalization.",
        failureCase: "Consumer defaults or integration problems.",
        stocksbrewLabel: "Solid",
        stocksbrewScore: 58.7,
        evidence: "P/E 11.2",
      },
      {
        company: "Berkshire Hathaway",
        ticker: "BRK.B",
        role: "Insurance and capital",
        benefitMechanism:
          "Insurance float, cash, diversified operating businesses, and optionality create a durable financial base.",
        catalyst: "Capital deployment after large cash accumulation.",
        failureCase: "Poor succession execution or weak insurance results.",
        stocksbrewLabel: "Insufficient data",
      },
    ],
    watchlist: [],
    resources: [
      { label: "Odd Lots", href: "https://www.bloomberg.com/oddlots" },
      { label: "Capitalisn’t", href: "https://capitalisnt.com/" },
      { label: "The Meb Faber Show", href: "https://mebfaber.com/podcast/" },
      {
        label: "CME podcasts",
        href: "https://www.cmegroup.com/education/podcasts.html",
      },
    ],
  },
];

export const INVESTMENT_THEME_MAP = new Map(
  INVESTMENT_THEMES.map((theme) => [theme.slug, theme]),
);

export function getInvestmentTheme(slug: string): InvestmentTheme | null {
  return INVESTMENT_THEME_MAP.get(slug.toLowerCase()) ?? null;
}
