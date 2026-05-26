import { compileThesis } from "./compiler";
import { assessEvidence, updateThesisScore } from "./tracker";
import type { EvidenceItem } from "./types";

const SEMICONDUCTOR_THESIS_RAW = `
Semiconductor demand will expand structurally over the next 2 years because AI infrastructure spend is still early, not late.
NVIDIA, TSMC, and Micron should benefit because hyperscaler capex, GPU shipments, HBM pricing, and advanced packaging demand all remain strong.
Bear case: custom ASIC adoption, export controls, or a capex digestion cycle could weaken the thesis before the 2-year payoff fully shows up.
`;

const DEMO_EVIDENCE: EvidenceItem[] = [
  {
    id: "ev_1",
    source: "Microsoft Earnings Call",
    sourceType: "transcript",
    headline: "Microsoft raises FY capex and says AI demand remains above available capacity",
    summary:
      "Management said datacenter capacity is still constrained and AI infrastructure demand continues to outstrip supply despite aggressive capex additions.",
    date: "2026-05-21",
    entities: ["Microsoft", "NVIDIA", "AI Infrastructure"],
    tags: ["capex", "demand", "datacenter"],
  },
  {
    id: "ev_2",
    source: "Micron Earnings Call",
    sourceType: "transcript",
    headline: "Micron says HBM output is largely sold through next year at healthy pricing",
    summary:
      "Management highlighted strong HBM pricing, tight supply, and improving margins tied to AI memory demand.",
    date: "2026-05-19",
    entities: ["Micron", "HBM", "Semiconductors"],
    tags: ["hbm", "pricing", "allocation"],
  },
  {
    id: "ev_3",
    source: "TSMC Industry Update",
    sourceType: "industry-data",
    headline: "TSMC CoWoS expansion cuts lead times but foundry utilization remains elevated",
    summary:
      "Advanced packaging capacity is expanding, but customer demand still supports strong utilization and backlog levels.",
    date: "2026-05-17",
    entities: ["TSMC", "CoWoS", "Semiconductors"],
    tags: ["capacity", "utilization", "lead times"],
  },
  {
    id: "ev_4",
    source: "Reuters",
    sourceType: "reported-news",
    headline: "Broadcom wins another custom AI silicon program with a large hyperscaler",
    summary:
      "The new program adds to concern that custom ASIC adoption could absorb some inference workloads that might otherwise go to merchant GPUs.",
    date: "2026-05-14",
    entities: ["Broadcom", "AI Infrastructure"],
    tags: ["competition", "asic", "inference"],
  },
  {
    id: "ev_5",
    source: "US Commerce Update",
    sourceType: "filing",
    headline: "Fresh export restrictions tighten advanced AI chip licensing",
    summary:
      "The new rule expands licensing requirements for advanced accelerators sold into additional geographies, creating a new regulatory overhang.",
    date: "2026-05-11",
    entities: ["NVIDIA", "Semiconductors"],
    tags: ["export controls", "regulation", "china"],
  },
];

const compiled = compileThesis(SEMICONDUCTOR_THESIS_RAW, "Semiconductor Demand Expansion Thesis");
const relevanceResults = assessEvidence(compiled, DEMO_EVIDENCE);
const score = updateThesisScore(compiled, relevanceResults);

export const seedThesis = compiled;
export const seedEvidence = DEMO_EVIDENCE;
export const seedAssessment = relevanceResults;
export const seedScore = score;
