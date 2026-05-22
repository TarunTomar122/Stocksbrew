"use client";

import { useEffect, useState } from "react";

import { HeroSection } from "@/components/hero-section";

type HeroIndex = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

const FALLBACK: HeroIndex[] = [
  { ticker: "SPX", name: "S&P 500", price: 0, changePct: 0 },
  { ticker: "NDX", name: "Nasdaq 100", price: 0, changePct: 0 },
  { ticker: "VIX", name: "VIX", price: 0, changePct: 0 },
  { ticker: "GOLD", name: "Gold", price: 0, changePct: 0 },
  { ticker: "OIL", name: "Oil", price: 0, changePct: 0 },
];

export function HomeHeroLive() {
  const [indices, setIndices] = useState<HeroIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/home-hero-indices", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setIndices(FALLBACK);
            setLoading(false);
          }
          return;
        }
        const payload = (await res.json()) as { indices?: HeroIndex[] };
        const rows = Array.isArray(payload.indices) ? payload.indices : [];
        if (!cancelled) {
          setIndices(rows.length > 0 ? rows.slice(0, 5) : FALLBACK);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIndices(FALLBACK);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return <HeroSection indices={indices} isSubscribed={false} showIndexSkeleton={loading} />;
}
