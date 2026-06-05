"use client";

import { useState } from "react";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";

type XrayCard = {
  ticker: string;
  name: string;
  sector: string | null;
  crowd_label: string;
  crowd_side: "bull" | "bear";
  our_stance: string;
  our_side: "bull" | "bear" | "neutral";
  reason: string;
  upside_pct: number | null;
};

type Xray = {
  offsideCount: number;
  scanned: number;
  topSector: string | null;
  topSectorPct: number;
  topSectorRegime: string | null;
};

function parseTickers(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

export function ContrarianXray() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<XrayCard[] | null>(null);
  const [xray, setXray] = useState<Xray | null>(null);
  const [scanned, setScanned] = useState(0);

  async function run() {
    const tickers = parseTickers(input);
    if (tickers.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/contrarian-xray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setXray(data.xray ?? null);
      setScanned(tickers.length);
    } catch {
      setCards([]);
      setXray(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <span className="text-[13px] font-semibold text-[#111111]">
          Want this on the stocks you own?
        </span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="Type tickers, e.g. NVDA AAPL MSFT AVGO"
            className="h-11 flex-1 rounded-full border border-[#e5e7eb] bg-white px-4 text-[14px] text-[#111111] outline-none focus:border-[#111111]"
          />
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#111111] px-6 text-[14px] font-semibold text-white transition-transform hover:-translate-y-[1px] disabled:opacity-60"
          >
            {busy ? "Scanning…" : "X-ray my book →"}
          </button>
        </div>
      </div>

      {cards !== null && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#111111]">
              {cards.length > 0
                ? `${cards.length} of your ${scanned} names: we'd play it differently`
                : `Scanned your ${scanned} names`}
            </h3>
            {xray && (xray.topSector || cards.length === 0) && (
              <p className="text-[13px] text-[#6b7280]">
                {xray.topSector
                  ? `${xray.topSectorPct}% sits in ${xray.topSector}${xray.topSectorRegime ? `, a ${xray.topSectorRegime.toLowerCase()} regime` : ""}.`
                  : "We are with the crowd on these. No strong disagreement."}
              </p>
            )}
          </div>

          {cards.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => {
                const us = c.our_side === "bull"
                  ? { text: "#047857", bg: "#ecfdf5" }
                  : { text: "#b91c1c", bg: "#fef2f2" };
                return (
                  <Link
                    key={c.ticker}
                    href={`/stock/${encodeURIComponent(c.ticker)}`}
                    className="group flex flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <StockLogo ticker={c.ticker} market="US" size={32} />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                          {c.ticker}
                        </span>
                        <span className="truncate max-w-[150px] text-[11px] text-[#9ca3af]">{c.name}</span>
                      </div>
                    </div>
                    <div className="text-[12px] text-[#6b7280]">
                      Crowd <span className="font-semibold text-[#374151]">{c.crowd_side === "bull" ? "🟢" : "🔴"} {c.crowd_label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#6b7280]">Us</span>
                      <span
                        className="rounded-md px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.04em]"
                        style={{ background: us.bg, color: us.text }}
                      >
                        {c.our_stance}
                      </span>
                    </div>
                    <p className="text-[12px] leading-snug text-[#6b7280]">{c.reason}</p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex justify-center">
            <Link
              href="/watchlist"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-6 py-3 text-[14px] font-semibold text-white transition-transform hover:-translate-y-[1px]"
            >
              Track these and get the full read every morning
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
