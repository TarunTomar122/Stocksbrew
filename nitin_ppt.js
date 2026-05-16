const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3" × 7.5"
pres.title = "India DCom $1BN Engine";
pres.author = "Sumit Priyam";

// ─── Palette ───────────────────────────────────────────────
const C = {
  navy:    "0A1F5C",
  blue:    "1E40AF",
  teal:    "0891B2",
  gold:    "F59E0B",
  white:   "FFFFFF",
  offWhite:"F8FAFF",
  light:   "EFF4FF",
  muted:   "64748B",
  dark:    "1E293B",
  mid:     "334155",
  line:    "CBD5E1",
};

const makeShadow = () => ({
  type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.12
});

// ─── SLIDE 1: Title ─────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  // Left accent bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.gold }, line: { color: C.gold }
  });

  // Decorative circle
  s.addShape(pres.shapes.OVAL, {
    x: 9.5, y: -1.5, w: 6, h: 6,
    fill: { color: "1E40AF", transparency: 70 }, line: { color: "1E40AF", transparency: 70 }
  });
  s.addShape(pres.shapes.OVAL, {
    x: 10.5, y: 4, w: 4, h: 4,
    fill: { color: "0891B2", transparency: 75 }, line: { color: "0891B2", transparency: 75 }
  });

  // Tag line
  s.addText("NOMINATION | INDIA DIGITAL COMMERCE", {
    x: 0.5, y: 1.2, w: 10, h: 0.4,
    fontSize: 10, color: C.gold, bold: true, charSpacing: 3,
    fontFace: "Calibri", margin: 0
  });

  // Main title
  s.addText("Building India's DCom", {
    x: 0.5, y: 1.8, w: 10, h: 1.0,
    fontSize: 48, color: C.white, bold: true, fontFace: "Calibri",
    margin: 0
  });
  s.addText("$1BN Engine", {
    x: 0.5, y: 2.7, w: 8, h: 1.0,
    fontSize: 56, color: C.gold, bold: true, fontFace: "Calibri",
    margin: 0
  });

  // Subtitle
  s.addText("5 Industry-First Capabilities · 135 IYA NOS · $475MM Growth", {
    x: 0.5, y: 3.85, w: 10, h: 0.5,
    fontSize: 18, color: "CADCFC", fontFace: "Calibri", margin: 0
  });

  // Divider
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.5, w: 5.5, h: 0.04,
    fill: { color: "CADCFC", transparency: 40 }, line: { color: "CADCFC", transparency: 40 }
  });

  // Attribution
  s.addText([
    { text: "Sumit Priyam", options: { bold: true, breakLine: true } },
    { text: "Director, Digital Commerce · P&G India · FY25-26" }
  ], {
    x: 0.5, y: 4.75, w: 8, h: 0.7,
    fontSize: 13, color: "94A3B8", fontFace: "Calibri", margin: 0
  });
}

