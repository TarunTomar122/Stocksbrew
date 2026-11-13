/**
 * The idea baskets' book (/themes/[slug]) in one line per company: what it does for the idea and what would break it,
 * at most 15 words and LINE_CHARS characters, one complete sentence that fits one line at 1280 (owner rule 8). Each is written from that theme's reviewed reason and failure
 * case (backend/config/research_themes_seed.json `benefitMechanism` and `failureCase`, and the live tm_config theme
 * for companies the weekly refresh added: CSCO, GMED, ADSK, ITRI, ITT, and LMT, BA and NOC in space) and adds no claim
 * they do not make. A company appears in two themes with two lines, since its part differs ("CEG" in AI capex and in energy).
 */
export const BOOK_LINES: Record<string, Record<string, string>> = {
  "ai-capex": {
    NVDA: "Sells the chips that run AI; custom chips or slower spending hurt.",
    MU: "Makes the fast memory AI needs; an oversupply would sink prices.",
    TSM: "Makes the advanced chips for NVIDIA and AMD; Taiwan is the risk.",
    AVGO: "Sells AI networking and custom chips; a client's delay would sting.",
    VRT: "Powers and cools AI servers; slower data-center spending hurts.",
    LRCX: "Sells chip-making tools; memory makers cutting orders hurts it.",
    ANET: "Its switches link AI clusters, unless NVIDIA's networking wins.",
    ETN: "Brings power to each data-center rack; slowing orders would hurt.",
    MSFT: "Earns from Azure AI and software; weak Copilot uptake is the risk.",
    GOOGL: "Earns from Cloud, Gemini and chips; AI answers could eat search.",
    MOD: "Makes data-center cooling, a smaller AI bet that capex cuts hit.",
    COHR: "Makes optics that link AI servers; slower spending would hit it.",
    PWR: "Builds the power lines new data centers need, so it rides capex.",
    CEG: "Its nuclear plants can sell steady electricity to AI campuses.",
    DLR: "Rents data-center space to AI builders; a capex slowdown hurts.",
    EQIX: "Rents data-center space and connections; capex cuts would hurt.",
  },
  energy: {
    CEG: "Runs nuclear plants with steady output; outages are the risk.",
    PWR: "Builds lines and substations for new power; permits slow it down.",
    ETN: "Sells power gear to buildings and data centers; orders may fade.",
    GEV: "Sells turbines and grid gear; delayed orders would hurt.",
    VST: "Earns more when power is scarce; its debt makes price drops hurt.",
    CCJ: "Supplies uranium and reactor fuel; nuclear delays would hurt.",
    NEE: "Builds renewables, batteries and grid links; high rates hurt.",
    WMB: "Runs gas pipelines to power plants; weak gas demand is the risk.",
    LNG: "Exports liquefied gas; lower LNG prices or export limits hurt.",
    MOD: "Cools dense data centers; rival designs or slower capex hurt.",
  },
  healthcare: {
    LLY: "Sells popular weight-loss drugs; pricing or safety issues hurt.",
    DXCM: "Makes glucose monitors; insurance limits or cheaper rivals hurt.",
    VEEV: "Runs the software for drug trials; pharma budget cuts would hurt.",
    ISRG: "Each surgical robot drives repeat sales, unless hospitals wait.",
    TMO: "Sells lab tools for new medicines; weak biotech funding hurts.",
    NVO: "Sells weight-loss drugs worldwide; Lilly and pricing are the risk.",
    UNH: "Gains as more people need insurance, if it keeps costs in check.",
    ABT: "Sells devices, tests and nutrition; recalls would hurt.",
    REGN: "Has several drugs in late stages, so one flop won't sink it.",
    CVS: "Combines insurance and pharmacies; Medicare costs are the risk.",
  },
  defense: {
    RTX: "Makes missiles, air defense and engines; engine flaws are the risk.",
    NOC: "Holds long deterrence and space contracts; cancellations would hurt.",
    CACI: "Sells cyber and intelligence services; budget cuts would slow it.",
    GD: "Builds submarines and armored vehicles; shipyard delays hurt.",
    KTOS: "Makes drones and hypersonics; thin profits and delays are the risk.",
    LMT: "Makes missiles and fighter jets; fixed-price contracts weigh on it.",
    AVAV: "Makes small drones armies keep buying; competition would hurt.",
    PLTR: "Sells data and AI software for defense; its valuation is the risk.",
    HII: "Builds nuclear ships and carriers; shipyard delays hurt.",
    BWXT: "Makes naval reactors and nuclear parts; delays would hurt.",
  },
  financials: {
    ICE: "Runs exchanges, data and clearing; calm markets or rules slow it.",
    V: "Earns as payments move off cash; fee rules or new rails threaten it.",
    MA: "Earns on card spending, most of all abroad; regulation is the risk.",
    GS: "Gains when companies raise money and make deals; slow deals hurt.",
    JPM: "Earns from lending, cards, payments and deals; a recession hurts.",
    CME: "Earns when investors hedge with futures, so calm markets hurt.",
    BX: "Invests in private credit and infrastructure; defaults would hurt.",
    BLK: "Earns fees as money flows into ETFs; fee cuts or a market fall hurt.",
    COF: "Gains scale from Discover's network; consumer defaults would hurt.",
    "BRK.B": "Has insurance cash and many businesses; succession is the question.",
  },
  cybersecurity: {
    PANW: "Swaps many security vendors for one, unless buyers resist bundles.",
    CRWD: "Sells cloud security that customers renew; an outage could hurt.",
    FTNT: "Sells firewalls that block attacks; cloud-native rivals could win.",
    ZS: "Checks users and devices in the cloud; delayed projects would hurt.",
    OKTA: "Controls who logs in to apps; breaches or Microsoft slow it down.",
    NET: "Keeps apps fast and safe on one network; price wars are the risk.",
    GEN: "Sells antivirus and privacy plans; churn or free tools hurt.",
    S: "Stops attacks on devices, but loses money against bundled rivals.",
    RBRK: "Recovers data after ransomware; built-in cloud recovery would hurt.",
    QLYS: "Finds weak spots for compliance; broad platforms could replace it.",
    CSCO: "Sells network gear with security on top; cloud rivals could win.",
  },
  "robotics-automation": {
    TER: "Makes chip testers and factory robots; weak chip testing hurts.",
    ROK: "Makes systems that run factories; slower spending delays upgrades.",
    PATH: "Automates office work, which AI-native tools could displace.",
    CGNX: "Makes cameras that inspect products; customers pausing would hurt.",
    SYM: "Builds automated warehouses; a few big customers are the risk.",
    ISRG: "Installed robots drive repeat sales; rival systems could gain share.",
    HON: "Sells automation for factories and aircraft; slow orders hurt.",
    EMR: "Keeps plants running with automation; deferred projects would hurt.",
    ZBRA: "Makes scanners that track inventory; delayed upgrades are the risk.",
    DE: "Sells self-driving farm gear; weak farm income delays purchases.",
    GMED: "Makes spine surgery robots; hospitals delaying purchases would hurt.",
    ADSK: "Sells design and planning software; spending cuts would hurt.",
  },
  "water-infrastructure": {
    XYL: "Sells pumps, treatment and meters; tight city budgets slow it.",
    ECL: "Helps factories use less water; softer volumes or pushback hurt.",
    PNR: "Sells pumps and filters for pools and homes; weak housing hurts.",
    WTS: "Makes valves and water-safety gear; a building slowdown would hurt.",
    AWK: "Runs regulated water networks; capped returns or high rates hurt.",
    AOS: "Sells water heaters people replace; weak housing would hurt.",
    MWA: "Makes hydrants and valves for old city pipes; delays would hurt.",
    BMI: "Makes smart meters that find leaks; slower adoption would hurt.",
    TTEK: "Designs water and cleanup projects; slower awards hold it back.",
    WMS: "Makes stormwater pipes; less building or costlier resin hurts.",
    ITRI: "Makes meters that track use and leaks; delayed rollouts hurt.",
    ITT: "Makes industrial and water pumps; weaker project spending hurts.",
  },
  "critical-materials": {
    FCX: "Mines copper for grids and EVs; cheaper copper hits it directly.",
    SCCO: "Runs long-lived copper mines; politics or permits could hurt.",
    MP: "Builds a U.S. rare-earth magnet supply; Chinese pricing is the risk.",
    ALB: "Sells lithium for EV batteries; low lithium prices are the risk.",
    LAC: "Is building a big U.S. lithium mine; setbacks could dilute holders.",
    CCJ: "Mines uranium as utilities plan more nuclear; delays would hurt.",
    UEC: "Owns U.S. uranium projects that could restart; dilution is a risk.",
    CENX: "Runs U.S. aluminum smelters; higher power costs squeeze margins.",
    TECK: "Mines copper and zinc; weak metal prices or project slips hurt.",
    SQM: "Produces lithium and iodine at scale; a lithium glut would hurt.",
  },
  "space-infrastructure": {
    RKLB: "Launches satellites and builds parts; a launch setback is the risk.",
    IRDM: "Runs a global satellite network; costly replacements are the risk.",
    ASTS: "Builds satellites to reach phones; missed milestones would hurt.",
    PL: "Sells frequent pictures of Earth; slow commercial demand hurts.",
    RDW: "Makes power systems for spacecraft; debt strains its cash.",
    LUNR: "Delivers equipment to the Moon; a failed mission leaves gaps.",
    BKSY: "Sells fast satellite images for defense; costs could outrun deals.",
    VSAT: "Sells satellite internet; debt and low-orbit rivals hurt.",
    SPIR: "Sells weather and tracking data from orbit; costs could outrun it.",
    LHX: "Makes space sensors and secure links; shifting priorities hurt.",
    LMT: "Makes satellites and missile-warning systems; overruns would hurt.",
    BA: "Runs spacecraft and launch programs; delays and losses hurt.",
    NOC: "Makes spacecraft and propulsion; delays would squeeze margins.",
  },
};

