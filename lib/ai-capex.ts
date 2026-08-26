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
    whyItBenefits: "Direct accelerator and rack-scale-system exposure; benefits across GPUs, networking, and software.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 86.5,
    breaksThesis: "Custom ASICs, TPUs, cheaper inference, or a hyperscaler capex slowdown.",
  },
  {
    rank: 2,
    company: "Micron",
    ticker: "MU",
    role: "Memory",
    whyItBenefits: "HBM and DRAM content rises with every high-end AI accelerator.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 92.5,
    breaksThesis: "HBM oversupply or memory prices collapsing after capacity expansion.",
  },
  {
    rank: 3,
    company: "TSMC",
    ticker: "TSM",
    role: "Manufacturing",
    whyItBenefits: "Manufactures advanced chips and packaging for NVIDIA, AMD, and hyperscaler ASICs.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 83.3,
    breaksThesis: "Taiwan risk, yield problems, customer insourcing, or AI demand weakness.",
  },
  {
    rank: 4,
    company: "Broadcom",
    ticker: "AVGO",
    role: "Networking",
    whyItBenefits: "Custom AI ASICs, Ethernet switching, networking silicon, and optical connectivity.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 80.2,
    breaksThesis: "A major customer delays its ASIC program or cuts networking spending.",
  },
  {
    rank: 5,
    company: "Vertiv",
    ticker: "VRT",
    role: "Power & cooling",
    whyItBenefits: "Power distribution, UPS, cooling, and thermal systems become more valuable as rack density rises.",
    stocksbrewLabel: "Not covered",
    coverageNote: "1/3 coverage",
    breaksThesis: "Data-center capex slows or customers shift to competing cooling architectures.",
  },
  {
    rank: 6,
    company: "Lam Research",
    ticker: "LRCX",
    role: "Manufacturing",
    whyItBenefits: "Etch and deposition equipment is needed for advanced logic, HBM, and 3D memory expansion.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 76.6,
    breaksThesis: "The memory capex cycle reverses and Samsung, SK Hynix, or Micron cut orders.",
  },
  {
    rank: 7,
    company: "Arista Networks",
    ticker: "ANET",
    role: "Networking",
    whyItBenefits: "Ethernet switching for large AI clusters; benefits if open networking gains share.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 75.6,
    breaksThesis: "NVIDIA’s proprietary networking wins or hyperscaler capex slows.",
  },
  {
    rank: 8,
    company: "Eaton",
    ticker: "ETN",
    role: "Power & cooling",
    whyItBenefits: "Switchgear, breakers, busways, and power management for data centers and grid upgrades.",
    stocksbrewLabel: "Solid",
    stocksbrewScore: 60.3,
    breaksThesis: "Electrical-equipment orders normalize or projects face permitting delays.",
  },
  {
    rank: 9,
    company: "Microsoft",
    ticker: "MSFT",
    role: "AI platforms",
    whyItBenefits: "Monetizes both Azure compute and enterprise AI/Copilot usage, with substantial funding capacity.",
    stocksbrewLabel: "Strong",
    stocksbrewScore: 81.6,
    breaksThesis: "Copilot adoption disappoints while AI capex damages margins and cash flow.",
  },
  {
    rank: 10,
    company: "Alphabet",
    ticker: "GOOGL",
    role: "AI platforms",
    whyItBenefits: "Google Cloud, Gemini, Search, and internally designed TPUs provide several ways to capture AI value.",
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
    whyItBenefits: "Data-center cooling exposure with a smaller scale than the major infrastructure names.",
  },
  {
    company: "Coherent",
    ticker: "COHR",
    role: "Optical connectivity",
    whyItBenefits: "Optical transceivers and 1.6T connectivity offer high growth with meaningful execution risk.",
  },
  {
    company: "Quanta Services",
    ticker: "PWR",
    role: "Grid infrastructure",
    whyItBenefits: "Grid and transmission construction gives direct exposure to the power bottleneck.",
  },
  {
    company: "Constellation Energy",
    ticker: "CEG",
    role: "Reliable power",
    whyItBenefits: "Nuclear power and reliable generation can support AI campuses.",
    coverageNote: "2/3 coverage",
  },
  {
    company: "Digital Realty",
    ticker: "DLR",
    role: "Data centers",
    whyItBenefits: "Data-center and interconnection rent capture, with rate sensitivity.",
  },
  {
    company: "Equinix",
    ticker: "EQIX",
    role: "Data centers",
    whyItBenefits: "Data-center and interconnection rent capture, with rate sensitivity.",
  },
];
