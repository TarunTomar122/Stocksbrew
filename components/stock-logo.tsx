"use client";

import { useState } from "react";

type Props = {
  ticker: string;
  size?: number;
  className?: string;
  /** "IN" tickers need an `.NS` suffix on FMP and a domain-keyed Clearbit
   * fallback to land a real logo. Defaults to "US" behaviour. */
  market?: "US" | "IN";
  /** Background used for the monogram fallback. */
  fallbackBg?: string;
  /** Text color used for the monogram fallback. */
  fallbackFg?: string;
};

// Domain map for the NSE names we care about. Used to chain a Clearbit lookup
// when FMP doesn't have the logo.
const IN_DOMAIN: Record<string, string> = {
  RELIANCE: "ril.com",
  TCS: "tcs.com",
  INFY: "infosys.com",
  HDFCBANK: "hdfcbank.com",
  ICICIBANK: "icicibank.com",
  AXISBANK: "axisbank.com",
  SBIN: "sbi.co.in",
  KOTAKBANK: "kotak.com",
  LT: "larsentoubro.com",
  HINDUNILVR: "hul.co.in",
  ITC: "itcportal.com",
  BHARTIARTL: "airtel.in",
  ASIANPAINT: "asianpaints.com",
  MARUTI: "marutisuzuki.com",
  HCLTECH: "hcltech.com",
  BAJFINANCE: "bajajfinserv.in",
  BAJAJFINSV: "bajajfinserv.in",
  TITAN: "titan.co.in",
  WIPRO: "wipro.com",
  ULTRACEMCO: "ultratechcement.com",
  NESTLEIND: "nestle.in",
  "M&M": "mahindra.com",
  TATAMOTORS: "tatamotors.com",
  TATASTEEL: "tatasteel.com",
  POWERGRID: "powergrid.in",
  NTPC: "ntpc.co.in",
  ONGC: "ongcindia.com",
  COALINDIA: "coalindia.in",
  SUNPHARMA: "sunpharma.com",
  DRREDDY: "drreddys.com",
  CIPLA: "cipla.com",
  DIVISLAB: "divislabs.com",
  TECHM: "techmahindra.com",
  ADANIPORTS: "adaniports.com",
  ADANIENT: "adani.com",
  ADANIGREEN: "adanigreenenergy.in",
  INDUSINDBK: "indusind.com",
  "BAJAJ-AUTO": "bajajauto.com",
  HEROMOTOCO: "heromotocorp.com",
  EICHERMOT: "eichermotors.com",
  MANKIND: "mankindpharma.com",
  BAJAJHFL: "bajajhousingfinance.in",
  IDFCFIRSTB: "idfcfirstbank.com",
  NTPCGREEN: "ntpcgreenenergy.com",
  JIOFIN: "jiofin.com",
  GOLDBEES: "nipponindiaim.com",
  SILVERBEES: "nipponindiaim.com",
  PIDILITIND: "pidilite.com",
  GRASIM: "grasim.com",
  TATAPOWER: "tatapower.com",
  TATACONSUM: "tataconsumer.com",
  IRCTC: "irctc.co.in",
  DMART: "dmartindia.com",
  ZOMATO: "zomato.com",
  PAYTM: "paytm.com",
  POLICYBZR: "policybazaar.com",
  NYKAA: "nykaa.com",
  IRFC: "irfc.co.in",
  PFC: "pfcindia.com",
  RECLTD: "recindia.com",
  HAL: "hal-india.co.in",
  BEL: "bel-india.in",
  IOC: "iocl.com",
  BPCL: "bharatpetroleum.in",
  HINDPETRO: "hindustanpetroleum.com",
  GAIL: "gailonline.com",
};

function fmpUrl(ticker: string, market: "US" | "IN"): string {
  // FMP's free image API uses dashes in place of dots and resolves NSE names
  // when suffixed with `.NS`.
  const base = ticker.replace(/\./g, "-").toUpperCase();
  const t = market === "IN" ? `${base}.NS` : base;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t)}.png`;
}

function clearbitUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

export function StockLogo({
  ticker,
  size = 32,
  className = "",
  market = "US",
  fallbackBg = "#1c1c1e",
  fallbackFg = "#ffffff",
}: Props) {
  const upper = ticker.toUpperCase();
  const domain = market === "IN" ? IN_DOMAIN[upper] : undefined;

  // Source chain: FMP → Clearbit (when we know the domain) → monogram.
  const sources: string[] = [fmpUrl(ticker, market)];
  if (domain) sources.push(clearbitUrl(domain));

  const [sourceIndex, setSourceIndex] = useState(0);
  const initial = upper.charAt(0);
  const dim = `${size}px`;

  if (sourceIndex >= sources.length) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-semibold ${className}`}
        style={{
          width: dim,
          height: dim,
          background: fallbackBg,
          color: fallbackFg,
          fontSize: Math.round(size * 0.45),
        }}
        aria-hidden
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      key={sourceIndex}
      src={sources[sourceIndex]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setSourceIndex((i) => i + 1)}
      className={`shrink-0 rounded-md bg-white object-contain ring-1 ring-[#e5e7eb] ${className}`}
      style={{ width: dim, height: dim, padding: 2 }}
    />
  );
}