// ─── SLIDE 2: Context ────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  // Header bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.3, h: 1.1,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addText("THE INDIA DCOM OPPORTUNITY", {
    x: 0.5, y: 0, w: 12, h: 1.1,
    fontSize: 22, color: C.white, bold: true, fontFace: "Calibri",
    valign: "middle", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 1.1, w: 13.3, h: 0.07,
    fill: { color: C.gold }, line: { color: C.gold }
  });

  // Stat cards (top row)
  const stats = [
    { val: "200MM+", label: "Online Shoppers", sub: "India's digital consumer base" },
    { val: "2X",     label: "Q-Commerce Growth", sub: "Fastest-growing channel" },
    { val: "35%",    label: "DCom of SMO NOS", sub: "P&G India contribution" },
    { val: "2–5%",   label: "Category Penetration", sub: "The untapped opportunity" },
  ];
  stats.forEach((st, i) => {
    const x = 0.35 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.5, w: 2.9, h: 1.7,
      fill: { color: C.white }, line: { color: C.line, width: 1 },
      shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.5, w: 2.9, h: 0.1,
      fill: { color: i === 3 ? "DC2626" : C.teal }, line: { color: i === 3 ? "DC2626" : C.teal }
    });
    s.addText(st.val, {
      x: x + 0.15, y: 1.62, w: 2.6, h: 0.7,
      fontSize: 34, color: i === 3 ? "DC2626" : C.navy, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(st.label, {
      x: x + 0.15, y: 2.32, w: 2.6, h: 0.35,
      fontSize: 11, color: C.dark, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(st.sub, {
      x: x + 0.15, y: 2.67, w: 2.6, h: 0.35,
      fontSize: 9, color: C.muted, fontFace: "Calibri", margin: 0
    });
  });

  // Challenge section
  s.addText("STRUCTURAL GAPS TO ADDRESS", {
    x: 0.35, y: 3.4, w: 8, h: 0.35,
    fontSize: 11, color: C.muted, bold: true, charSpacing: 2, fontFace: "Calibri", margin: 0
  });

  const gaps = [
    "Trial penetration at scale - category penetration stuck at 2–5% across platforms",
    "Full-funnel media integration - keyword-only search, fragmented 14-day creative TAT",
    "Agile supply chain - cost-optimized distributor-led model, 85% OLA, 10-day replenishment",
    "Qcom-first assortment - platform built for 4-minute trips not yet addressed",
    "Data-driven value creation - no real-time bidding intelligence on Q-com platforms",
  ];
  gaps.forEach((g, i) => {
    const y = 3.85 + i * 0.57;
    s.addShape(pres.shapes.OVAL, {
      x: 0.35, y: y + 0.04, w: 0.28, h: 0.28,
      fill: { color: C.blue }, line: { color: C.blue }
    });
    s.addText(String(i + 1), {
      x: 0.35, y: y + 0.04, w: 0.28, h: 0.28,
      fontSize: 9, color: C.white, bold: true, align: "center", valign: "middle", fontFace: "Calibri", margin: 0
    });
    s.addText(g, {
      x: 0.75, y, w: 11.5, h: 0.45,
      fontSize: 11.5, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0
    });
  });
}

// ─── SLIDE 3: Blueprint ──────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addText("THE $1BN BLUEPRINT", {
    x: 0.5, y: 0.3, w: 12, h: 0.6,
    fontSize: 28, color: C.white, bold: true, fontFace: "Calibri", margin: 0
  });
  s.addText("Five industry-first capabilities to deliver 135 IYA NOS and reach $1BN", {
    x: 0.5, y: 0.9, w: 12, h: 0.4,
    fontSize: 13, color: "94A3B8", fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.35, w: 12.3, h: 0.04,
    fill: { color: C.gold }, line: { color: C.gold }
  });

  const caps = [
    { num: "01", title: "Portfolio &\nE-Trials", kpi: "14.5MM Users", sub: "5X growth · 10% repeat", color: "0891B2" },
    { num: "02", title: "Full-Funnel\nMedia",     kpi: "+6% CVR",      sub: "+6% NTBs · +1.5% Share", color: "7C3AED" },
    { num: "03", title: "Agile\nSupply Chain",    kpi: "90% OLA",      sub: "85→90% · D+1 Supply", color: "059669" },
    { num: "04", title: "Qcom-First\nAssortment", kpi: "+5% Uplift",   sub: "+0.6% Market Share", color: "DC2626" },
    { num: "05", title: "Value Creation\nAuto-Bidder", kpi: "+20% RoAS", sub: "+27% CPM Efficiency", color: C.gold },
  ];

  caps.forEach((c, i) => {
    const x = 0.35 + i * 2.52;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.55, w: 2.35, h: 4.7,
      fill: { color: "0F1E4A" }, line: { color: "1E3A7A", width: 1 }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.55, w: 2.35, h: 0.08,
      fill: { color: c.color }, line: { color: c.color }
    });
    s.addText(c.num, {
      x: x + 0.15, y: 1.75, w: 1.5, h: 0.55,
      fontSize: 28, color: c.color, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(c.title, {
      x: x + 0.12, y: 2.3, w: 2.1, h: 0.9,
      fontSize: 14, color: C.white, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.12, y: 3.3, w: 2.1, h: 0.04,
      fill: { color: c.color, transparency: 40 }, line: { color: c.color, transparency: 40 }
    });
    s.addText(c.kpi, {
      x: x + 0.12, y: 3.45, w: 2.1, h: 0.55,
      fontSize: 18, color: c.color, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(c.sub, {
      x: x + 0.12, y: 4.05, w: 2.1, h: 0.55,
      fontSize: 9.5, color: "94A3B8", fontFace: "Calibri", margin: 0
    });
  });

  // Bottom vision bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 6.45, w: 13.3, h: 1.05,
    fill: { color: C.gold }, line: { color: C.gold }
  });
  s.addText("$1BN NOS  ·  45% Share  ·  98% OLA  ·  15% BT - DCom-1st India", {
    x: 0.5, y: 6.45, w: 12.3, h: 1.05,
    fontSize: 16, color: C.navy, bold: true, align: "center", valign: "middle", fontFace: "Calibri", margin: 0
  });
}

