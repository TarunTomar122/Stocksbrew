/**
 * A risk heading as a topic of one to three words, by plain rules (no model): the first category whose keywords or
 * phrases the heading has, from a fixed list, in the list's order (the specific and the serious first). A heading that
 * names a deal, a spin-off or an approval by its own name says that name ("ENTRA1 deal", "SDA approval"). A heading
 * that fits no category is named by its own opening words ("Investors' ability"); nothing is invented. Pure: safe on
 * the client.
 *
 * Serious topics (a material weakness, going concern doubt, delisting, a restatement, a government investigation) are
 * marked so the page can show them first and in the warning tone.
 */

export type TopicIcon =
  | "alert"
  | "lock"
  | "shield"
  | "chip"
  | "globe"
  | "flag"
  | "truck"
  | "wrench"
  | "coins"
  | "bank"
  | "scale"
  | "capitol"
  | "badge"
  | "users"
  | "person"
  | "target"
  | "split"
  | "merge"
  | "percent"
  | "pulse"
  | "drop"
  | "exchange"
  | "leaf"
  | "book"
  | "tag"
  | "star"
  | "server"
  | "cart"
  | "doc";

export type TopicId =
  | "internal_controls"
  | "going_concern"
  | "delisting"
  | "restatement"
  | "investigation"
  | "ai"
  | "cyber"
  | "privacy"
  | "china"
  | "tariffs"
  | "geopolitics"
  | "spin_off"
  | "deals"
  | "approval"
  | "product_quality"
  | "supply_chain"
  | "losses"
  | "debt"
  | "cash"
  | "accounting"
  | "dilution"
  | "dividends"
  | "buybacks"
  | "governance"
  | "share_price"
  | "ip"
  | "litigation"
  | "key_people"
  | "workforce"
  | "customers"
  | "government_contracts"
  | "competition"
  | "rates"
  | "currency"
  | "taxes"
  | "climate"
  | "disasters"
  | "reputation"
  | "it_systems"
  | "demand"
  | "economy"
  | "regulation"
  | "third_parties"
  | "pricing"
  | "fraud"
  | "seasonality"
  | "crypto"
  | "credit"
  | "own_words";

type Category = {
  id: Exclude<TopicId, "own_words">;
  label: string;
  icon: TopicIcon;
  /** Shown first and in the warning tone. */
  serious?: boolean;
  /** Said with the name the heading gives it ("ENTRA1 deal"). */
  named?: string;
  /** Any one of these. */
  match: RegExp | RegExp[];
};

/**
 * In order: the first that matches wins. Serious ones lead; then the specific (AI, China, a spin-off) before the broad
 * (regulation, the economy), which catch almost anything.
 */
