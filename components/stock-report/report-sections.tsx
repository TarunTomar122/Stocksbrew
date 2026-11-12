"use client";

import { memo, type ComponentType } from "react";

import type { SectionId } from "./primitives";
import { SectionTabs } from "./section-tabs";
import {
  EarningsSection,
  FinancialsSection,
  NewsSection,
  OverviewSection,
  OwnershipSection,
  PeersSection,
  TechnicalsSection,
  ValuationSection,
} from "./sections";
import type { SectionData } from "./types";
import type { TabTone } from "@/lib/stock-signals";
import type { SignalsProp } from "./signal-ui";

/**
 * Each tab's view, in the order of SECTION_LABELS. A new section adds its view here. Memoised: the data never
 * changes after load, so drawing the next tab on an idle moment does not draw the ones already there again.
 */
const VIEWS: Record<SectionId, ComponentType<{ data: SectionData; signals?: SignalsProp }>> = {
  overview: memo(OverviewSection),
  financials: memo(FinancialsSection),
  valuation: memo(ValuationSection),
  earnings: memo(EarningsSection),
  ownership: memo(OwnershipSection),
  news: memo(NewsSection),
  technicals: memo(TechnicalsSection),
  peers: memo(PeersSection),
};

/**
 * The deeper report, one part at a time, drawn in the browser from
 * `SectionData` (types.ts). The server sends the first tab's markup and the
 * data once; the other tabs are drawn from that data (section-tabs.tsx), so
 * their markup never travels.
 */
export function ReportSections({
  sections,
  data,
  signals = null,
}: {
  sections: Array<{ id: SectionId; label: string; count: number | null; tone?: TabTone | null }>;
  data: SectionData;
  /** The page's good and watch signals by id (lib/stock-signals.ts), one shared result for every tab. */
  signals?: SignalsProp;
}) {
  return (
    <SectionTabs
      // No mark after each tab's label (owner rule 1: nothing repeated on every tab); the header's good and to-watch
      // chips already say it once.
      sections={sections}
      renderPanel={(id) => {
        const View = VIEWS[id as SectionId];
        return View ? <View data={data} signals={signals} /> : null;
      }}
    />
  );
}
