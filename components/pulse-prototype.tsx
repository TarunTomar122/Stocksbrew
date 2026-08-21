"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StockLogo } from "@/components/stock-logo";

import styles from "./pulse-prototype.module.css";

type Variant = "A" | "B" | "C";
type Tier = "anonymous" | "free" | "pro";
type Tone = "up" | "down";

type Mover = {
  ticker: string;
  company: string;
  price: number;
  move: number;
  headline: string;
  category: string;
  sector: string;
  confidence: "High" | "Medium" | "Low";
  sources: number;
  tone: Tone;
  rsi: number;
  range: [number, number, number];
};

const MOVERS: Mover[] = [
  { ticker: "NVDA", company: "NVIDIA Corporation", price: 218.18, move: 8.42, headline: "Cloud buyers keep expanding AI infrastructure orders", category: "AI infrastructure", sector: "Technology", confidence: "High", sources: 8, tone: "up", rsi: 67, range: [108, 224, 218] },
  { ticker: "AVGO", company: "Broadcom Inc.", price: 361.2, move: 6.91, headline: "Custom AI silicon demand lifts the semiconductor group", category: "AI infrastructure", sector: "Technology", confidence: "High", sources: 6, tone: "up", rsi: 63, range: [155, 382, 361] },
  { ticker: "AMD", company: "Advanced Micro Devices", price: 184.74, move: 4.86, headline: "Data-centre pipeline is getting a fresh look after guidance", category: "AI infrastructure", sector: "Technology", confidence: "Medium", sources: 5, tone: "up", rsi: 59, range: [92, 198, 185] },
  { ticker: "MRNA", company: "Moderna, Inc.", price: 74.16, move: 3.98, headline: "Trial update gives the vaccine pipeline a near-term catalyst", category: "Biotech catalysts", sector: "Healthcare", confidence: "Medium", sources: 4, tone: "up", rsi: 54, range: [24, 126, 74] },
  { ticker: "WMT", company: "Walmart Inc.", price: 114.38, move: 2.61, headline: "Lower prices are supporting traffic while shoppers stay cautious", category: "Consumer demand", sector: "Consumer", confidence: "Medium", sources: 3, tone: "up", rsi: 52, range: [58, 121, 114] },
  { ticker: "CVX", company: "Chevron Corporation", price: 205.77, move: 1.84, headline: "Supply discipline is keeping energy names firm today", category: "Energy supply", sector: "Energy", confidence: "Low", sources: 2, tone: "up", rsi: 48, range: [132, 214, 206] },
  { ticker: "AAPL", company: "Apple Inc.", price: 316.46, move: -2.27, headline: "China demand questions are weighing on the hardware group", category: "China demand", sector: "Technology", confidence: "Medium", sources: 7, tone: "down", rsi: 43, range: [168, 329, 316] },
  { ticker: "SMCI", company: "Super Micro Computer, Inc.", price: 36.36, move: -4.58, headline: "Margin pressure is back in focus after a sharp run-up", category: "AI infrastructure", sector: "Technology", confidence: "Medium", sources: 5, tone: "down", rsi: 38, range: [25, 122, 36] },
  { ticker: "TSLA", company: "Tesla, Inc.", price: 318.52, move: -3.81, headline: "Delivery estimates are being reset ahead of the next update", category: "Demand reset", sector: "Consumer", confidence: "Medium", sources: 4, tone: "down", rsi: 41, range: [182, 488, 319] },
  { ticker: "CRWD", company: "CrowdStrike Holdings", price: 441.08, move: -2.64, headline: "Security software is giving back part of this month’s rally", category: "Software rotation", sector: "Technology", confidence: "Low", sources: 3, tone: "down", rsi: 46, range: [208, 468, 441] },
  { ticker: "UNH", company: "UnitedHealth Group", price: 279.64, move: -2.31, headline: "Policy uncertainty is keeping managed-care names under pressure", category: "Policy risk", sector: "Healthcare", confidence: "Medium", sources: 4, tone: "down", rsi: 39, range: [238, 630, 280] },
  { ticker: "XOM", company: "Exxon Mobil Corporation", price: 112.62, move: -1.72, headline: "Oil is softer and pulling large energy names lower", category: "Energy supply", sector: "Energy", confidence: "High", sources: 6, tone: "down", rsi: 45, range: [96, 126, 113] },
];

const STORIES = [
  { label: "AI infrastructure", count: 5, move: "+4.1%", tone: "up" as Tone, summary: "Cloud spending is lifting chip and server names together.", tickers: ["NVDA", "AVGO", "AMD"] },
  { label: "China demand", count: 2, move: "−2.8%", tone: "down" as Tone, summary: "Hardware names are moving lower on the same demand concern.", tickers: ["AAPL", "TSLA"] },
  { label: "Energy supply", count: 2, move: "mixed", tone: "up" as Tone, summary: "Oil and supply headlines are splitting the energy tape.", tickers: ["CVX", "XOM"] },
];