// ─── Helper: capability slide ────────────────────────────────
function capabilitySlide(num, title, tagline, accentColor, bullets, kpis, bottomNote) {
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  // Left panel
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 4.0, h: 7.5,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 4.0, h: 0.1,
    fill: { color: accentColor }, line: { color: accentColor }
  });

  s.addText(`0${num}`, {
    x: 0.3, y: 0.25, w: 2, h: 0.9,
    fontSize: 52, color: accentColor, bold: true, fontFace: "Calibri", margin: 0
  });
  s.addText(title, {
    x: 0.3, y: 1.1, w: 3.4, h: 1.3,
    fontSize: 20, color: C.white, bold: true, fontFace: "Calibri", margin: 0
  });
  s.addText(tagline, {
    x: 0.3, y: 2.45, w: 3.4, h: 0.7,
    fontSize: 11, color: "94A3B8", fontFace: "Calibri", margin: 0
  });

  // KPI cards on left panel
  kpis.forEach((k, i) => {
    const y = 3.35 + i * 1.25;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y, w: 3.4, h: 1.1,
      fill: { color: "0F1E4A" }, line: { color: "1E3A7A", width: 1 }
    });
    s.addText(k.val, {
      x: 0.45, y: y + 0.07, w: 3.1, h: 0.55,
      fontSize: 26, color: accentColor, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(k.label, {
      x: 0.45, y: y + 0.62, w: 3.1, h: 0.35,
      fontSize: 9.5, color: "94A3B8", fontFace: "Calibri", margin: 0
    });
  });

  // Right panel: bullets
  s.addText("WHAT WE BUILT", {
    x: 4.4, y: 0.35, w: 8.4, h: 0.35,
    fontSize: 10, color: C.muted, bold: true, charSpacing: 2, fontFace: "Calibri", margin: 0
  });

  bullets.forEach((b, i) => {
    const y = 0.85 + i * 1.05;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 4.4, y, w: 8.5, h: 0.9,
      fill: { color: C.white }, line: { color: C.line, width: 1 },
      shadow: makeShadow()
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 4.4, y, w: 0.06, h: 0.9,
      fill: { color: accentColor }, line: { color: accentColor }
    });
    s.addText(b.head, {
      x: 4.6, y: y + 0.08, w: 8.1, h: 0.3,
      fontSize: 12, color: C.dark, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(b.body, {
      x: 4.6, y: y + 0.38, w: 8.1, h: 0.42,
      fontSize: 10, color: C.mid, fontFace: "Calibri", margin: 0
    });
  });

  if (bottomNote) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 4.4, y: 6.7, w: 8.5, h: 0.6,
      fill: { color: accentColor, transparency: 85 }, line: { color: accentColor, transparency: 50 }
    });
    s.addText(bottomNote, {
      x: 4.55, y: 6.7, w: 8.3, h: 0.6,
      fontSize: 10, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0, italic: true
    });
  }
}

// ─── SLIDE 4: E-Trials ───────────────────────────────────────
capabilitySlide(
  1, "Portfolio &\nE-Trials", "Closed-Loop Trial Engine at 14.5MM Scale", "0891B2",
  [
    { head: "5X Scale in One Year", body: "Grew from 3MM users in FY24-25 to 14.5MM in FY25-26 - spanning 7 platforms, 10+ user cohorts, 100% of P&G categories." },
    { head: "Platform-Specific Constructs", body: "Always-on Bill Buster on Flipkart · Cohorted Steal Deals with retargeting on Swiggy · VPC-led marketplace GTM on Amazon." },
    { head: "Full Closed-Loop Chassis Proven", body: "Build (25MM reach) → Remind (16MM) → On-platform (15MM) → Trial. Whisper Period Pants: 650MM impressions, ~20% category offtake." },
    { head: "Cross-Functional Governance", body: "Capability spans planning, finance, supply chain, platform ops, and 2LOD-aligned governance - built for durability, not a one-off." },
    { head: "Commercial Impact", body: "15% DCom growth contribution; 10% repeat rate - validating trial-to-loyalty loop." },
  ],
  [
    { val: "14.5MM", label: "Trial Users (5X vs FY24-25)" },
    { val: "10%",    label: "Repeat Rate post-trial" },
    { val: "15%",    label: "DCom Growth Contribution" },
  ],
  "Industry-first: only FMCG brand to build a closed-loop e-trial ecosystem at 14.5MM+ scale across all 7 major India platforms"
);

