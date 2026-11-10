"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../dev-thesis-monitor-demo.module.css";

type Company = {
  ticker: string;
  name: string;
  sector: string;
  thesis: string;
  revisit: string;
  updateTitle: string;
  supports: string;
  challenges: string;
  next: string;
};

const COMPANIES: Company[] = [
  {
    ticker: "NSTR",
    name: "Northstar Robotics",
    sector: "Industrial automation",
    thesis: "I'm watching to see whether recurring revenue grows after the factory automation launch.",
    revisit: "Growth slows or operating losses keep widening.",
    updateTitle: "Quarterly update: growth is there, costs need a closer look",
    supports: "Recurring revenue increased in the fictional example, in line with the reason you saved.",
    challenges: "Operating losses widened. That could make the growth harder to sustain.",
    next: "Management's next update on customer renewals and operating costs.",
  },
  {
    ticker: "CDRH",
    name: "Cedar Health",
    sector: "Digital health",
    thesis: "I'm watching whether patient retention improves as the company expands its clinic network.",
    revisit: "Retention stalls while the cost of opening clinics keeps rising.",
    updateTitle: "Quarterly update: more returning patients, higher expansion costs",
    supports: "The fictional update shows more patients returning for follow-up care.",
    challenges: "The example also shows higher costs as new clinics open.",
    next: "The next update on clinic-level margins and patient retention.",
  },
  {
    ticker: "ORBT",
    name: "Orbit Grid",
    sector: "Energy infrastructure",
    thesis: "I'm watching whether its project backlog turns into delivered grid equipment.",
    revisit: "Delivery delays rise or the backlog starts shrinking.",
    updateTitle: "Company update: backlog grew, deliveries remain the open question",
    supports: "The fictional update shows a larger contracted project backlog.",
    challenges: "Delivery timing has not improved in this example, so backlog conversion remains unproven.",
    next: "The next report on completed projects and delivery schedules.",
  },
  {
    ticker: "LMAT",
    name: "Lumen Materials",
    sector: "Battery materials",
    thesis: "I'm watching whether new supply contracts translate into profitable production.",
    revisit: "Contract delays grow or unit costs stay too high.",
    updateTitle: "Project update: new orders, production costs still unclear",
    supports: "The fictional update shows additional customer contracts.",
    challenges: "The example does not yet show whether production can meet the orders profitably.",
    next: "The next report on shipments, customer concentration and unit costs.",
  },
];

type AppTab = "today" | "stocks" | "history" | "settings";
type EntryScreen = "welcome" | "setup" | "paywall" | "trial" | "app";

const TAB_LABELS: { id: AppTab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "◷" },
  { id: "stocks", label: "My stocks", icon: "▤" },
  { id: "history", label: "History", icon: "↗" },
  { id: "settings", label: "Alerts", icon: "⚙" },
];

