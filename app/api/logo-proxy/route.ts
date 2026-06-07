import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side logo proxy for emails and OG images.
 *
 * Single URL:  /api/logo-proxy?url=<encoded>
 * Ticker chain: /api/logo-proxy?ticker=NET&fallback=1&url=<optional-preferred>
 */
const ALLOWED_HOSTS = [
  "static2.finnhub.io",
  "logo.clearbit.com",
  "www.google.com",
  "financialmodelingprep.com",
  "cdn.brandfetch.io",
  "storage.googleapis.com",
  "s3.amazonaws.com",
];

const US_DOMAIN: Record<string, string> = {
  AAPL: "apple.com",
  AMD: "amd.com",
  AMZN: "amazon.com",
  AVGO: "broadcom.com",
  COIN: "coinbase.com",
  CRM: "salesforce.com",
  DE: "deere.com",
  F: "ford.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  INTC: "intel.com",
  MDB: "mongodb.com",
  META: "meta.com",
  MSFT: "microsoft.com",
  NET: "cloudflare.com",
  NFLX: "netflix.com",
  NVDA: "nvidia.com",
  ORCL: "oracle.com",
  QCOM: "qualcomm.com",
  RIVN: "rivian.com",
  TSLA: "tesla.com",
  UBER: "uber.com",
};

function hostAllowed(hostname: string): boolean {
  return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
}

function finnhubUrl(ticker: string): string {
  return `https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/${encodeURIComponent(
    ticker.replace(/\./g, "-").toUpperCase(),
  )}.png`;
}

function fmpUrl(ticker: string): string {
  const base = ticker.replace(/\./g, "-").toUpperCase();
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(base)}.png`;
}

function clearbitUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

function fallbackColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i += 1) {
    hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 62% 28%)`;
}

function monogramSvg(ticker: string, size = 64): string {
  const symbol = ticker.toUpperCase();
  const initials = symbol.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
  const fontSize = initials.length > 1 ? Math.round(size * 0.34) : Math.round(size * 0.45);
  const bg = fallbackColor(symbol);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="8" fill="${bg}" />
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff"
    font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif" font-weight="700"
    font-size="${fontSize}">${initials}</text>
</svg>`;
}

function logoCandidates(ticker: string, preferredUrl?: string | null): string[] {
  const symbol = ticker.toUpperCase();
  const domain = US_DOMAIN[symbol.replace(/\./g, "_").replace(/-/g, "_")];
  const out: string[] = [];
  if (preferredUrl) {
    try {
      const parsed = new URL(preferredUrl);
      if (hostAllowed(parsed.hostname)) out.push(preferredUrl);
    } catch {
      // ignore invalid preferred url
    }
  }
  out.push(finnhubUrl(symbol));
  if (domain) out.push(clearbitUrl(domain));
  out.push(fmpUrl(symbol));
  return [...new Set(out)];
}

async function fetchLogoBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "stocksbrew-logo-proxy/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await upstream.arrayBuffer();
    // Reject favicons / blank placeholders.
    if (buffer.byteLength < 220) return null;
    return buffer;
  } catch {
    return null;
  }
}

function imageResponse(buffer: ArrayBuffer, contentType: string) {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  const preferredUrl = req.nextUrl.searchParams.get("url");
  const useFallback = req.nextUrl.searchParams.get("fallback") === "1";

  if (ticker) {
    for (const candidate of logoCandidates(ticker, preferredUrl)) {
      const buffer = await fetchLogoBytes(candidate);
      if (buffer) {
        return imageResponse(buffer, "image/png");
      }
    }
    if (useFallback) {
      const svg = monogramSvg(ticker);
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return new NextResponse("Logo not found", { status: 404 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url or ticker param", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!hostAllowed(parsed.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const buffer = await fetchLogoBytes(url);
  if (!buffer) {
    return new NextResponse("Upstream error", { status: 502 });
  }

  const contentType = "image/png";
  return imageResponse(buffer, contentType);
}