const CATEGORIES: Category[] = [
  { id: "internal_controls", label: "Material weakness", icon: "alert", serious: true, match: /\bmaterial weakness/i },
  { id: "going_concern", label: "Going concern", icon: "alert", serious: true, match: /\bcontinue as a going concern\b|\bgoing concern (?:doubt|qualification|opinion|warning)/i },
  { id: "delisting", label: "Delisting", icon: "alert", serious: true, match: /\bdelist|\bcontinued listing\b|\bcomply with (?:the )?(?:\w+ )?listing (?:standards|requirements|rules)\b/i },
  { id: "restatement", label: "Restatement", icon: "alert", serious: true, match: /\brestatements? of (?:our|its|the|previously|prior)\b|\b(?:the|our|its) restatement\b|\brestat(?:e|ed) (?:our|its|the|previously|prior) (?:previously )?(?:issued )?financial|\bnon-reliance\b/i },
  {
    id: "investigation",
    label: "Investigations",
    icon: "alert",
    serious: true,
    match: /\b(?:government(?:al)?|regulatory|federal|criminal|DOJ|SEC)\s+(?:investigations?|inquir(?:y|ies)|probes?)\b|\bDepartment of Justice\b|\bWells notice\b|\b(?:is|are|was|were|been|become) (?:the )?subject (?:of|to) (?:an? |ongoing )?(?:investigation|inquiry)|\binvestigations? (?:by|from) (?:the )?(?:SEC|DOJ|government)/i,
  },
  { id: "internal_controls", label: "Internal controls", icon: "lock", match: /\binternal controls?\b|\bdisclosure controls\b/i },
  { id: "ai", label: "AI", icon: "chip", match: /\bAI\b|\bartificial intelligence\b|\bmachine learning\b|\bgenerative\b|\blarge language model/i },
  { id: "cyber", label: "Cybersecurity", icon: "shield", match: /\bcyber|\bsecurity (?:breach|incident|vulnerabilit)|\bdata breach|\bransomware|\bhack(?:er|ers|ing|ed|s)?\b|\bunauthori[sz]ed access\b|\bmalicious\b/i },
  { id: "privacy", label: "Data privacy", icon: "lock", match: /\bprivacy\b|\bpersonal (?:data|information)\b|\bdata protection\b/i },
  { id: "china", label: "China", icon: "flag", match: /\bChina\b|\bChinese\b|\bPRC\b|\bTaiwan\b|\bHong Kong\b/ },
  { id: "tariffs", label: "Tariffs & trade", icon: "globe", match: /\btariff|\btrade (?:polic|restriction|war|barrier|agreement|dispute|protection)|\bexport (?:control|restriction|regulation|licens)|\bimport (?:dut|restriction|measure)|\bimported goods\b/i },
  { id: "geopolitics", label: "War & geopolitics", icon: "globe", match: /\bgeopolitic|\b(?<!price |trade )wars?\b|\bmilitary conflict|\barmed conflict|\bhostilities\b|\bterroris|\bUkraine\b|\bRussia\b|\bIsrael\b|\bMiddle East\b/i },
  { id: "accounting", label: "Accounting", icon: "book", match: /\baccounting\b|\baccounted for\b|\bgoodwill\b|\bimpairment|\bwrite[- ]?downs?\b/i },
  { id: "buybacks", label: "Buybacks", icon: "exchange", match: /\b(?:share|stock) repurchas|\brepurchase (?:program|plan|authori)|\bbuy-?backs?\b/i },
  { id: "workforce", label: "Workforce", icon: "users", match: /\blabor (?:dispute|shortage|cost|relation|union|price)|\bunion activit|\bunioni[sz]|\bwork stoppage|\bstrikes\b/i },
  {
    id: "dilution",
    label: "Dilution",
    icon: "percent",
    match: /\bdilut|\bfuture (?:sales|issuances?) of (?:our )?(?:shares|common stock|class a|securities|equity)|\bwarrants?\b|\boptions will become exercisable|\bequity offering|\bissu(?:e|ance) (?:or sale )?of (?:additional )?(?:shares|equity|common stock|preferred stock)|\bsales of (?:a substantial number of )?(?:our )?(?:shares|common stock)/i,
  },
  { id: "spin_off", label: "Spin-off", icon: "split", named: "spin-off", match: /\bspin[- ]?off\b|\bseparation from\b|\bseparat(?:e|ed|ion) (?:into|of) (?:two|the)\b/i },
  {
    id: "deals",
    label: "Deals",
    icon: "merge",
    named: "deal",
    match: [
      /\bacqui(?:re|res|red|ring|sition|sitions)\b|\bmergers?\b|\bjoint ventures?\b|\bbusiness combination\b|\bdivest|\bstrategic (?:transaction|partnership|alliance|investment)s?\b|\bintegrat(?:e|ing|ion) (?:the|of|acquired)\b|\b(?:proposed|pending|the) transactions? (?:is|are|may|with|could|will)\b|\bpurchase agreement\b|\bsynergies\b/i,
      // A transaction the filer names (the Cox Transactions, the PMA with ENTRA1).
      /\b(?!Related\b|Capped\b|Call\b)[A-Z][\w&-]* Transactions?\b|\bthe Transaction\b|\bPMA with\b/,
    ],
  },
  {
    id: "approval",
    label: "Product approval",
    icon: "badge",
    named: "approval",
    match: /\bapprov(?:al|als|e|ed)\b.*\b(?:FDA|NRC|regulator|application|product|drug|candidate|license)|\b(?:FDA|NRC|EMA)\b|\bclinical (?:trial|stud|development)|\bmarketing authori[sz]ation|\bregulatory (?:approval|clearance|review)|\bapplications? may not be approved\b/i,
  },
  { id: "product_quality", label: "Product defects", icon: "wrench", match: /\bdefect|\brecall|\bproduct liability|\bwarrant(?:y|ies) (?:claim|reserve|cost)|\bquality (?:issue|problem|control|management)|\bproduct quality\b/i },
  { id: "third_parties", label: "Third parties", icon: "users", match: /\b(?:rely|relies|reliance|dependent|depend|depends)\b[^.]*\bthird[- ]part(?:y|ies)\b/i },
  {
    id: "supply_chain",
    label: "Supply chain",
    icon: "truck",
    match: /\bsuppl(?:y|ier|iers)\b|\braw materials?\b|\bcomponents?\b|\bsole[- ]source|\bsingle[- ]source|\bshortages?\b|\blogistics\b|\bthird[- ]party manufactur|\bcontract manufactur|\bmanufacturing (?:capacity|partner|facilit|operation)/i,
  },
  { id: "losses", label: "Losses", icon: "coins", match: /\bnet loss|\bhistory of (?:net )?loss|\bincurred (?:significant )?(?:net )?loss|\b(?:achieve|maintain|sustain) profitab|\bnot (?:be )?profitable\b|\bnever (?:been|be) profitable/i },
  {
    id: "debt",
    label: "Debt",
    icon: "bank",
    match: /\bindebtedness\b|\bdebt\b|\bconvertible notes?\b|\bnotes due\b|\bcredit (?:facilit|agreement|rating)|\bcovenants?\b|\bguarantees? (?:of|under|and other)\b|\bfinancial obligations\b|\bborrow|\bleverage (?:ratio|levels?)\b|\bhighly leveraged\b|\brefinanc|\bdowngrade/i,
  },
  {
    id: "cash",
    label: "Cash & funding",
    icon: "coins",
    match: /\bcash (?:outlay|burn|flow|position|requirement|need|resource)|\badditional (?:capital|funds|funding|financing)\b|\braise (?:additional )?(?:capital|funds)\b|\bliquidity\b|\bfunding\b|\baccess to capital\b|\bcapital (?:markets|requirements)\b/i,
  },
  { id: "dividends", label: "Dividends", icon: "coins", match: /\bdividends?\b/i },
  {
    id: "governance",
    label: "Governance",
    icon: "scale",
    match: /\banti-takeover\b|\btakeover\b|\bchange (?:in|of) control\b|\bcertificate of incorporation\b|\bbylaws\b|\bcharter\b|\bexclusive forum\b|\bforum (?:selection|provision)|\bCourt of Chancery\b|\bDelaware law\b|\bmulti-class\b|\bdual-class\b|\bvoting (?:power|control)\b|\bcontrolling (?:stockholder|shareholder)|\bcontrolled company\b|\bOrganizational Documents\b|\bactivis[mt]|\bproxy contest|\bTax Receivable Agreement\b|\bstockholders' ability\b|\bconflicts? of interest\b/i,
  },
  {
    id: "share_price",
    label: "Share price",
    icon: "pulse",
    match: /\b(?:stock|share|market|trading) prices?\b|\bprice of (?:our )?(?:common stock|class a|shares|securities)|\btrading volume\b|\bshort (?:sell|seller)|\bsecurities analysts\b|\bactive trading market\b|\btransactions in our securities\b/i,
  },
  { id: "ip", label: "Patents & IP", icon: "tag", match: /\bintellectual property\b|\bpatents?\b|\btrademarks?\b|\btrade secrets?\b|\bproprietary (?:technology|information|rights)|\binfring/i },
  { id: "litigation", label: "Litigation", icon: "scale", match: /\blitigation\b|\blawsuits?\b|\blegal (?:proceedings|claims|actions|matters)|\bclass action|\bjudicial\b|\barbitration\b/i },
  {
    id: "key_people",
    label: "Key people",
    icon: "person",
    match: /\bkey (?:personnel|employees|executives|management|members)\b|\b(?:attract|retain|recruit)\b.*\b(?:personnel|employees|executives|talent|management)\b|\bfounder\b|\bchief executive\b|\bsenior management\b|\bexecutive officers\b|\bloss of (?:the services of|any of our|our)\b.*\b(?:officers?|executives?|personnel)\b/i,
  },
  { id: "workforce", label: "Workforce", icon: "users", match: /\bworkforce\b|\blabor (?:dispute|shortage|cost|relation|union)|\bunions?\b|\bstrikes?\b|\bemployees\b|\bstaffing\b|\btalent\b/i },
  {
    id: "customers",
    label: "Key customers",
    icon: "target",
    match: /\b(?:small|limited|few|concentrated) number of (?:customers|clients|partners|distributors|counterparties|payors)|\b(?:significant|largest|major|key) customers?\b|\bcustomer concentration\b|\bconcentration of (?:sales|revenue|customers)|\b(?:depend(?:s|ence|ent)?|reliant|rel(?:y|ies)) (?:up)?on (?:a few|a small|a limited|one|a single)\b/i,
  },
  { id: "government_contracts", label: "Government contracts", icon: "capitol", match: /\bgovernment (?:contract|customer|shutdown|spending|funding|budget|program)s?\b|\bfederal (?:budget|government|funding|contract)|\bU\.S\. government\b|\bNASA\b|\bDepartment of Defense\b|\bDoD\b/i },
  { id: "competition", label: "Competition", icon: "users", match: /\bcompetit|\bcompete\b|\brivals?\b|\bdominance\b|\bmarket share\b/i },
  { id: "rates", label: "Interest rates", icon: "percent", match: /\binterest rates?\b/i },
  { id: "currency", label: "Currency", icon: "exchange", match: /\bcurrenc|\bforeign exchange\b|\bexchange rates?\b|\bU\.S\. dollar\b/i },
  { id: "taxes", label: "Taxes", icon: "doc", match: /\btax(?:es|ation|ing)?\b/i },
  { id: "climate", label: "Climate & ESG", icon: "leaf", match: /\bclimate\b|\bESG\b|\benvironmental, social\b|\bsustainability\b|\bcarbon\b|\bemissions?\b/i },
  { id: "disasters", label: "Disasters & health", icon: "drop", match: /\bpandemic|\bepidemic|\bpublic health\b|\bnatural disaster|\bCOVID|\bcatastroph|\bweather\b|\bwildfire|\bearthquake/i },
  { id: "crypto", label: "Crypto", icon: "coins", match: /\bbitcoin|\bdigital assets?\b|\bblockchain|\bcrypto/i },
  { id: "credit", label: "Credit risk", icon: "bank", match: /\bcredit risks?\b|\bcollect (?:our )?receivables\b|\bloan (?:losses|portfolio)|\bloans? (?:are|is) concentrated|\bcounterparty risk/i },
  { id: "pricing", label: "Pricing", icon: "tag", match: /\bpricing\b|\bprice (?:pressure|competition|controls|reductions)/i },
  { id: "fraud", label: "Fraud", icon: "shield", match: /\bfraud/i },
  { id: "seasonality", label: "Seasonality", icon: "pulse", match: /\bseasonal/i },
  { id: "reputation", label: "Reputation", icon: "star", match: /\breputation|\bbrand\b|\bbrands\b|\bpublicity\b|\bsocial media\b/i },
  { id: "it_systems", label: "IT systems", icon: "server", match: /\binformation (?:technology|systems)\b|\bIT (?:systems|infrastructure)\b|\bsystems? (?:failure|disruption|outage)|\boutages?\b|\binfrastructure\b|\bdata centers?\b/i },
  {
    id: "demand",
    label: "Demand",
    icon: "cart",
    match: /\bdemand for\b|\bconsumer (?:demand|spending|preferences)|\bmarket (?:acceptance|adoption)|\badoption of\b|\bmarket for (?:our|the)\b|\bfail to grow\b|\bgrowth (?:may|could|rate)|\bnew products?\b|\bproduct (?:introductions|launches|transitions)\b/i,
  },
  { id: "economy", label: "Economy", icon: "pulse", match: /\beconom(?:y|ic)\b|\brecession\b|\binflation\b|\bmarket conditions\b|\bdownturn/i },
  { id: "regulation", label: "Regulation", icon: "capitol", match: /\bregulat|\blaws?\b|\blegislat|\bcompliance\b|\bgovernment(?:al)? (?:action|polic|approval|oversight)|\bpolicies\b|\bantitrust\b/i },
];

