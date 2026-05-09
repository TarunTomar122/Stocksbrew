"use client";

import { useEffect, useState } from "react";

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

const US_DOMAIN: Record<string, string> = {
  AAPL: "apple.com",
  ABBV: "abbvie.com",
  ABNB: "airbnb.com",
  ADBE: "adobe.com",
  AMD: "amd.com",
  AMGN: "amgen.com",
  AMZN: "amazon.com",
  APTV: "aptiv.com",
  AVGO: "broadcom.com",
  BA: "boeing.com",
  BAC: "bankofamerica.com",
  BRK_B: "berkshirehathaway.com",
  BRK_A: "berkshirehathaway.com",
  CAT: "cat.com",
  CMCSA: "comcast.com",
  COIN: "coinbase.com",
  COST: "costco.com",
  CRM: "salesforce.com",
  CSCO: "cisco.com",
  CVX: "chevron.com",
  DIS: "disney.com",
  DOCN: "digitalocean.com",
  EXPE: "expediagroup.com",
  F: "ford.com",
  GE: "ge.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  GS: "goldmansachs.com",
  HD: "homedepot.com",
  INTC: "intel.com",
  JNJ: "jnj.com",
  JPM: "jpmorganchase.com",
  KO: "coca-colacompany.com",
  MA: "mastercard.com",
  META: "meta.com",
  MRK: "merck.com",
  MS: "morganstanley.com",
  MSFT: "microsoft.com",
  MU: "micron.com",
  NFLX: "netflix.com",
  NKE: "nike.com",
  NVDA: "nvidia.com",
  ORCL: "oracle.com",
  PEP: "pepsico.com",
  PFE: "pfizer.com",
  PG: "pg.com",
  PYPL: "paypal.com",
  QCOM: "qualcomm.com",
  SBUX: "starbucks.com",
  TSLA: "tesla.com",
  UBER: "uber.com",
  UNH: "unitedhealthgroup.com",
  V: "visa.com",
  VZ: "verizon.com",
  WMT: "walmart.com",
  XOM: "exxonmobil.com",
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

function domainForTicker(ticker: string, market: "US" | "IN"): string | undefined {
  const normalized = ticker.toUpperCase().replace(/\./g, "_").replace(/-/g, "_");
  return market === "IN" ? IN_DOMAIN[ticker.toUpperCase()] : US_DOMAIN[normalized];
}

function fallbackColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i += 1) {
    hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 62% 28%)`;
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
  const domain = domainForTicker(upper, market);

  // Source chain: FMP → Clearbit (when we know the domain) → monogram.
  const sources: string[] = [fmpUrl(ticker, market)];
  if (domain) sources.push(clearbitUrl(domain));

  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    setSourceIndex(0);
  }, [upper, market]);

  const initials = upper.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
  const dim = `${size}px`;
  const bg = fallbackBg === "#1c1c1e" ? fallbackColor(upper) : fallbackBg;

  if (sourceIndex >= sources.length) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md font-semibold ${className}`}
        style={{
          width: dim,
          height: dim,
          background: bg,
          color: fallbackFg,
          fontSize: Math.round(size * (initials.length > 1 ? 0.34 : 0.45)),
        }}
        aria-hidden
      >
        {initials}
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
      onLoad={(event) => {
        const img = event.currentTarget;
        if (img.naturalWidth <= 4 || img.naturalHeight <= 4) {
          setSourceIndex((i) => i + 1);
        }
      }}
      className={`shrink-0 rounded-md bg-white object-contain ring-1 ring-[#e5e7eb] ${className}`}
      style={{ width: dim, height: dim, padding: 2 }}
    />
  );
}