// ─── SLIDE 5: Media ──────────────────────────────────────────
capabilitySlide(
  2, "Full-Funnel\nMedia", "Integrated Build-Remind-Buy Personalization Engine", "7C3AED",
  [
    { head: "From Keyword to Full-Funnel", body: "Unified nation + retailer plans across Linear TV, OLV, Gaming, Bumper, Influencer, eRetail Search, and Ratings & Reviews." },
    { head: "Amazon Unified Media - Proven ROI", body: "Targeting 8.5MN retail signal audiences delivered +6% CVR, +6% incremental NTBs, +6% repeat rates, +1.5% incremental share." },
    { head: "Intent-Differentiated Search (Industry First on Qcom)", body: "Amazon AMC-powered personalization shifted from one keyword/one experience to differential shelf based on consumer intent signal." },
    { head: "Self-Funded Quality SOV", body: "100% pilots on quality SOV self-funded for 110 effectiveness in FY26-27. Media effectiveness at 105 vs P3Y avg of 97." },
    { head: "Cost Discipline", body: "Maintained performance gains despite 10–12% media inflation and 200bps escalation on agency cost." },
  ],
  [
    { val: "+6% CVR",   label: "Conversion Rate improvement" },
    { val: "+6% NTBs",  label: "Incremental new-to-brand buyers" },
    { val: "105",       label: "Media effectiveness (vs 97 avg)" },
  ],
  "Fragmented 14-day creative TAT replaced by integrated full-funnel ops across all major India digital platforms"
);

// ─── SLIDE 6: Supply Chain ───────────────────────────────────
capabilitySlide(
  3, "Agile ONE\nSupply Chain", "Availability-First, DCom-Native Re-Architecture", "059669",
  [
    { head: "OLA Command Center", body: "Real-time dark store tracking scaled from 300 to 4,000 zip codes - live visibility across all Qcom partners." },
    { head: "D+1 Supply Cycle", body: "Replaced 10-day replenishment with 1/3-day P&G-to-customer flow via collaborative forecasting, green channel appointment, and distributor competitive advantage." },
    { head: "OLA Improvement: 85% → 90%", body: "OLA improved from 85% (Nov'25) to 90% in March. PO TAT compressing 7→3 days. Days on Hand reducing 21→14 days." },
    { head: "GTM of Future Pilot", body: "Last-mile service improvement pilot live - evaluating end-to-end DCom-native supply architecture for FY26-27 scale." },
    { head: "From Cost-Optimized to Availability-First", body: "Re-engineered from distributor-led cost model to Dcom-native availability-first - a structural shift in P&G India supply philosophy." },
  ],
  [
    { val: "90%",    label: "OLA (from 85% Nov'25)" },
    { val: "D+1",    label: "Supply cycle (from 10 days)" },
    { val: "4,000",  label: "Zip codes in Command Center" },
  ],
  "PO TAT: 7→3 days · Days on Hand: 21→14 days · 4,000 dark store zip codes tracked in real-time"
);