export function ThesisMonitorDemo() {
  const [screen, setScreen] = useState<EntryScreen>("welcome");
  const [tab, setTab] = useState<AppTab>("today");
  const [paywallFirst, setPaywallFirst] = useState(false);
  const [trialActive, setTrialActive] = useState(false);
  const [tracked, setTracked] = useState<Company[]>([]);
  const [activeTicker, setActiveTicker] = useState("NSTR");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revisitNotes, setRevisitNotes] = useState<Record<string, string>>({});
  const [selectedTicker, setSelectedTicker] = useState("NSTR");
  const [setupNote, setSetupNote] = useState(COMPANIES[0].thesis);
  const [setupRevisit, setSetupRevisit] = useState(COMPANIES[0].revisit);
  const [responses, setResponses] = useState<Record<string, "useful" | "revisit">>({});
  const [editingNote, setEditingNote] = useState(false);
  const [editingRevisit, setEditingRevisit] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [showAddStock, setShowAddStock] = useState(false);
  const [weeklyEmail, setWeeklyEmail] = useState(true);
  const [filingAlerts, setFilingAlerts] = useState(false);
  const [earningsAlerts, setEarningsAlerts] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    const scrollContainer = document.querySelector("[data-thesis-demo-root]")?.parentElement;
    if (scrollContainer instanceof HTMLElement) scrollContainer.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [screen, tab]);

  const activeCompany = useMemo(
    () => tracked.find((company) => company.ticker === activeTicker) ?? tracked[0] ?? COMPANIES[0],
    [activeTicker, tracked],
  );
  const activeNote = notes[activeCompany.ticker] || activeCompany.thesis;
  const activeRevisit = revisitNotes[activeCompany.ticker] || activeCompany.revisit;
  const activeResponse = responses[activeCompany.ticker] ?? null;
  const reviewedCount = Object.keys(responses).length;

  function beginSetup() {
    setPaywallFirst(false);
    setScreen("setup");
  }

  function chooseCompany(ticker: string) {
    const company = COMPANIES.find((item) => item.ticker === ticker) ?? COMPANIES[0];
    setSelectedTicker(ticker);
    setSetupNote(company.thesis);
    setSetupRevisit(company.revisit);
  }

  function saveSetup() {
    const company = COMPANIES.find((item) => item.ticker === selectedTicker) ?? COMPANIES[0];
    setTracked([company]);
    setActiveTicker(company.ticker);
    setNotes((current) => ({ ...current, [company.ticker]: setupNote.trim() || company.thesis }));
    setRevisitNotes((current) => ({ ...current, [company.ticker]: setupRevisit.trim() || company.revisit }));
    setScreen("app");
    setTab("today");
  }

  function openPaywall(hard = false) {
    setPaywallFirst(hard);
    setScreen("paywall");
  }

  function startTrial() {
    setTrialActive(true);
    setScreen("trial");
  }

  function continueToApp() {
    setScreen("app");
    setTab("today");
  }

  function continueAfterTrial() {
    if (tracked.length === 0) {
      beginSetup();
      return;
    }
    continueToApp();
  }

  function addCompany(ticker: string) {
    if (tracked.some((company) => company.ticker === ticker)) return;
    if (tracked.length >= (trialActive ? 25 : 3)) {
      openPaywall();
      return;
    }
    const company = COMPANIES.find((item) => item.ticker === ticker);
    if (!company) return;
    setTracked((current) => [...current, company]);
    setNotes((current) => ({ ...current, [company.ticker]: company.thesis }));
    setRevisitNotes((current) => ({ ...current, [company.ticker]: company.revisit }));
    setActiveTicker(company.ticker);
    setShowAddStock(false);
    setTab("today");
  }

  function saveEditedNote() {
    if (editingRevisit) {
      setRevisitNotes((current) => ({ ...current, [activeCompany.ticker]: noteDraft.trim() || activeCompany.revisit }));
    } else {
      setNotes((current) => ({ ...current, [activeCompany.ticker]: noteDraft.trim() || activeCompany.thesis }));
    }
    setEditingNote(false);
    setEditingRevisit(false);
  }

  function resetDemo() {
    setScreen("welcome");
    setTab("today");
    setPaywallFirst(false);
    setTrialActive(false);
    setTracked([]);
    setActiveTicker("NSTR");
    setNotes({});
    setRevisitNotes({});
    setSelectedTicker("NSTR");
    setSetupNote(COMPANIES[0].thesis);
    setSetupRevisit(COMPANIES[0].revisit);
    setResponses({});
    setEditingNote(false);
    setEditingRevisit(false);
    setShowAddStock(false);
    setWeeklyEmail(true);
    setFilingAlerts(false);
    setEarningsAlerts(false);
    setShowFeedback(false);
    setFeedback("");
  }

  return (
    <div className={styles.demoRoot} data-thesis-demo-root>
      <div className={styles.demoNotice}>
        <span className={styles.noticeDot} aria-hidden="true" />
        Product experiment · fictional companies and simulated evidence · nothing is saved
        <button className={styles.resetButton} onClick={resetDemo}>Start over</button>
      </div>

      {screen === "welcome" && (
        <main className={styles.welcomeWrap}>
          <header className={styles.brandBar}>
            <div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div>
            <span className={styles.experimentTag}>positioning experiment</span>
          </header>
          <section className={styles.welcomeGrid}>
            <div className={styles.welcomeCopy}>
              <p className={styles.eyebrow}>Keep your stock decisions connected to your own plan</p>
              <h1>Know what you care about.<br /><span>See what changes.</span></h1>
              <p className={styles.welcomeDescription}>
                Write down why you follow a company and what would make you revisit it. See new evidence beside that plan, then decide for yourself whether anything changed.
              </p>
              <div className={styles.welcomeActions}>
                <button className={styles.primaryButton} onClick={beginSetup}>Build my first tracker <span aria-hidden="true">→</span></button>
                <button className={styles.textButton} onClick={() => openPaywall(true)}>Try the trial-first hard gate</button>
              </div>
              <p className={styles.finePrint}>No brokerage connection. No trade suggestions. This demo uses made-up companies and events.</p>
            </div>
            <div className={styles.previewCard}>
              <div className={styles.previewTopline}><span className={styles.statusPill}><span /> mixed evidence</span><span className={styles.demoLabel}>DEMO</span></div>
              <p className={styles.previewTicker}>NSTR <span>Northstar Robotics · fictional</span></p>
              <h2>Does the latest update support your reason?</h2>
              <p className={styles.previewReason}>“Recurring revenue keeps growing after the factory automation launch.”</p>
              <div className={styles.previewDivider} />
              <div className={styles.previewEvidence}><span className={styles.evidencePlus}>↗</span><p><strong>Supports one part</strong><br />Recurring revenue grew in this fictional report.</p></div>
              <div className={styles.previewEvidence}><span className={styles.evidenceMinus}>↘</span><p><strong>Raises another question</strong><br />Operating losses widened in the same example.</p></div>
              <div className={styles.sourceLine}><span className={styles.sourceIcon}>▤</span> Mock company report · fictional source</div>
            </div>
          </section>
          <section className={styles.valueStrip}>
            <div><span>01</span><p>Save your reason and revisit condition</p></div>
            <div><span>02</span><p>See evidence alongside your plan</p></div>
            <div><span>03</span><p>Choose whether the plan still holds</p></div>
          </section>
        </main>
      )}

      {screen === "setup" && (
        <main className={styles.setupWrap}>
          <header className={styles.brandBar}>
            <div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div>
            <button className={styles.textButton} onClick={() => setScreen("welcome")}>← Back</button>
          </header>
          <div className={styles.setupCard}>
            <div className={styles.stepLine}><span>FIRST TRACKER</span><span>1 OF 1</span></div>
            <h1>What are you watching for?</h1>
            <p className={styles.setupIntro}>Choose a fictional company and write a small decision plan: why you follow it and what would make you reconsider.</p>
            <div className={styles.companyChoices}>
              {COMPANIES.map((company) => (
                <button key={company.ticker} className={`${styles.companyChoice} ${selectedTicker === company.ticker ? styles.companyChoiceSelected : ""}`} onClick={() => chooseCompany(company.ticker)}>
                  <span className={styles.tickerAvatar}>{company.ticker.slice(0, 1)}</span>
                  <span className={styles.companyChoiceText}><strong>{company.name}</strong><small>{company.ticker} · {company.sector}</small></span>
                  <span className={styles.radioDot} aria-hidden="true" />
                </button>
              ))}
            </div>
            <label className={styles.fieldLabel} htmlFor="demo-thesis">My reason for following it</label>
            <textarea id="demo-thesis" className={styles.textArea} value={setupNote} onChange={(event) => setSetupNote(event.target.value)} rows={3} />
            <label className={styles.fieldLabel} htmlFor="demo-invalidation">What would make me revisit this?</label>
            <textarea id="demo-invalidation" className={`${styles.textArea} ${styles.shortTextArea}`} value={setupRevisit} onChange={(event) => setSetupRevisit(event.target.value)} rows={2} />
            <div className={styles.setupFoot}>
              <span>{trialActive ? "Pro trial · up to 25 tracked stocks" : "Free plan · up to 3 tracked stocks"}</span>
            <button className={styles.primaryButton} onClick={saveSetup}>Save my plan <span aria-hidden="true">→</span></button>
            </div>
          </div>
          <p className={styles.centerFinePrint}>Your reason is separate from Stocksbrew's company research.</p>
        </main>
      )}

      {screen === "paywall" && (
        <main className={styles.paywallWrap}>
          <header className={styles.brandBar}>
            <div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div>
            <button className={styles.textButton} onClick={() => paywallFirst ? setScreen("welcome") : setScreen("app")}>← {paywallFirst ? "Back" : "Back to demo"}</button>
          </header>
          <div className={styles.paywallCard}>
            <div className={styles.experimentTag}>PRICING EXPERIMENT · 7-DAY TRIAL</div>
            <h1>{paywallFirst ? "Start a trial to see your tracker." : "Keep the full story in view."}</h1>
            <p className={styles.paywallIntro}>{paywallFirst ? "This version asks you to start a trial before building a tracker. Use Back to return to the welcome screen and try the free-first version." : "Your first company update is free. Pro is for ongoing monitoring across more stocks, with a longer evidence trail."}</p>
            <div className={styles.planCompare}>
              <div className={styles.planCard}>
                <div className={styles.planName}>Free</div>
                <div className={styles.planPrice}>$0<span> / always</span></div>
                <ul><li>Track up to 3 companies</li><li>Save a reason for each one</li><li>Read the latest company update</li><li>Weekly email summary</li></ul>
                {paywallFirst ? <p className={styles.planUnavailable}>Trial-first experiment: start the trial to continue to setup.</p> : <button className={styles.secondaryButton} onClick={continueToApp}>Keep using free</button>}
              </div>
              <div className={`${styles.planCard} ${styles.planCardPro}`}>
                <div className={styles.planTop}><div className={styles.planName}>Pro <span className={styles.popularTag}>PROPOSED</span></div><span className={styles.planSpark}>✦</span></div>
                <div className={styles.planPrice}>$9<span> / month after trial</span></div>
                <p className={styles.trialCaption}>{trialActive ? "Your seven-day trial is active · demo only" : "7 days free · then $9/month · cancel anytime"}</p>
                <ul><li>Track up to 25 companies in the proposed product</li><li>Source-linked updates against your reason</li><li>Full update history</li><li>Choose earnings and filing alerts</li></ul>
                <p className={styles.catalogNote}>The prototype only includes four fictional company examples.</p>
                <button className={styles.primaryButton} onClick={trialActive ? continueToApp : startTrial}>{trialActive ? "Back to my tracker" : "Start 7-day free trial"} <span aria-hidden="true">→</span></button>
              </div>
            </div>
            <p className={styles.mockTerms}>Demo only: this button will not start a real trial, request payment details, or charge you. Seven days is a test idea; the live app currently offers a different trial.</p>
          </div>
          {!trialActive && <div className={styles.stickyTrial}><span>7 days free · then $9/month</span><button className={styles.primaryButton} onClick={startTrial}>Start trial <span aria-hidden="true">→</span></button></div>}
        </main>
      )}

      {screen === "trial" && (
        <main className={styles.trialWrap}>
          <div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div>
          <div className={styles.trialCard}>
            <div className={styles.trialCheck}>✓</div>
            <p className={styles.eyebrow}>DEMO TRIAL ACTIVATED</p>
            <h1>Your seven days start here.</h1>
            <p>All the tracker features are now open in this prototype. No account, payment method, or real subscription was created.</p>
            <div className={styles.trialSummary}><span>Today</span><strong>Day 1 of 7</strong><span>After the trial</span><strong>$9/month · proposed</strong></div>
            <button className={styles.primaryButton} onClick={continueAfterTrial}>{tracked.length === 0 ? "Set up my tracker" : "Open my tracker"} <span aria-hidden="true">→</span></button>
            <button className={styles.textButton} onClick={resetDemo}>Start over</button>
          </div>
        </main>
      )}

      {screen === "app" && (
        <div className={styles.appFrame}>
          <aside className={styles.sidebar}>
            <div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div>
            <div className={styles.sidebarCaption}>YOUR RESEARCH</div>
            <nav className={styles.sideNav} aria-label="Demo sections">
              {TAB_LABELS.map((item) => (
                <button key={item.id} className={`${styles.navItem} ${tab === item.id ? styles.navItemActive : ""}`} onClick={() => { setTab(item.id); setShowAddStock(false); }}>
                  <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>{item.label}
                  {item.id === "stocks" && <span className={styles.navCount}>{tracked.length}</span>}
                </button>
              ))}
            </nav>
            <div className={styles.sidebarBottom}>
              <div className={styles.planMini}><span className={styles.planMiniIcon}>✦</span><div><strong>{trialActive ? "Pro trial" : "Free plan"}</strong><small>{trialActive ? "6 days left · demo" : `${tracked.length} of 3 stocks used`}</small></div></div>
              <button className={styles.upgradeLink} onClick={() => openPaywall()}>Compare plans <span>→</span></button>
            </div>
          </aside>

          <div className={styles.mobileTop}><div className={styles.brand}><span className={styles.brandMark}>s</span>stocksbrew</div><button className={styles.mobilePlan} onClick={() => openPaywall()}>{trialActive ? "Pro trial" : "Free"} <span>↗</span></button></div>

          <main className={styles.appMain}>
            <div className={styles.pageHeading}>
              <div><p className={styles.eyebrow}>{tab === "today" ? "YOUR INVESTING CHECK-IN" : tab === "stocks" ? "YOUR FOLLOW LIST" : tab === "history" ? "YOUR EVIDENCE TRAIL" : "YOUR UPDATE PREFERENCES"}</p>
                <h1>{tab === "today" ? "Today" : tab === "stocks" ? "My stocks" : tab === "history" ? "Update history" : "Alert settings"}</h1></div>
              <span className={styles.demoDataBadge}>SIMULATED DATA</span>
            </div>

            {tab === "today" && (
              <>
                <div className={styles.checkinBanner}><div><strong>One update needs a look.</strong><span>We found a mixed result in a fictional company report.</span></div><button className={styles.inlineButton} onClick={() => setTab("history")}>See evidence trail <span>→</span></button></div>
                <section className={styles.todayGrid}>
                  <div className={styles.primaryColumn}>
                    <article className={styles.contentCard}>
                      <div className={styles.cardHeader}><div className={styles.companyTitle}><span className={styles.companyAvatar}>{activeCompany.ticker.slice(0, 1)}</span><div><strong>{activeCompany.name}</strong><span>{activeCompany.ticker} · {activeCompany.sector} · fictional</span></div></div><span className={styles.mixedPill}>Mixed evidence</span></div>
                      <div className={styles.reasonBlock}><div className={styles.sectionLabel}>YOUR PLAN · WHY YOU FOLLOW</div><p>“{activeNote}”</p><button className={styles.inlineButton} onClick={() => { setNoteDraft(activeNote); setEditingRevisit(false); setEditingNote(true); }}>Edit reason</button></div>
                      <div className={styles.updateBlock}>
                        <div className={styles.updateMeta}><span>LATEST COMPANY UPDATE</span><span>Illustrative · demo only</span></div>
                        <h2>{activeCompany.updateTitle}</h2>
                        <p className={styles.updateLead}>One part of your reason has support. Another part needs a closer look.</p>
                        <p className={styles.demoRelationNote}>Illustrative match for this fictional example. Editing your note will not regenerate this canned update.</p>
                        <div className={styles.evidenceRows}><div><span className={styles.evidencePlus}>↗</span><p><strong>Supports</strong>{activeCompany.supports}</p></div><div><span className={styles.evidenceMinus}>↘</span><p><strong>Needs a closer look</strong>{activeCompany.challenges}</p></div></div>
                        <div className={styles.sourceFoot}><span>▤</span><span>Fictional company report · mock source · no live records</span><button className={styles.inlineButton} onClick={() => setTab("history")}>View source trail</button></div>
                      </div>
                      <div className={styles.responseBlock}>
                        <div><strong>{activeResponse ? "Your response is saved for this demo" : "Does this update change what you want to watch?"}</strong><span>{activeResponse === "useful" ? "Marked as still useful." : activeResponse === "revisit" ? "Added to your review list." : "Your call. Stocksbrew does not tell you to buy or sell."}</span></div>
                        <div className={styles.responseButtons}><button className={`${styles.responseButton} ${activeResponse === "useful" ? styles.responseSelected : ""}`} onClick={() => setResponses((current) => ({ ...current, [activeCompany.ticker]: "useful" }))}>Still useful</button><button className={`${styles.responseButton} ${activeResponse === "revisit" ? styles.responseSelected : ""}`} onClick={() => setResponses((current) => ({ ...current, [activeCompany.ticker]: "revisit" }))}>I want to revisit</button></div>
                      </div>
                    </article>
                    <article className={styles.nextCard}><span className={styles.nextIcon}>◎</span><div><span className={styles.sectionLabel}>WHAT TO WATCH NEXT</span><p>{activeCompany.next}</p></div><span className={styles.nextDemoTag}>demo</span></article>
                  </div>
                  <aside className={styles.rightColumn}>
                    <article className={styles.sideCard}><div className={styles.sideCardTitle}><strong>Your review rule</strong><button className={styles.iconButton} aria-label="Edit your review rule" onClick={() => { setNoteDraft(activeRevisit); setEditingRevisit(true); setEditingNote(true); }}>···</button></div><p className={styles.reviewRule}>“{activeRevisit}”</p><div className={styles.ruleFooter}><span className={styles.ruleDot} />Saved with your reason</div></article>
                    <article className={styles.sideCard}><div className={styles.sectionLabel}>THIS WEEK</div><div className={styles.weekStat}><strong>{reviewedCount}</strong><span>updates reviewed</span></div><div className={styles.weekProgress}><span style={{ width: `${reviewedCount ? Math.min(100, reviewedCount * 50) : 14}%` }} /></div><button className={styles.inlineButton} onClick={() => setTab("history")}>Open full history <span>→</span></button></article>
                    <article className={styles.sideTip}><span>✦</span><p><strong>Your notes stay yours.</strong><br />They are separate from Stocksbrew’s company research and simulated update.</p></article>
                  </aside>
                </section>
              </>
            )}

            {tab === "stocks" && (
              <section className={styles.contentCard}>
                <div className={styles.listHeading}><div><h2>Companies you follow</h2><p>Save a reason for each name so future updates have context.</p></div><span className={styles.limitPill}>{tracked.length} / {trialActive ? 25 : 3}</span></div>
                <div className={styles.stockList}>
                  {tracked.map((company) => <button key={company.ticker} className={`${styles.stockRow} ${activeTicker === company.ticker ? styles.stockRowActive : ""}`} onClick={() => { setActiveTicker(company.ticker); setTab("today"); }}><span className={styles.companyAvatar}>{company.ticker.slice(0, 1)}</span><span className={styles.stockRowName}><strong>{company.name}</strong><small>{company.ticker} · fictional</small></span><span className={styles.stockRowReason}>{notes[company.ticker] || company.thesis}</span><span className={styles.rowArrow}>→</span></button>)}
                </div>
                {!showAddStock ? <div className={styles.addStockRow}><button className={styles.secondaryButton} onClick={() => setShowAddStock(true)}>＋ Add a company</button><span>{trialActive ? "Pro idea: up to 25 in the product · 4 demo examples" : "Free plan: up to 3 companies"}</span></div> : (
                  <div className={styles.addStockPanel}><div><strong>Add a fictional company</strong><span>Choose one to add to your demo list.</span></div><div className={styles.addChoices}>{COMPANIES.filter((company) => !tracked.some((item) => item.ticker === company.ticker)).map((company) => <button key={company.ticker} className={styles.addChoice} onClick={() => addCompany(company.ticker)}><strong>{company.name}</strong><small>{company.ticker} · fictional</small></button>)}</div>{COMPANIES.every((company) => tracked.some((item) => item.ticker === company.ticker)) && <p className={styles.catalogEmpty}>That is the full four-company demo catalog. The proposed product limit is 25, but this prototype has no more sample companies.</p>}{tracked.length >= (trialActive ? 25 : 3) && <button className={styles.addChoice} onClick={() => openPaywall()}><strong>Unlock more companies</strong><small>Compare Pro features</small></button>}<button className={styles.textButton} onClick={() => setShowAddStock(false)}>Cancel</button></div>
                )}
              </section>
            )}

            {tab === "history" && (
              <div className={styles.historyLayout}>
                <section className={styles.contentCard}>
                  <div className={styles.listHeading}><div><h2>{activeCompany.name}</h2><p>Fictional entries. The sample match is illustrative and does not recalculate when you edit your reason.</p></div><span className={styles.mixedPill}>{trialActive ? "3 entries" : "1 update"}</span></div>
                  <div className={styles.timeline}>
                    <div className={styles.timelineEntry}><span className={styles.timelineDot} /><div className={styles.timelineDate}>TODAY · DEMO</div><h3>{activeCompany.updateTitle}</h3><p>{activeCompany.supports} {activeCompany.challenges}</p><div className={styles.timelineSources}><span>Mock company report</span><span>Fictional source</span></div><span className={styles.historyStatus}>{activeResponse === "useful" ? "You marked this still useful" : activeResponse === "revisit" ? "You added this to your review list" : "Waiting for your review"}</span></div>
                    {trialActive ? <>
                      <div className={styles.timelineEntry}><span className={styles.timelineDotMuted} /><div className={styles.timelineDate}>2 WEEKS AGO · SIMULATED</div><h3>A prior update was saved</h3><p>A made-up earlier report showed a change to customer renewal rates.</p><div className={styles.timelineSources}><span>Mock investor letter</span><span>Fictional source</span></div></div>
                      <div className={styles.timelineEntry}><span className={styles.timelineDotMuted} /><div className={styles.timelineDate}>1 MONTH AGO · SIMULATED</div><h3>Your original reason was recorded</h3><p>“{activeNote}”</p></div>
                    </> : <div className={styles.historyGate}><div className={styles.lockIcon}>▣</div><div><strong>Keep the longer evidence trail</strong><p>Pro saves prior updates and your response, so you can see how the story changed over time.</p></div><button className={styles.secondaryButton} onClick={() => openPaywall()}>See the 7-day trial</button></div>}
                  </div>
                </section>
                <aside className={styles.historyAside}><div className={styles.sectionLabel}>THE IMPORTANT BIT</div><h3>A new headline is not a thesis verdict.</h3><p>This demo separates evidence from your judgment and leaves mixed or unclear updates open for review.</p><button className={styles.inlineButton} onClick={() => setTab("today")}>Back to today <span>→</span></button></aside>
              </div>
            )}

            {tab === "settings" && (
              <section className={styles.settingsGrid}>
                <div className={styles.contentCard}>
                  <div className={styles.listHeading}><div><h2>Choose what reaches you</h2><p>Keep quiet by default. Pick the updates that deserve a nudge.</p></div></div>
                  <div className={styles.settingRow}><div><strong>Weekly company summary</strong><span>A short roundup of changes across your list.</span></div><button className={`${styles.toggle} ${weeklyEmail ? styles.toggleOn : ""}`} role="switch" aria-checked={weeklyEmail} aria-label="Weekly company summary" onClick={() => setWeeklyEmail((value) => !value)}><span /></button></div>
                  <div className={styles.settingRow}><div><strong>Official filing alerts</strong><span>Only when a filing relates to a saved reason.</span></div><button className={`${styles.toggle} ${filingAlerts ? styles.toggleOn : ""}`} role="switch" aria-checked={filingAlerts} aria-label="Official filing alerts" onClick={() => trialActive ? setFilingAlerts((value) => !value) : openPaywall()}><span /></button>{!trialActive && <button className={styles.lockedHint} onClick={() => openPaywall()}>Pro · unlock</button>}</div>
                  <div className={styles.settingRow}><div><strong>Earnings update alerts</strong><span>Get a note when earnings test your assumptions.</span></div><button className={`${styles.toggle} ${earningsAlerts ? styles.toggleOn : ""}`} role="switch" aria-checked={earningsAlerts} aria-label="Earnings update alerts" onClick={() => trialActive ? setEarningsAlerts((value) => !value) : openPaywall()}><span /></button>{!trialActive && <button className={styles.lockedHint} onClick={() => openPaywall()}>Pro · unlock</button>}</div>
                  <div className={styles.settingsCallout}><span>ⓘ</span><p>Alert timing, source coverage and delivery channels here are part of the product hypothesis. This demo sends nothing.</p></div>
                </div>
                <aside className={styles.historyAside}><div className={styles.sectionLabel}>YOUR DATA</div><h3>Your investing reasons belong to you.</h3><p>A real version would need clear controls for privacy, export and deleting your notes before asking people to write them down.</p><button className={styles.inlineButton} onClick={() => openPaywall()}>Compare plan limits <span>→</span></button></aside>
              </section>
            )}

            <div className={styles.footerNote}>Fictional companies and events throughout · no live prices, filings, sources or investment advice.</div>
            <div className={styles.feedbackLine}>{!showFeedback ? <button className={styles.textButton} onClick={() => setShowFeedback(true)}>Leave quick demo feedback</button> : <div className={styles.feedbackBox}><label htmlFor="demo-feedback">What would make this useful enough to pay for?</label><div><input id="demo-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Your honest take…" /><button className={styles.secondaryButton} onClick={() => setShowFeedback(false)}>{feedback.trim() ? "Saved in this demo" : "Close"}</button></div><small>This stays in your browser session only. It is not sent anywhere.</small></div>}</div>
          </main>

          <nav className={styles.mobileNav} aria-label="Demo sections">
            {TAB_LABELS.map((item) => <button key={item.id} className={`${styles.mobileNavItem} ${tab === item.id ? styles.mobileNavItemActive : ""}`} onClick={() => { setTab(item.id); setShowAddStock(false); }}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
          </nav>
        </div>
      )}

      {screen === "app" && editingNote && (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setEditingNote(false)}>
          <section className={styles.editModal} role="dialog" aria-modal="true" aria-labelledby="edit-reason-title" onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} aria-label="Close" onClick={() => setEditingNote(false)}>×</button>
            <p className={styles.eyebrow}>{editingRevisit ? "YOUR REVIEW RULE" : "YOUR INVESTING NOTE"}</p><h2 id="edit-reason-title">{editingRevisit ? "What would make you revisit this?" : "What are you watching for?"}</h2>
            <textarea className={styles.textArea} rows={4} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} />
            <div className={styles.modalActions}><button className={styles.secondaryButton} onClick={() => setEditingNote(false)}>Cancel</button><button className={styles.primaryButton} onClick={saveEditedNote}>Save note</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
