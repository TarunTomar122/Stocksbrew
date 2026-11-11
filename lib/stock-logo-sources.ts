/** Shared stock-logo source resolution — safe for client and server imports.
 *
 * The app's `StockLogo` no longer uses these: it reads our own stored tiles
 * through `logoSrc` (bottom of this file). The third-party chain below is kept
 * for the share-card and email renderers that still fetch remote logos. Note
 * logo.clearbit.com no longer resolves (Clearbit's free logo API was shut
 * down), so those entries only cost a failed lookup. */

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
  ABT: "abbott.com",
  ABBV: "abbvie.com",
  ABNB: "airbnb.com",
  ADBE: "adobe.com",
  AMD: "amd.com",
  ANET: "arista.com",
  AMGN: "amgen.com",
  AMZN: "amazon.com",
  APTV: "aptiv.com",
  AVGO: "broadcom.com",
  AVAV: "avinc.com",
  BA: "boeing.com",
  BAC: "bankofamerica.com",
  BRK_B: "berkshirehathaway.com",
  BRK_A: "berkshirehathaway.com",
  BX: "blackstone.com",
  CAT: "cat.com",
  CEG: "constellationenergy.com",
  CACI: "caci.com",
  CCJ: "cameco.com",
  BWXT: "bwxt.com",
  CMCSA: "comcast.com",
  COIN: "coinbase.com",
  COHR: "coherent.com",
  COF: "capitalone.com",
  COST: "costco.com",
  CRM: "salesforce.com",
  CSCO: "cisco.com",
  CVX: "chevron.com",
  CVS: "cvshealth.com",
  CME: "cmegroup.com",
  DIS: "disney.com",
  DLR: "digitalrealty.com",
  DXCM: "dexcom.com",
  DOCN: "digitalocean.com",
  EQIX: "equinix.com",
  ETN: "eaton.com",
  EXPE: "expediagroup.com",
  F: "ford.com",
  GE: "ge.com",
  GEV: "gevernova.com",
  GD: "gd.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  GS: "goldmansachs.com",
  HD: "homedepot.com",
  HII: "hii.com",
  ICE: "theice.com",
  INTC: "intel.com",
  IREN: "iren.com",
  ISRG: "intuitive.com",
  JNJ: "jnj.com",
  JPM: "jpmorganchase.com",
  KO: "coca-colacompany.com",
  KTOS: "kratosdefense.com",
  LNG: "cheniere.com",
  LRCX: "lamresearch.com",
  LLY: "lilly.com",
  LMT: "lockheedmartin.com",
  BLK: "blackrock.com",
  MA: "mastercard.com",
  META: "meta.com",
  MRK: "merck.com",
  MS: "morganstanley.com",
  MSFT: "microsoft.com",
  MU: "micron.com",
  MRVL: "marvell.com",
  MOD: "modine.com",
  NEE: "nexteraenergy.com",
  NFLX: "netflix.com",
  NKE: "nike.com",
  NOC: "northropgrumman.com",
  NVO: "novonordisk.com",
  NVDA: "nvidia.com",
  ORCL: "oracle.com",
  PLTR: "palantir.com",
  PWR: "quanta.com",
  PEP: "pepsico.com",
  PFE: "pfizer.com",
  PG: "pg.com",
  PYPL: "paypal.com",
  QCOM: "qualcomm.com",
  REGN: "regeneron.com",
  RTX: "rtx.com",
  SBUX: "starbucks.com",
  TSLA: "tesla.com",
  TSM: "tsmc.com",
  TMO: "thermofisher.com",
  UBER: "uber.com",
  UNH: "unitedhealthgroup.com",
  V: "visa.com",
  VZ: "verizon.com",
  VRT: "vertiv.com",
  VEEV: "veeva.com",
  VKTX: "vikingtherapeutics.com",
  VST: "vistracorp.com",
  WMB: "williams.com",
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

/** Ordered remote logo sources, for the share-card renderers. */
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

// -- Logos served from our own domain ----------------------------------------
//
// `backend/agentdata/stock_logos.py` fetches every covered ticker's logo once,
// turns it into a 128px square tile and stores it in `tm_stock_logos`.
// `app/api/logo/[symbol]` serves it with a one-year immutable cache, so a logo
// costs one small same-origin request the first time and nothing after that.
// The third-party chain above stays for emails and share cards only.

/** Part of every logo URL. The tiles are cached as immutable for a year, so a
 * logo the job replaces reaches browsers that already have the old one only
 * when this changes: bump it after a re-run that changed logos on purpose. */
export const LOGO_VERSION = "1";

/** A store key we will ask for: letters and digits, single dots between them
 * (BRK.B), `&` for NSE names like M&M, `^` for index symbols. Same rule as
 * `LOGO_KEY` in backend/agentdata/stock_logos.py. */
const LOGO_KEY_PATTERN = /^[A-Z0-9][A-Z0-9&^]*(?:\.[A-Z0-9&^]+)*$/;

export function isLogoKey(key: string): boolean {
  return key.length <= 15 && LOGO_KEY_PATTERN.test(key);
}

/** Store key for a ticker; matches `logo_key` in backend/agentdata/stock_logos.py. */
export function logoKey(ticker: string): string {
  return String(ticker || "")
    .trim()
    .toUpperCase()
    .replace(/[-_/]/g, ".");
}

/** Same-origin URL of a ticker's logo tile. */
export function logoSrc(ticker: string, market: "US" | "IN" = "US"): string {
  const key = encodeURIComponent(logoKey(ticker) || "?");
  return `/api/logo/${key}?v=${LOGO_VERSION}${market === "IN" ? "&m=IN" : ""}`;
}

/** Up to two letters for the lettered tile shown when a company has no logo. */
export function logoInitials(ticker: string): string {
  return String(ticker || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
}

/** Deterministic tile colour for a ticker, so its lettered tile never changes
 * (BRK-B and BRK.B get the same one, from the client or the server). */
export function logoFallbackColor(ticker: string): string {
  const upper = logoKey(ticker);
  let hash = 0;
  for (let i = 0; i < upper.length; i += 1) {
    hash = (hash * 31 + upper.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360} 62% 28%)`;
}

/** Full-bleed square SVG with the ticker's letters (the client crops the shape). */
export function logoMonogramSvg(ticker: string, size = 128): string {
  const initials = logoInitials(ticker);
  const fontSize = Math.round(size * (initials.length > 1 ? 0.38 : 0.5));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${logoFallbackColor(ticker)}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-weight="600" font-size="${fontSize}">${initials}</text></svg>`;
}