const VARIANTS: Array<{ id: Variant; name: string; description: string }> = [
  { id: "A", name: "Scan first", description: "Story groups above a master-detail mover board." },
  { id: "B", name: "Story first", description: "Cause clusters lead; movers sit in a broad board below." },
  { id: "C", name: "Market log", description: "A dense readable feed with detail below the list." },
];

function formatPrice(price: number) {
  return `$${price.toFixed(2)}`;
}

function formatMove(move: number) {
  return `${move >= 0 ? "+" : "−"}${Math.abs(move).toFixed(2)}%`;
}

function tierLimit(tier: Tier) {
  return tier === "anonymous" ? 4 : tier === "free" ? 6 : Infinity;
}

function Sparkline({ tone }: { tone: Tone }) {
  return (
    <svg className={styles.sparkline} viewBox="0 0 300 72" role="img" aria-label="Sample price chart">
      <path className={styles.sparkGrid} d="M0 18H300M0 36H300M0 54H300" />
      <path className={tone === "up" ? styles.sparkUp : styles.sparkDown} d="M2 55 C30 52, 43 60, 65 48 S98 51, 118 38 S148 43, 171 31 S206 40, 226 25 S261 28, 298 11" />
    </svg>
  );
}

function TierToggle({ tier, setTier }: { tier: Tier; setTier: (tier: Tier) => void }) {
  return (
    <div className={styles.tierToggle} aria-label="Preview access tiers">
      <span className={styles.tierLabel}>Preview as</span>
      {(["anonymous", "free", "pro"] as Tier[]).map((item) => (
        <button key={item} type="button" className={tier === item ? styles.tierActive : styles.tierButton} onClick={() => setTier(item)}>
          {item === "anonymous" ? "Visitor" : item === "free" ? "Free account" : "Pro"}
        </button>
      ))}
    </div>
  );
}