export type Topic = {
  id: TopicId;
  /** One to three words, sentence case. */
  label: string;
  icon: TopicIcon;
  serious: boolean;
  /** The heading as filed. */
  heading: string;
};

// Capitalised words a heading uses that never name a counterparty: defined terms ("the Merger", "the Closing"),
// regulators and exchanges, and the filer's own titles.
const GENERIC = new Set(
  (
    "U.S. U.S US SEC NYSE Nasdaq NASDAQ FDA NRC EMA AI IT ESG CEO CFO IPO PMA LLC Inc Corp Corporation Company Class Common Stock " +
    "Board Directors Federal Act Agreement Agreements Transaction Transactions Merger Mergers Acquisition Acquisitions Closing " +
    "Effective Time Combined Parent Notes Note Series Delaware United States Chief Executive Officer Our The We If Any Binding " +
    "Organizational Documents Credit Facility Plan Program Shares Share Warrants Options Units Unit Business Businesses Holdings"
  ).split(" "),
);
const DEAL_WORDS = /^(?:transaction|transactions|acquisition|acquisitions|merger|mergers|agreement|deal|deals|pma|partnership|investment|divestiture|divestitures|sale|combination|spin-off|separation)$/i;

/** Most words of four or more letters start with a capital. */
function isTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]{4,}/.test(word));
  if (words.length < 3) return false;
  return words.filter((word) => /^[A-Z][a-z]/.test(word)).length / words.length >= 0.6;
}

