import { createElement } from "react";
import { ImageResponse } from "next/dist/server/web/spec-extension/image-response";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Server-side logo proxy for emails and OG images.
 *
 * Single URL:  /api/logo-proxy?url=<encoded>
 * Ticker chain: /api/logo-proxy?ticker=NET&fallback=1&url=<optional-preferred>
 */
const ALLOWED_HOSTS = [
  "static2.finnhub.io",
  "static9.finnhub.io",
  "logo.clearbit.com",
  "www.google.com",
  "financialmodelingprep.com",
  "cdn.brandfetch.io",
  "storage.googleapis.com",
  "s3.amazonaws.com",
  "companiesmarketcap.com",
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

/**
 * The fallback as a PNG: Gmail and Outlook do not show SVG images, so an email logo for a ticker with no
 * logo would otherwise be blank. Same look as monogramSvg (initials on a colour from the ticker).
 */
function monogramPng(ticker: string, size = 64): Response {
  const symbol = ticker.toUpperCase();
  const initials = symbol.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "?";
  return new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: fallbackColor(symbol),
          borderRadius: 8,
          color: "#ffffff",
          fontSize: initials.length > 1 ? Math.round(size * 0.34) : Math.round(size * 0.45),
          fontWeight: 700,
        },
      },
      initials,
    ),
    {
      width: size,
      height: size,
      headers: {
        // lowercase so it replaces ImageResponse's own year-long immutable default (a ticker that gets a real logo
        // later must not keep its monogram)
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
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
      if (parsed.protocol === "https:" && hostAllowed(parsed.hostname)) out.push(preferredUrl);
    } catch {
      // ignore invalid preferred url
    }
  }
  out.push(finnhubUrl(symbol));
  if (domain) out.push(clearbitUrl(domain));
  out.push(fmpUrl(symbol));
  return [...new Set(out)];
}

async function fetchLogoBytes(url: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  try {
    let current = url;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parsed = new URL(current);
      if (parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) return null;
      const upstream = await fetch(current, {
        headers: { "User-Agent": "stocksbrew-logo-proxy/1.0" },
        signal: AbortSignal.timeout(3000),
        redirect: "manual",
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!upstream.ok) return null;
      const contentType = upstream.headers.get("content-type") ?? "";
      if (!/^(image\/png|image\/jpeg|image\/webp)(;|$)/i.test(contentType)) return null;
      const buffer = await upstream.arrayBuffer();
      // Reject favicons / blank placeholders.
      if (buffer.byteLength < 220) return null;
      return { buffer, contentType: contentType.split(";")[0] };
    }
    return null;
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
      const image = await fetchLogoBytes(candidate);
      if (image) {
        return imageResponse(image.buffer, image.contentType);
      }
    }
    if (useFallback) {
      // emails ask for the PNG; a page can still ask for the lighter SVG with format=svg
      if (req.nextUrl.searchParams.get("format") !== "svg") return monogramPng(ticker);
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

  if (parsed.protocol !== "https:" || !hostAllowed(parsed.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const image = await fetchLogoBytes(url);
  if (!image) {
    return new NextResponse("Upstream error", { status: 502 });
  }

  return imageResponse(image.buffer, image.contentType);
}