/** What has to hold for each idea, in one sentence of at most 15 words, from its reviewed `resilienceNote`. */
export const THESIS_HOLDS: Record<string, string> = {
  "ai-capex": "Chips and networking ride AI spending; power gear has wider demand if it slows.",
  energy: "Power demand keeps growing past AI, and grids get built fast enough.",
  healthcare: "Drug pricing stays workable, trials keep paying off and GLP-1 rivals don't undercut.",
  defense: "Budgets keep growing, fixed-price contracts stay profitable and procurement keeps moving.",
  financials: "Credit stays sound, the yield curve holds and regulation doesn't tighten.",
  cybersecurity: "Demand is durable; consolidation, breaches and rich valuations decide the winners.",
  "robotics-automation": "Automation compounds for years, but industrial cycles make orders uneven.",
  "water-infrastructure": "Spending is durable; project timing, budgets and rates shape near-term returns.",
  "critical-materials": "Scarcity gives pricing power, but commodity cycles and dilution keep it volatile.",
  "space-infrastructure": "Government contracts give real demand; launch failures and dilution keep risk high.",
};

/** Most words in a book line or the thesis's "what has to hold". */
export const LINE_WORDS = 15;

/** Most characters in a book line, so it sits on one line in the book's column at 1280 (about 560px at 14px). */
export const LINE_CHARS = 68;

export function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The book line for one company: ours for a company the theme had when we wrote them (its business does not change
 * with a weekly refresh of the wording), else the theme's own reason, whole and never cut.
 */
export function bookLine(slug: string, candidate: { ticker: string; benefitMechanism: string }): string {
  return BOOK_LINES[slug]?.[candidate.ticker.trim().toUpperCase()] ?? candidate.benefitMechanism.trim();
}

/** "What has to hold" for a theme: ours, else the first sentence of the theme's own note. */
export function thesisHolds(slug: string, note: string): string {
  const ours = THESIS_HOLDS[slug];
  if (ours) return ours;
  const clean = note.replace(/\s+/g, " ").trim();
  return clean.split(/(?<=[a-z0-9%)][.!?])\s+(?=[A-Z])/)[0] ?? clean;
}