export type TopicOptions = {
  /** The filer's name: its own words are never the counterparty. */
  company?: string;
  /** Whether a capitalised word is an ordinary word (server callers pass the word list in ./casing.ts). */
  ordinary?: (word: string) => boolean;
};

/**
 * The name a heading gives its counterparty or product: a run of capitalised words (or a token with a digit, like
 * ENTRA1) that is not an ordinary word, not the heading's first word, and not a generic name (SEC, Class A, the
 * Company). "The PMA with ENTRA1 may result…" → "ENTRA1"; "Our proposed transaction with Ligado…" → "Ligado";
 * "…the acquisition of ZT Systems…" → "ZT Systems". Null when there is none.
 */
export function entityOf(heading: string, options: TopicOptions = {}): string | null {
  const company = options.company ?? "";
  const own = new Set(company.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2));
  const runs: string[][] = [];
  let run: string[] = [];
  const close = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  heading.split(/\s+/).forEach((raw, index) => {
    // "U.S." keeps its inner dots; a sentence's full stop comes off.
    const word = raw.replace(/^[("'“‘]+|[)"'”’,;:!?]+$/g, "").replace(/(?<![A-Z]\.[A-Z])\.$/, "").replace(/['’]s$/, "");
    const capital = /^[A-Z0-9][A-Za-z0-9&.\-]*$/.test(word) && /[A-Za-z]/.test(word);
    if (index > 0 && capital && !own.has(word.toLowerCase()) && !GENERIC.has(word)) run.push(word);
    else close();
    // Punctuation after a word ends the run ("ENTRA1, which…").
    if (/[,.;:!?)]$/.test(raw)) close();
  });
  close();
  // In a Title Case heading every word has a capital: only a token with a digit or two capitals is a name there.
  const titled = isTitleCase(heading);
  const ordinary = (word: string) =>
    !/\d/.test(word) && !/[A-Z].*[A-Z]/.test(word) && (GENERIC.has(word) || titled || (options.ordinary ? options.ordinary(word.toLowerCase()) : false));
  for (const candidate of runs) {
    const kept = [...candidate];
    // "Ligado Transaction" → "Ligado"; "Binding contract" → nothing.
    // Only defined terms come off the end ("Ligado Transaction" → "Ligado"); an ordinary word after a name stays ("ZT Systems").
    while (kept.length && (DEAL_WORDS.test(kept[kept.length - 1]!) || GENERIC.has(kept[kept.length - 1]!))) kept.pop();
    while (kept.length && ordinary(kept[0]!)) kept.shift();
    if (kept.length === 0 || kept.length > 3) continue;
    return kept.join(" ");
  }
  return null;
}