// ─── SLIDE 7: Qcom Assortment ────────────────────────────────
capabilitySlide(
  4, "Qcom-First\nAssortment", "Designed for 4-Minute Trips & Dark Store Economics", "DC2626",
  [
    { head: "Qcom Rules Decoded", body: "4-minute trips · 80% ATC via Search · 40% trial pack salience · limited dark store space - assortment redesigned from the ground up." },
    { head: "100 Cart-Breaker SKUs + 43 Super Value Packs", body: "Rationalised to a focused Cart Breaker + SVP structure - the first FMCG brand to define Qcom-native assortment architecture at this scale." },
    { head: "Traffic & Conversion Mechanics", body: "Traffic driven via search optimization and 'Previously Bought' placements. Conversion via Best Value badging and SKU-level pricing architecture." },
    { head: "Proven Commercial Uplift", body: "+0.6% market share growth. +5% business uplift for Cart Breaker + SVP vs plain pack - validated across Blinkit, Swiggy, and Zepto." },
    { head: "Architecture Built to Scale", body: "Assortment framework designed to serve 200MM+ online shoppers as Qcom penetration grows from current 2–5% category levels." },
  ],
  [
    { val: "+0.6%",  label: "Market share growth" },
    { val: "+5%",    label: "Biz uplift vs plain pack" },
    { val: "100",    label: "Cart-Breaker SKUs defined" },
  ],
  "Industry-first Qcom-native assortment architecture - 100 Cart Breakers + 43 SVPs defined across Blinkit, Swiggy, Zepto"
);

// ─── SLIDE 8: Value Creation ─────────────────────────────────
capabilitySlide(
  5, "Value Creation\n& Auto-Bidder", "India's First Q-Com Search Planner & Auto-Bidder", "F59E0B",
  [
    { head: "India's First Qcom Auto-Bidder", body: "Real-time, city-level bidding engine on hourly frequency - hybrid CPC/CPM logic with forecasted click/conversion algorithms. Addresses volatile dynamic demand that marketplace tools cannot handle." },
    { head: "Deployed Across Top 4 Qcom Platforms", body: "Live on Blinkit, Swiggy, Zepto, and Walmart (Flipkart) - the only FMCG brand with a unified cross-platform Qcom bidding engine." },
    { head: "Platinum Data Partnerships - All Top 6 Customers", body: "Emedia Falcon deployed across all top 6 customers: Amazon, Flipkart, Myntra, Blinkit, Swiggy, Zepto." },
    { head: "Flipkart × P&G SOCH'26", body: "Collaboration secured across category intelligence, shopper & demand intelligence, competitive intelligence, and retail execution." },
    { head: "Proven Performance at Scale", body: "+20% impressions · +27% CPM efficiency · +20% RoAS - sustained results, not a test." },
  ],
  [
    { val: "+20%",   label: "Impressions delivered" },
    { val: "+27%",   label: "CPM efficiency improvement" },
    { val: "+20%",   label: "RoAS across Qcom platforms" },
  ],
  "Industry-first: only FMCG brand with a live city-level auto-bidding engine operating across all 4 major Qcom platforms simultaneously"
);

