export type AiCapexRole =
  | "Compute"
  | "Memory"
  | "Manufacturing"
  | "Networking"
  | "Power & cooling"
  | "AI platforms"
  | "Cooling"
  | "Optical connectivity"
  | "Grid infrastructure"
  | "Reliable power"
  | "Data centers";

export type AiCapexBeneficiary = {
  rank: number;
  company: string;
  ticker: string;
  role: AiCapexRole;
  whyItBenefits: string;
  breaksThesis: string;
  stocksbrewLabel: string;
  stocksbrewScore?: number;
  coverageNote?: string;
};

export type AiCapexWatchItem = {
  company: string;
  ticker: string;
  role: AiCapexRole;
  whyItBenefits: string;
  coverageNote?: string;
};

export const AI_CAPEX_BENEFICIARIES: AiCapexBeneficiary[] = [
  {
    rank: 1,
    company: "NVIDIA",
    ticker: "NVDA",
    role: "Compute",
    whyItBenefits: "NVIDIA sells the chips and complete systems that power today’s AI data centers.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 86.5,
    breaksThesis: "Custom ASICs, TPUs, cheaper inference, or a hyperscaler capex slowdown.",
  },
  {
    rank: 2,
    company: "Micron",
    ticker: "MU",
    role: "Memory",
    whyItBenefits: "Micron supplies the high-speed memory AI chips need to process large models.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 92.5,
    breaksThesis: "HBM oversupply or memory prices collapsing after capacity expansion.",
  },
  {
    rank: 3,
    company: "TSMC",
    ticker: "TSM",
    role: "Manufacturing",
    whyItBenefits: "TSMC makes advanced chips and packages them for NVIDIA, AMD, and custom AI processors.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 83.3,
    breaksThesis: "Taiwan risk, yield problems, customer insourcing, or AI demand weakness.",
  },
  {
    rank: 4,
    company: "Broadcom",
    ticker: "AVGO",
    role: "Networking",
    whyItBenefits: "Broadcom helps AI data centers connect their chips with fast networking and custom processors.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 80.2,
    breaksThesis: "A major customer delays its ASIC program or cuts networking spending.",
  },
  {
    rank: 5,
    company: "Vertiv",
    ticker: "VRT",
    role: "Power & cooling",
    whyItBenefits: "Vertiv keeps dense AI servers running with power, cooling, and backup systems.",
    stocksbrewLabel: "Not covered",
    coverageNote: "1/3 coverage",
    breaksThesis: "Data-center capex slows or customers shift to competing cooling architectures.",
  },
  {
    rank: 6,
    company: "Lam Research",
    ticker: "LRCX",
    role: "Manufacturing",
    whyItBenefits: "Lam Research sells the factory equipment used to make advanced chips and memory.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 76.6,
    breaksThesis: "The memory capex cycle reverses and Samsung, SK Hynix, or Micron cut orders.",
  },
  {
    rank: 7,
    company: "Arista Networks",
    ticker: "ANET",
    role: "Networking",
    whyItBenefits: "Arista sells the fast Ethernet switches that connect servers inside large AI clusters.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 75.6,
    breaksThesis: "NVIDIA’s proprietary networking wins or hyperscaler capex slows.",
  },
  {
    rank: 8,
    company: "Eaton",
    ticker: "ETN",
    role: "Power & cooling",
    whyItBenefits: "Eaton supplies the electrical gear data centers need to bring power safely to each rack.",
    stocksbrewLabel: "Solid",
    stocksbrewScore: 60.3,
    breaksThesis: "Electrical-equipment orders normalize or projects face permitting delays.",
  },
  {
    rank: 9,
    company: "Microsoft",
    ticker: "MSFT",
    role: "AI platforms",
    whyItBenefits: "Microsoft can earn from both the Azure servers running AI and the software businesses buy.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 81.6,
    breaksThesis: "Copilot adoption disappoints while AI capex damages margins and cash flow.",
  },
  {
    rank: 10,
    company: "Alphabet",
    ticker: "GOOGL",
    role: "AI platforms",
    whyItBenefits: "Alphabet can make money from AI through Google Cloud, Gemini, Search, and its own chips.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 75.8,
    breaksThesis: "AI answers reduce profitable search activity faster than Cloud and Gemini grow.",
  },
];
export const AI_CAPEX_WATCHLIST: AiCapexWatchItem[] = [
  {
    company: "Modine",
    ticker: "MOD",
    role: "Cooling",
    whyItBenefits: "Modine makes cooling equipment for data centers, giving it a smaller but direct AI link.",
  },
  {
    company: "Coherent",
    ticker: "COHR",
    role: "Optical connectivity",
    whyItBenefits: "Coherent makes optical parts that move data quickly between AI servers.",
  },
  {
    company: "Quanta Services",
    ticker: "PWR",
    role: "Grid infrastructure",
    whyItBenefits: "Quanta builds the power lines and grid equipment needed for new data centers.",
  },
  {
    company: "Constellation Energy",
    ticker: "CEG",
    role: "Reliable power",
    whyItBenefits: "Constellation’s nuclear plants can provide steady electricity to power-hungry AI campuses.",
    coverageNote: "2/3 coverage",
  },
  {
    company: "Digital Realty",
    ticker: "DLR",
    role: "Data centers",
    whyItBenefits: "Digital Realty rents out data-center space and connections to companies building AI capacity.",
  },
  {
    company: "Equinix",
    ticker: "EQIX",
    role: "Data centers",
    whyItBenefits: "Equinix rents out data-center space and connections to companies building AI capacity.",
  },
];