function StoryStrip({ onSelect }: { onSelect: (ticker: string) => void }) {
  return (
    <section className={styles.storyStrip} aria-labelledby="prototype-stories">
      <div className={styles.sectionIntro}>
        <div>
          <p className={styles.eyebrow}>What is moving together</p>
          <h2 id="prototype-stories">The market has a few stories today.</h2>
        </div>
        <p className={styles.sectionNote}>Cause groups are generated from the same mover evidence.</p>
      </div>
      <div className={styles.storyGrid}>
        {STORIES.map((story) => (
          <button key={story.label} type="button" className={styles.storyCard} onClick={() => onSelect(story.tickers[0])}>
            <div className={styles.storyCardTop}>
              <span className={styles.storyDot} data-tone={story.tone} />
              <span>{story.count} movers</span>
              <strong className={story.tone === "up" ? styles.up : styles.down}>{story.move}</strong>
            </div>
            <h3>{story.label}</h3>
            <p>{story.summary}</p>
            <div className={styles.storyTickers}>
              {story.tickers.map((ticker) => <span key={ticker}>{ticker}</span>)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MoverRow({ mover, selected, locked, onSelect }: { mover: Mover; selected: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`${styles.moverRow} ${selected ? styles.moverSelected : ""}`} onClick={onSelect}>
      <StockLogo ticker={mover.ticker} market="US" size={34} />
      <span className={styles.moverIdentity}>
        <strong>{mover.ticker}</strong>
        <small>{mover.company}</small>
      </span>
      <span className={styles.moverReason}>
        <span className={styles.moverHeadline}>{mover.headline}</span>
        <span className={styles.moverMeta}><span>{mover.category}</span><span>{mover.sources} sources</span><span className={mover.confidence === "High" ? styles.confidenceHigh : ""}>{mover.confidence}</span></span>
      </span>
      <span className={styles.moverPrice}>
        <strong>{formatPrice(mover.price)}</strong>
        <span className={mover.tone === "up" ? styles.up : styles.down}>{formatMove(mover.move)}</span>
      </span>
      {locked ? <span className={styles.lockMark} aria-label="Deeper context locked">⌕</span> : null}
    </button>
  );
}

function DetailPanel({ mover, locked, onOpenStock }: { mover: Mover; locked: boolean; onOpenStock: () => void }) {
  return (
    <aside className={styles.detailPanel} aria-labelledby="selected-mover">
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <StockLogo ticker={mover.ticker} market="US" size={42} />
          <div><p className={styles.eyebrow}>Selected mover</p><h2 id="selected-mover">{mover.ticker}</h2><p>{mover.company}</p></div>
        </div>
        <span className={mover.tone === "up" ? styles.moveBadgeUp : styles.moveBadgeDown}>{formatMove(mover.move)}</span>
      </div>
      <div className={styles.chartWrap}><Sparkline tone={mover.tone} /><div className={styles.chartAxis}><span>1 month</span><span>{formatPrice(mover.price)}</span></div></div>
      <div className={styles.detailFacts}>
        <div><span>Why it moved</span><strong>{mover.headline}</strong></div>
        <div><span>Evidence</span><strong>{mover.sources} sources · {mover.confidence} confidence</strong></div>
      </div>
      <div className={styles.detailRange}>
        <div><span>52-week range</span><strong>{formatPrice(mover.range[0])} — {formatPrice(mover.range[1])}</strong></div>
        <div><span>RSI (14)</span><strong>{mover.rsi}</strong></div>
      </div>
      <div className={locked ? styles.deepLock : styles.deepContext}>
        <div className={styles.deepContextHeading}><span>Stocksbrew read</span>{locked ? <span className={styles.proPill}>PRO</span> : <span className={styles.openPill}>OPEN</span>}</div>
        {locked ? <><h3>See what to watch next.</h3><p>The reason headline is open. Deeper context and comparison start with Pro.</p><Link href="/subscribe" className={styles.proButton}>Unlock deeper context →</Link></> : <><h3>What would change the read?</h3><p>Watch whether the next update confirms demand and keeps the group moving together.</p></>}
      </div>
      <button type="button" className={styles.stockLink} onClick={onOpenStock}>Open {mover.ticker} stock page →</button>
    </aside>
  );
}

function Board({ movers, selectedTicker, tier, onSelect }: { movers: Mover[]; selectedTicker: string; tier: Tier; onSelect: (ticker: string) => void }) {
  const limit = tierLimit(tier);
  return (
    <div className={styles.board}>
      <div className={styles.boardHeader}><div><p className={styles.eyebrow}>Today&apos;s movers</p><h2>30 names, one readable scan.</h2></div><span className={styles.boardCount}>12 shown in prototype</span></div>
      <div className={styles.boardColumns}>
        <div><div className={styles.columnHeading}><span>Gainers</span><span>{movers.filter((m) => m.tone === "up").length}</span></div>{movers.filter((m) => m.tone === "up").map((m, i) => <MoverRow key={m.ticker} mover={m} selected={m.ticker === selectedTicker} locked={i >= limit} onSelect={() => onSelect(m.ticker)} />)}</div>
        <div><div className={styles.columnHeading}><span>Losers</span><span>{movers.filter((m) => m.tone === "down").length}</span></div>{movers.filter((m) => m.tone === "down").map((m, i) => <MoverRow key={m.ticker} mover={m} selected={m.ticker === selectedTicker} locked={i >= limit} onSelect={() => onSelect(m.ticker)} />)}</div>
      </div>
    </div>
  );
}

function PrototypeSwitcher({ variant, setVariant }: { variant: Variant; setVariant: (variant: Variant) => void }) {
  const index = VARIANTS.findIndex((item) => item.id === variant);
  const change = (delta: number) => setVariant(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].id);
  return (
    <div className={styles.switcher} aria-label="Prototype variants">
      <button type="button" onClick={() => change(-1)} aria-label="Previous prototype">←</button>
      <span><strong>{variant}</strong> · {VARIANTS[index].name}</span>
      <button type="button" onClick={() => change(1)} aria-label="Next prototype">→</button>
    </div>
  );
}

function PrototypeHeader({ tier, setTier, variant }: { tier: Tier; setTier: (tier: Tier) => void; variant: Variant }) {
  return (
    <header className={styles.prototypeHeader}>
      <div><p className={styles.prototypeFlag}>TEMPORARY PROTOTYPE · VARIANT {variant}</p><h1>The market, with the reason in view.</h1><p>Scan every mover first. Open the deeper Stocksbrew read when a name deserves your time.</p></div>
      <TierToggle tier={tier} setTier={setTier} />
    </header>
  );
}

function VariantA({ selected, tier, onSelect, onOpenStock }: { selected: Mover; tier: Tier; onSelect: (ticker: string) => void; onOpenStock: () => void }) {
  return <><StoryStrip onSelect={onSelect} /><div className={styles.splitLayout}><Board movers={MOVERS} selectedTicker={selected.ticker} tier={tier} onSelect={onSelect} /><DetailPanel mover={selected} locked={MOVERS.findIndex((m) => m.ticker === selected.ticker) >= tierLimit(tier)} onOpenStock={onOpenStock} /></div></>;
}

function VariantB({ selected, tier, onSelect, onOpenStock }: { selected: Mover; tier: Tier; onSelect: (ticker: string) => void; onOpenStock: () => void }) {
  const topStory = STORIES[0];
  return <>
    <section className={styles.leadStory}><div><p className={styles.eyebrow}>Lead market story</p><h2>{topStory.label} is carrying the tape.</h2><p>{topStory.summary} The public read stays short; deeper context remains available when you need it.</p><div className={styles.storyTickers}>{topStory.tickers.map((ticker) => <button key={ticker} type="button" onClick={() => onSelect(ticker)}>{ticker}</button>)}</div></div><div className={styles.leadMetric}><strong>{topStory.move}</strong><span>{topStory.count} related movers</span></div></section>
    <section className={styles.clusterList}><div className={styles.sectionIntro}><div><p className={styles.eyebrow}>Cause groups</p><h2>Choose a story, then inspect its names.</h2></div><p className={styles.sectionNote}>This puts the “why” before the mover list.</p></div>{STORIES.map((story) => <button key={story.label} type="button" className={styles.clusterRow} onClick={() => onSelect(story.tickers[0])}><span className={styles.clusterIndex}>0{STORIES.indexOf(story) + 1}</span><span><strong>{story.label}</strong><small>{story.summary}</small></span><span>{story.count} names</span><strong className={story.tone === "up" ? styles.up : styles.down}>{story.move}</strong></button>)}</section>
    <div className={styles.storyBoard}><Board movers={MOVERS} selectedTicker={selected.ticker} tier={tier} onSelect={onSelect} /><DetailPanel mover={selected} locked={MOVERS.findIndex((m) => m.ticker === selected.ticker) >= tierLimit(tier)} onOpenStock={onOpenStock} /></div>
  </>;
}

function VariantC({ selected, tier, onSelect, onOpenStock }: { selected: Mover; tier: Tier; onSelect: (ticker: string) => void; onOpenStock: () => void }) {
  const [category, setCategory] = useState("All stories");
  const categories = ["All stories", ...Array.from(new Set(MOVERS.map((m) => m.category)))];
  const filtered = category === "All stories" ? MOVERS : MOVERS.filter((m) => m.category === category);
  return <>
    <section className={styles.logIntro}><div><p className={styles.eyebrow}>Market log</p><h2>Every move gets one useful sentence.</h2><p>Nothing is hidden behind a click just to understand the move. Pick a row when you want the full read.</p></div><div className={styles.logStats}><span><strong>30</strong> movers</span><span><strong>9</strong> story labels</span><span><strong>1</strong> market view</span></div></section>
    <div className={styles.categoryBar}>{categories.map((item) => <button key={item} type="button" className={category === item ? styles.categoryActive : styles.categoryButton} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <section className={styles.logLayout}><div className={styles.logList}><div className={styles.logHeader}><span>Stock</span><span>Reason</span><span>Move</span></div>{filtered.map((m, i) => <MoverRow key={m.ticker} mover={m} selected={m.ticker === selected.ticker} locked={i >= tierLimit(tier)} onSelect={() => onSelect(m.ticker)} />)}</div><DetailPanel mover={selected} locked={MOVERS.findIndex((m) => m.ticker === selected.ticker) >= tierLimit(tier)} onOpenStock={onOpenStock} /></section>
  </>;
}

export function PulsePrototype({ initialVariant }: { initialVariant: Variant }) {
  const [variant, setVariantState] = useState<Variant>(initialVariant);
  const [tier, setTier] = useState<Tier>("free");
  const [selectedTicker, setSelectedTicker] = useState("NVDA");
  const selected = useMemo(() => MOVERS.find((m) => m.ticker === selectedTicker) ?? MOVERS[0], [selectedTicker]);

  const setVariant = (next: Variant) => {
    setVariantState(next);
    window.history.replaceState({}, "", `${window.location.pathname}?variant=${next}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") setVariant("C");
      if (event.key === "ArrowRight") setVariant("B");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const openStock = () => window.alert(`Prototype link: /stock/${selected.ticker}`);

  return <div className={styles.page}><div className={styles.shell}><PrototypeHeader tier={tier} setTier={setTier} variant={variant} />{variant === "A" ? <VariantA selected={selected} tier={tier} onSelect={setSelectedTicker} onOpenStock={openStock} /> : variant === "B" ? <VariantB selected={selected} tier={tier} onSelect={setSelectedTicker} onOpenStock={openStock} /> : <VariantC selected={selected} tier={tier} onSelect={setSelectedTicker} onOpenStock={openStock} />}<p className={styles.disclaimer}>Prototype only · sample rows to test the layout · no live market data or account changes.</p></div><PrototypeSwitcher variant={variant} setVariant={setVariant} /></div>;
}