// Openings that say nothing on their own: pronouns, articles, conditions, auxiliaries and the verbs a risk heading
// opens with ("We could be subject to risks in connection with our ability to connect to power grids" → "Power grids").
const LEAD_SKIP = new Set(
  (
    "we our us the a an any if in as of to its it there these this such certain future increased changes change failure failures " +
    "inability risk risks may might could can will would not be been being are is was were have has had able unable subject " +
    "dependent depend depends rely relies continue continues experience experienced face faces incur achieve realize expect also " +
    "significant substantial some all following while during after before upon when although because with connection ability from " +
    "on for by that which and or entering successful temporarily incorporate connect store maintain implement complete manage obtain " +
    "protect develop expand generate retain attract sell use amount number portion majority percentage company's uncertainties required"
  ).split(" "),
);
// Where the topic ends: a joining word, an auxiliary, or a verb a heading turns on.
const STOP = /^(?:is|are|was|were|be|been|may|might|could|can|will|would|must|should|has|have|had|and|or|but|of|to|in|on|for|with|by|from|that|which|as|at|if|including|our|their|its|we|reflect|reflects|raise|raises|include|includes|subjects|depends|described|presents|involve|involves|expose|exposes|affect|affects|impact|impacts|require|requires|harm|harms|cause|causes|create|creates|limit|limits|make|makes|tends)$/i;