// ─── SLIDE 9: Results ────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addText("RESULTS FY25-26", {
    x: 0.5, y: 0.25, w: 12, h: 0.6,
    fontSize: 26, color: C.white, bold: true, fontFace: "Calibri", margin: 0
  });
  s.addText("Five capabilities. One engine. Structural proof of a $1BN DCom business.", {
    x: 0.5, y: 0.85, w: 12, h: 0.4,
    fontSize: 13, color: "94A3B8", fontFace: "Calibri", margin: 0
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 1.28, w: 12.3, h: 0.05,
    fill: { color: C.gold }, line: { color: C.gold }
  });

  // Hero metric
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.35, y: 1.5, w: 4.1, h: 2.3,
    fill: { color: C.gold }, line: { color: C.gold }
  });
  s.addText("135", {
    x: 0.4, y: 1.55, w: 4.0, h: 1.45,
    fontSize: 88, color: C.navy, bold: true, fontFace: "Calibri", align: "center", margin: 0
  });
  s.addText("IYA NOS Points Growth", {
    x: 0.4, y: 3.0, w: 4.0, h: 0.45,
    fontSize: 13, color: C.navy, bold: true, align: "center", fontFace: "Calibri", margin: 0
  });
  s.addText("$475MM  ·  40% of SMO NOS", {
    x: 0.4, y: 3.45, w: 4.0, h: 0.3,
    fontSize: 11, color: "1A3A5C", align: "center", fontFace: "Calibri", margin: 0
  });

  // KPI grid
  const results = [
    { val: "14.5MM", label: "E-Trial Users", sub: "5X · 10% repeat · 15% DCom contribution", col: "0891B2" },
    { val: "+20% RoAS", label: "Auto-Bidder", sub: "+27% CPM · +20% impressions · 4 platforms", col: "F59E0B" },
    { val: "90% OLA", label: "Supply Chain", sub: "85→90% · D+1 cycle · 21→14 DOH", col: "059669" },
    { val: "+0.6% Shr", label: "Qcom Assortment", sub: "+5% uplift · 100 Cart Breakers · 43 SVPs", col: "DC2626" },
    { val: "105 ME", label: "Media Effectiveness", sub: "vs P3Y avg 97 · 100% pilots self-funded", col: "7C3AED" },
    { val: "Top 6", label: "Platinum Data Partners", sub: "Amazon · Flipkart · Myntra · Blinkit · Swiggy · Zepto", col: "0891B2" },
  ];

  results.forEach((r, i) => {
    const col = i % 2 === 0 ? 4.65 : 8.9;
    const row = Math.floor(i / 2);
    const y = 1.5 + row * 1.75;
    s.addShape(pres.shapes.RECTANGLE, {
      x: col, y, w: 4.1, h: 1.5,
      fill: { color: "0F1E4A" }, line: { color: "1E3A7A", width: 1 }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: col, y, w: 4.1, h: 0.07,
      fill: { color: r.col }, line: { color: r.col }
    });
    s.addText(r.val, {
      x: col + 0.18, y: y + 0.1, w: 3.7, h: 0.65,
      fontSize: 24, color: r.col, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(r.label, {
      x: col + 0.18, y: y + 0.75, w: 3.7, h: 0.3,
      fontSize: 10, color: C.white, bold: true, fontFace: "Calibri", margin: 0
    });
    s.addText(r.sub, {
      x: col + 0.18, y: y + 1.05, w: 3.7, h: 0.35,
      fontSize: 8.5, color: "64748B", fontFace: "Calibri", margin: 0
    });
  });

  // Bottom bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 6.7, w: 13.3, h: 0.8,
    fill: { color: "0F1E4A" }, line: { color: "0F1E4A" }
  });
  s.addText("India DCom: on the path to $1BN NOS · 45% Share · 98% OLA · 15% BT - Dcom-1st Organization", {
    x: 0.5, y: 6.7, w: 12.3, h: 0.8,
    fontSize: 12, color: C.gold, bold: true, align: "center", valign: "middle", fontFace: "Calibri", margin: 0
  });
}

// ─── SLIDE 10: Closing ───────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };

  s.addShape(pres.shapes.OVAL, {
    x: 7, y: -2, w: 8, h: 8,
    fill: { color: "1E40AF", transparency: 75 }, line: { color: "1E40AF", transparency: 75 }
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.12, h: 7.5,
    fill: { color: C.gold }, line: { color: C.gold }
  });

  s.addText("DURABLE. SCALABLE. COMMERCIALLY PROVEN.", {
    x: 0.5, y: 1.5, w: 9, h: 0.5,
    fontSize: 12, color: C.gold, bold: true, charSpacing: 3, fontFace: "Calibri", margin: 0
  });
  s.addText("India DCom is not just a channel -\nit's a structural capability.", {
    x: 0.5, y: 2.1, w: 10, h: 1.8,
    fontSize: 38, color: C.white, bold: true, fontFace: "Calibri", margin: 0
  });
  s.addText("Five industry-first capabilities, engineered in partnership with India's top 6 digital customers, now form the operating backbone of a Dcom-1st organization on the path to $1BN.", {
    x: 0.5, y: 4.05, w: 9.5, h: 1.0,
    fontSize: 14, color: "94A3B8", fontFace: "Calibri", margin: 0
  });

  s.addText([
    { text: "Sumit Priyam", options: { bold: true, breakLine: true } },
    { text: "Director, Digital Commerce · P&G India · FY25-26" }
  ], {
    x: 0.5, y: 5.5, w: 8, h: 0.8,
    fontSize: 13, color: "64748B", fontFace: "Calibri", margin: 0
  });
}

// ─── Write ───────────────────────────────────────────────────
pres.writeFile({ fileName: "/Users/ttomar/Documents/personal/tikrr/India_DCom_1BN_Engine.pptx" })
  .then(() => console.log("Done: India_DCom_1BN_Engine.pptx"))
  .catch(e => { console.error(e); process.exit(1); });
