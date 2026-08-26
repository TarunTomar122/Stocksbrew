/** Shared stock-logo source resolution — safe for client and server imports.
 *
 * The client `StockLogo` component walks this ordered list with an <img>
 * onError fallback chain. Server-side callers (e.g. the @vercel/og share-card
 * route) cannot retry on error, so they use `resolveLogoUrl` to pick the single
 * most reliable source up front. */

// Domain map for the NSE names we care about. Used to prefer a domain logo
// before FMP, because FMP sometimes returns a valid-but-blank placeholder.
export const IN_DOMAIN: Record<string, string> = {
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

export const US_DOMAIN: Record<string, string> = {
  AAPL: "apple.com",
  ABBV: "abbvie.com",
  ABNB: "airbnb.com",
  ADBE: "adobe.com",
  AMD: "amd.com",
  ANET: "arista.com",
  AMGN: "amgen.com",
  AMZN: "amazon.com",
  APTV: "aptiv.com",
  AVGO: "broadcom.com",
  BA: "boeing.com",
  BAC: "bankofamerica.com",
  BRK_B: "berkshirehathaway.com",
  BRK_A: "berkshirehathaway.com",
  CAT: "cat.com",
  CEG: "constellationenergy.com",
  CMCSA: "comcast.com",
  COIN: "coinbase.com",
  COHR: "coherent.com",
  COST: "costco.com",
  CRM: "salesforce.com",
  CSCO: "cisco.com",
  CVX: "chevron.com",
  DIS: "disney.com",
  DLR: "digitalrealty.com",
  DOCN: "digitalocean.com",
  EQIX: "equinix.com",
  ETN: "eaton.com",
  EXPE: "expediagroup.com",
  F: "ford.com",
  GE: "ge.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  GS: "goldmansachs.com",
  HD: "homedepot.com",
  INTC: "intel.com",
  IREN: "iren.com",
  JNJ: "jnj.com",
  JPM: "jpmorganchase.com",
  KO: "coca-colacompany.com",
  LRCX: "lamresearch.com",
  MA: "mastercard.com",
  META: "meta.com",
  MRK: "merck.com",
  MS: "morganstanley.com",
  MSFT: "microsoft.com",
  MU: "micron.com",
  MRVL: "marvell.com",
  MOD: "modine.com",
  NFLX: "netflix.com",
  NKE: "nike.com",
  NVDA: "nvidia.com",
  ORCL: "oracle.com",
  PWR: "quanta.com",
  PEP: "pepsico.com",
  PFE: "pfizer.com",
  PG: "pg.com",
  PYPL: "paypal.com",
  QCOM: "qualcomm.com",
  SBUX: "starbucks.com",
  TSLA: "tesla.com",
  TSM: "tsmc.com",
  UBER: "uber.com",
  UNH: "unitedhealthgroup.com",
  V: "visa.com",
  VZ: "verizon.com",
  VRT: "vertiv.com",
  WMT: "walmart.com",
  XOM: "exxonmobil.com",
};

export function fmpUrl(ticker: string, market: "US" | "IN"): string {
  // FMP's free image API uses dashes in place of dots and resolves NSE names
  // when suffixed with `.NS`.
  const base = ticker.replace(/\./g, "-").toUpperCase();
  const t = market === "IN" ? `${base}.NS` : base;
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t)}.png`;
}

export function finnhubUrl(ticker: string): string {
  return `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${encodeURIComponent(
    ticker.replace(/\./g, "-").toUpperCase(),
  )}.png`;
}

export function clearbitUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export function domainForTicker(
  ticker: string,
  market: "US" | "IN",
): string | undefined {
  const normalized = ticker
    .toUpperCase()
    .replace(/\./g, "_")
    .replace(/-/g, "_");
  return market === "IN"
    ? IN_DOMAIN[ticker.toUpperCase()]
    : US_DOMAIN[normalized];
}

/** Ordered logo-source chain used by the client <img> fallback walk. */
export function stockLogoSources(
  ticker: string,
  market: "US" | "IN",
  logoUrl?: string | null,
): string[] {
  const domain = domainForTicker(ticker.toUpperCase(), market);
  const trimmedLogoUrl = String(logoUrl ?? "").trim();
  return market === "US"
    ? [
        ...(trimmedLogoUrl ? [trimmedLogoUrl] : []),
        finnhubUrl(ticker),
        ...(domain ? [clearbitUrl(domain), faviconUrl(domain)] : []),
        fmpUrl(ticker, market),
      ]
    : [
        ...(trimmedLogoUrl ? [trimmedLogoUrl] : []),
        ...(domain ? [faviconUrl(domain), clearbitUrl(domain)] : []),
        fmpUrl(ticker, market),
      ];
}

/** Single best logo URL for server-side renderers that can't retry on error.
 * Prefers a known-domain Clearbit logo (clean, transparent) before the CDN
 * providers, since those occasionally return blank placeholders. */
export function resolveLogoUrl(
  ticker: string,
  market: "US" | "IN",
  logoUrl?: string | null,
): string {
  const trimmedLogoUrl = String(logoUrl ?? "").trim();
  if (trimmedLogoUrl) return trimmedLogoUrl;
  const domain = domainForTicker(ticker.toUpperCase(), market);
  if (domain) return clearbitUrl(domain);
  return finnhubUrl(ticker);
}
