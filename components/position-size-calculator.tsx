"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

function toNum(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toNum0(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type RiskMode = "percent" | "dollars";

export function PositionSizeCalculator() {
  const [accountSize, setAccountSize] = useState("");
  const [riskMode, setRiskMode] = useState<RiskMode>("percent");
  const [riskValue, setRiskValue] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [maxAllocation, setMaxAllocation] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [ticker, setTicker] = useState("");

  const a = toNum(accountSize);
  const rv = toNum(riskValue);
  const ep = toNum(entryPrice);
  const sp = toNum(stopPrice);
  const ma = toNum0(maxAllocation);
  const tp = toNum0(targetPrice);

  const result = useMemo(() => {
    if (!a || !rv || !ep || !sp) return null;

    if (sp === ep) return { error: "Stop-loss cannot equal entry price." };

    const riskPerShare = Math.abs(ep - sp);
    const dollarRisk = riskMode === "percent" ? a * (rv / 100) : rv;

    if (dollarRisk <= 0) return { error: "Risk amount must be greater than zero." };

    let shares = Math.floor(dollarRisk / riskPerShare);

    if (shares <= 0) return { error: "Not enough risk budget to buy at least one share. Increase your risk or widen your stop." };

    let capped = false;
    if (ma !== null) {
      const maxSharesByAlloc = Math.floor(a * (ma / 100) / ep);
      if (maxSharesByAlloc < shares) {
        shares = maxSharesByAlloc;
        capped = true;
      }
    }

    const positionValue = shares * ep;
    const portfolioPct = (positionValue / a) * 100;
    const actualRisk = shares * riskPerShare;
    const rr = tp !== null ? Math.abs(tp - ep) / riskPerShare : null;

    return {
      shares,
      positionValue,
      portfolioPct,
      riskPerShare,
      dollarRisk: actualRisk,
      rr,
      capped,
      maxAllocApplied: ma !== null,
    };
  }, [a, rv, riskMode, ep, sp, ma, tp]);

  const tickerSlug = ticker.trim().toUpperCase();

  return (
    <div className="flex flex-col gap-8 w-full max-w-[960px]">
      {/* Input card */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 md:p-8 flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Account size */}
          <InputField
            label="Account size ($)"
            value={accountSize}
            onChange={setAccountSize}
            placeholder="e.g. 50000"
          />

          {/* Risk per trade */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-[#111111]">Risk per trade</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0"
                value={riskValue}
                onChange={(e) => setRiskValue(e.target.value)}
                placeholder={riskMode === "percent" ? "e.g. 1.5" : "e.g. 750"}
                className="flex-1 rounded-xl border border-[#d1d5db] px-3.5 py-2.5 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#0052ff] transition-colors"
              />
              <button
                type="button"
                onClick={() => setRiskMode(riskMode === "percent" ? "dollars" : "percent")}
                className="shrink-0 rounded-xl border border-[#d1d5db] px-3.5 py-2.5 text-[13px] font-semibold text-[#6b7280] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors min-w-[52px]"
              >
                {riskMode === "percent" ? "%" : "$"}
              </button>
            </div>
          </div>

          {/* Entry price */}
          <InputField
            label="Entry price ($)"
            value={entryPrice}
            onChange={setEntryPrice}
            placeholder="e.g. 150.00"
          />

          {/* Stop-loss price */}
          <InputField
            label="Stop-loss price ($)"
            value={stopPrice}
            onChange={setStopPrice}
            placeholder="e.g. 142.50"
          />

          {/* Max allocation (optional) */}
          <InputField
            label="Max portfolio allocation % (optional)"
            value={maxAllocation}
            onChange={setMaxAllocation}
            placeholder="e.g. 10"
          />

          {/* Target price for R:R (optional) */}
          <InputField
            label="Target price for R:R (optional)"
            value={targetPrice}
            onChange={setTargetPrice}
            placeholder="e.g. 165.00"
          />
        </div>

        {/* Ticker (optional) */}
        <div className="flex flex-col gap-1.5 max-w-[380px]">
          <label className="text-[13px] font-semibold text-[#111111]">
            Ticker (optional)
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            maxLength={10}
            className="rounded-xl border border-[#d1d5db] px-3.5 py-2.5 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#0052ff] transition-colors uppercase"
          />
        </div>
      </div>

      {/* Results */}
      {result && "error" in result ? (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-6">
          <p className="text-[14px] font-medium text-[#991b1b]">{result.error}</p>
        </div>
      ) : result ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 md:p-8 flex flex-col gap-5">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#111111]">
            Position Summary
          </h2>

          {result.capped && (
            <div className="rounded-xl border border-[#fef3c7] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">
              Position capped to {result.shares.toLocaleString()} shares — full risk would exceed your{" "}
              {maxAllocation}% max allocation cap.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ResultItem label="Shares to buy" value={result.shares.toLocaleString()} />
            <ResultItem
              label="Position value"
              value={`$${result.positionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <ResultItem
              label="Portfolio %"
              value={`${result.portfolioPct.toFixed(2)}%`}
            />
            <ResultItem
              label="Risk per share"
              value={`$${result.riskPerShare.toFixed(2)}`}
            />
            <ResultItem
              label="Total dollar risk"
              value={`$${result.dollarRisk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            {result.rr !== null && (
              <ResultItem
                label="Risk / Reward"
                value={`1 : ${result.rr.toFixed(2)}`}
              />
            )}
          </div>

          {/* CTA links */}
          {tickerSlug && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#f3f4f6]">
              <Link
                href="/watchlist"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0052ff] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#0045d6] transition-colors"
              >
                Add {tickerSlug} to Watchlist
              </Link>
              <Link
                href={tickerSlug ? `/should-i-buy/${tickerSlug}` : "/should-i-buy"}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d1d5db] px-5 py-2 text-[13px] font-medium text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
              >
                Run Should I Buy on {tickerSlug}
              </Link>
              <Link
                href="/compare-stocks"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d1d5db] px-5 py-2 text-[13px] font-medium text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
              >
                Compare stocks
              </Link>
            </div>
          )}

          {!tickerSlug && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#f3f4f6]">
              <Link
                href="/watchlist"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0052ff] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#0045d6] transition-colors"
              >
                Track stocks in your Watchlist
              </Link>
              <Link
                href="/should-i-buy"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d1d5db] px-5 py-2 text-[13px] font-medium text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
              >
                Try Should I Buy
              </Link>
              <Link
                href="/compare-stocks"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d1d5db] px-5 py-2 text-[13px] font-medium text-[#374151] hover:border-[#0052ff] hover:text-[#0052ff] transition-colors"
              >
                Compare stocks
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {/* Empty state hint */}
      {!result && (
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-6 md:p-8">
          <p className="text-[14px] text-[#6b7280]">
            Fill in your account size, risk, entry, and stop-loss to see your position size.
          </p>
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-[#111111]">{label}</label>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-[#d1d5db] px-3.5 py-2.5 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#0052ff] transition-colors"
      />
    </div>
  );
}

function ResultItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-[#f9fafb] px-4 py-3">
      <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#6b7280]">
        {label}
      </span>
      <span className="text-[18px] font-semibold tracking-[-0.02em] text-[#111111]">
        {value}
      </span>
    </div>
  );
}
