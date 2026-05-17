"use client";

import { useRef, useState } from "react";
import type { SearchEntry } from "@/lib/search";

type Props = {
  onTickersFound: (tickers: string[]) => void;
  searchIndex: SearchEntry[];
};

// Strip common suffixes that appear in full company names but not in how
// search entries store them (or vice versa), so we get a clean base to match.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc\.?|corp\.?|corporation|ltd\.?|limited|plc|llc|co\.?|company|group|holdings|class [a-c]|shares|manufacturing|technologies|technology|systems|international|services|platforms|solutions)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ScreenshotUpload({ onTickersFound, searchIndex }: Props) {
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [foundCount, setFoundCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;

    setProcessing(true);
    setStatus("Reading image...");
    setFoundCount(null);
    setPreview(URL.createObjectURL(file));

    try {
      const Tesseract = await import("tesseract.js");
      setStatus("Running OCR...");

      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m: { status: string; progress?: number }) => {
          if (m.status === "recognizing text") {
            setStatus(`OCR: ${Math.round((m.progress ?? 0) * 100)}%`);
          }
        },
      });

      setStatus("Matching tickers...");

      const ocrText = data.text;
      const found = new Map<string, number>(); // ticker → position in OCR text (for ordering)

      // ── Strategy 1: company name matching ────────────────────────────────
      // Most brokerage screenshots show full company names, not ticker symbols.
      // For each search entry, check if a normalized version of its name appears
      // somewhere in the OCR text. Score by match length so longer/more specific
      // names beat short ambiguous ones.
      const ocrNorm = normalizeName(ocrText);

      // Track which normalized company names we've already matched so we don't
      // add both GOOG and GOOGL (same "alphabet" name) or BRK-A and BRK-B etc.
      const matchedNames = new Map<string, string>(); // normalizedName → ticker already chosen

      for (const entry of searchIndex) {
        const nameNorm = normalizeName(entry.name);
        if (nameNorm.length < 3) continue; // too short to be reliable
        const idx = ocrNorm.indexOf(nameNorm);
        if (idx !== -1) {
          // If this company name already matched a different ticker, skip
          if (matchedNames.has(nameNorm)) continue;
          if (!found.has(entry.ticker)) {
            found.set(entry.ticker, idx);
            matchedNames.set(nameNorm, entry.ticker);
          }
        }
      }

      // ── Strategy 2: exact ticker symbol matching ──────────────────────────
      // Secondary pass: look for the actual ticker symbols in the raw OCR text.
      // Only accept if it's in our universe (already validated).
      const tickerSet = new Set(searchIndex.map((e) => e.ticker.toUpperCase()));
      const words = ocrText.split(/[^A-Za-z0-9]+/);
      for (const word of words) {
        const upper = word.toUpperCase();
        if (upper.length >= 1 && upper.length <= 6 && tickerSet.has(upper) && !found.has(upper)) {
          // Use a large position number so these come after name-matched ones
          found.set(upper, 999999);
        }
      }

      // Sort by position in the OCR text (preserves the order they appear on screen)
      const result = [...found.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([ticker]) => ticker)
        .slice(0, 30);

      if (result.length === 0) {
        setStatus("No stocks recognised. Try a clearer screenshot — or paste tickers manually.");
        setFoundCount(null);
      } else {
        setFoundCount(result.length);
        setStatus(`Found ${result.length} stock${result.length > 1 ? "s" : ""}`);
        onTickersFound(result);
      }
    } catch (err) {
      console.error("OCR error:", err);
      setStatus("OCR failed. Try pasting tickers manually.");
    } finally {
      setProcessing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleFile(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          processing
            ? "border-[#0052ff] bg-[#f5f7ff]"
            : foundCount !== null
              ? "border-[#10b981] bg-[#f0fdf4]"
              : preview
                ? "border-[#ef4444] bg-[#fef2f2]"
                : "border-[#e5e7eb] bg-white hover:border-[#9ca3af] hover:bg-[#fafafa]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {processing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#0052ff] border-t-transparent animate-spin" />
            <p className="text-[13px] font-medium text-[#0052ff]">{status}</p>
          </div>
        ) : foundCount !== null ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#10b981]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 9l3.5 3.5L14 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[#10b981]">{foundCount} stock{foundCount > 1 ? "s" : ""} extracted</p>
            <p className="text-[11px] text-[#6b7280]">Drop another image to replace</p>
          </div>
        ) : preview ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fef2f2]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 4l10 10M14 4L4 14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[#ef4444]">No stocks recognised</p>
            <p className="text-[11px] text-[#6b7280]">Try a clearer screenshot, or paste tickers manually</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f4f6]">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#6b7280]">
                <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
                <path d="M18 13l-5-5L3 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#374151]">Drop a portfolio screenshot</p>
              <p className="text-[11px] text-[#9ca3af] mt-0.5">Works with Robinhood, Fidelity, Schwab, Zerodha, and most brokers</p>
            </div>
          </div>
        )}
      </div>

      {!processing && status && foundCount === null && preview && (
        <p className="text-[11px] text-[#6b7280] text-center px-2">{status}</p>
      )}
    </div>
  );
}