/** A topic in the heading's own words: the first two or three words after its opening ("Investors' ability"), or null. */
export function ownWords(heading: string): string | null {
  const words = heading.replace(/[.!?;:]+$/, "").split(/\s+/).map((word) => word.replace(/[,;:()"“”]+/g, ""));
  let start = 0;
  while (start < words.length && LEAD_SKIP.has(words[start]!.toLowerCase())) start += 1;
  const out: string[] = [];
  for (let index = start; index < words.length && out.length < 3; index += 1) {
    const word = words[index]!;
    if (!word || STOP.test(word)) break;
    out.push(word);
  }
  if (out.length === 0) return null;
  const text = out.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

// A serious category said as a possibility, or as something past and fixed.
const HYPOTHETICAL =
  /^(?:if|in the event|should)\b|\b(?:may|might|could|would)\s+(?:in the future\s+)?(?:identify|restate|be (?:delisted|required to restate)|become (?:the )?subject|receive)|\b(?:have been|were|was) remediated\b|\bpreviously identified\b|\bfuture material weakness/i;

/** The topic of one risk heading. */
export function topicOf(heading: string, options: TopicOptions = {}): Topic {
  const text = heading.replace(/\s+/g, " ").trim();
  for (const category of CATEGORIES) {
    const patterns = Array.isArray(category.match) ? category.match : [category.match];
    if (!patterns.some((pattern) => pattern.test(text))) continue;
    let label = category.label;
    if (category.named) {
      const entity = entityOf(text, options);
      if (entity) label = `${entity} ${category.named}`;
    }
    // "If we fail to maintain controls, we may identify material weaknesses": a what-if, not a finding. Serious only
    // when the heading says it happened or is happening.
    const serious = category.serious === true && !HYPOTHETICAL.test(text);
    return { id: category.id, label: serious || category.id !== "internal_controls" ? label : "Internal controls", icon: serious ? category.icon : category.id === "internal_controls" ? "lock" : category.icon, serious, heading: text };
  }
  // Never a made-up name: the heading's own opening words when nothing else fits.
  const label = ownWords(text) ?? text.split(" ").slice(0, 3).join(" ").replace(/[.,;:]+$/, "");
  return { id: "own_words", label, icon: "doc", serious: false, heading: text };
}

/**
 * Several headings as chips: serious first, then in filing order; headings with one label share one chip (its
 * `headings` hold them all, for the hover and the link).
 */
export type TopicChip = Omit<Topic, "heading"> & { headings: string[] };

export function topicChips(headings: readonly string[], options: TopicOptions = {}): TopicChip[] {
  const chips = new Map<string, TopicChip>();
  for (const heading of headings) {
    const topic = topicOf(heading, options);
    const existing = chips.get(topic.label);
    if (existing) {
      existing.headings.push(topic.heading);
      existing.serious ||= topic.serious;
    }
    else chips.set(topic.label, { id: topic.id, label: topic.label, icon: topic.icon, serious: topic.serious, headings: [topic.heading] });
  }
  return [...chips.values()].sort((a, b) => Number(b.serious) - Number(a.serious));
}

// Category labels that keep their capital inside a sentence.
const KEEP_CAPITAL = new Set(["AI", "China", "IT systems"]);
const CATEGORY_LABELS = new Set(CATEGORIES.map((category) => category.label));

/** A topic as it reads inside a sentence: "tariffs & trade", "ENTRA1 deal", "AI" (names and acronyms keep their capitals). */
export function topicWords(label: string): string {
  if (!CATEGORY_LABELS.has(label) || KEEP_CAPITAL.has(label)) return label;
  return `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * "tariffs & trade, supply chain and cash & funding": up to `max` category topics, serious first, for a line of words.
 * A heading named only by its own words is left out of a sentence (it reads as a fragment there).
 */
export function topicList(headings: readonly string[], max = 3, options: TopicOptions = {}): string[] {
  return topicChips(headings, options)
    .filter((chip) => chip.id !== "own_words")
    .slice(0, max)
    .map((chip) => topicWords(chip.label));
}
