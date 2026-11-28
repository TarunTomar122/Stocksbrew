/**
 * What the first-party analytics reads from a User-Agent: whether it is a bot,
 * the device class and the browser family. Pure, so the beacon route and the
 * tests share it. Nothing else from the UA is kept.
 */

/**
 * Crawlers, link unfurlers, monitors, headless browsers and HTTP libraries. A
 * real browser always sends "Mozilla/5.0"; anything that does not is dropped too.
 */
const BOT_RE = new RegExp(
  [
    "bot\\b", "bot/", "-bot", "_bot", "crawl", "spider", "slurp", "scrape", "headless", "phantomjs", "puppeteer", "playwright",
    "selenium", "webdriver", "lighthouse", "pagespeed", "pingdom", "uptime", "monitor", "statuscake", "datadog", "newrelic",
    "facebookexternalhit", "facebot", "embedly", "quora link preview", "skypeuripreview", "preview", "vercel", "curl/", "wget/", "python", "httpclient", "http_request", "java/", "okhttp", "go-http",
    "axios", "node-fetch", "undici", "libwww", "feedfetcher", "rss", "ahrefs", "semrush", "mj12", "dotbot", "petalbot",
    "bytespider", "gptbot", "chatgpt", "oai-searchbot", "claudebot", "claude-web", "anthropic", "perplexity", "ccbot",
    "applebot", "yandex", "baiduspider", "duckduckbot", "bingpreview", "google-inspectiontool", "googleother", "adsbot",
    "mediapartners", "cloudflare", "check_http", "nagios", "zgrab", "masscan", "nmap",
  ]
    .join("|"),
  "i",
);

/**
 * True for a scripted browser passing for a person: Lightpanda (a headless browser made for scraping), or a
 * User-Agent the browser's own client hints contradict. A Chromium browser sends its real version in Sec-CH-UA
 * ("Chromium";v="146") and the same major version in its User-Agent (Chrome/146; Edge, Opera, Brave, Samsung and
 * Android WebViews too), and Firefox and Safari send no Sec-CH-UA at all. Nov 22: a scraper on residential proxies
 * loaded /news and /calendar/earnings/* ~200 times an hour as "Chrome/119" or "Firefox/121" while its hints said
 * Chrome 146, and its pages' beacons filled the live analytics with ~40 fake visitors.
 */
export function isForgedBrowser(ua: string | null | undefined, secChUa: string | null | undefined): boolean {
  const agent = ua ?? "";
  if (/Lightpanda/i.test(agent)) return true;
  const chromium = /"Chromium";\s*v="(\d+)"/i.exec(secChUa ?? "");
  if (!chromium) return false;
  const chrome = /\bChrome\/(\d+)/.exec(agent);
  return !chrome || chrome[1] !== chromium[1];
}

/** Chromium's GREASE brand: "Not" + two characters + "A" ... "Brand" and a dummy version, all derived from the
 * Chromium major version (components/embedder_support/user_agent_utils.cc). Older majors used another scheme. */
const GREASE_CHARS = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
const GREASE_VERSIONS = ["8", "99", "24"];
const GREASE_SINCE_MAJOR = 110;

/**
 * True when Sec-CH-UA carries a GREASE brand Chromium would not send for its own version (Chrome 130 sends
 * "Not?A_Brand";v="99", Chrome 154 "Not A(Brand";v="99"), or none at all. Nov 27 08:13: a scraper on residential
 * proxies (a new country nearly every request) sent ~280 stock and calendar page loads in two minutes as Chrome
 * 121-154 with hints that matched the User-Agent but always carried Chrome 116's "Not)A;Brand";v="24"; stock pages
 * took up to 30 s. In the logs since Nov 16, 95% of Chromium page loads match; the rest come in bursts like that or as
 * a steady few dozen an hour from what look like bots (Chrome 124 on macOS with Chrome 134's brand).
 * A throttle signal, not proof: crawlerVerdict gives these one shared bucket instead of refusing them.
 */
export function hasForgedGrease(secChUa: string | null | undefined): boolean {
  const hints = secChUa ?? "";
  const chromium = /"Chromium";\s*v="(\d+)"/i.exec(hints);
  if (!chromium) return false;
  const major = Number(chromium[1]);
  if (!Number.isSafeInteger(major) || major < GREASE_SINCE_MAJOR) return false;
  const grease = /"(Not[^"]*Brand)";\s*v="(\d+)/.exec(hints);
  const brand = `Not${GREASE_CHARS[major % 11]}A${GREASE_CHARS[(major + 1) % 11]}Brand`;
  return !grease || grease[1] !== brand || grease[2] !== GREASE_VERSIONS[major % 3];
}

export function isBot(ua: string | null | undefined): boolean {
  const value = (ua ?? "").trim();
  if (value.length < 20 || value.length > 1000) return true;
  if (!/^Mozilla\/5\.0/.test(value)) return true;
  return BOT_RE.test(value);
}

export type DeviceClass = "desktop" | "mobile" | "tablet";

export function deviceClass(ua: string | null | undefined, screenWidth?: number | null): DeviceClass {
  const value = ua ?? "";
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(value)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(value)) return "mobile";
  // iPadOS asks for the desktop site and says "Macintosh": a touch-sized screen gives it away.
  if (/Macintosh/.test(value) && screenWidth != null && screenWidth > 0 && screenWidth < 1100) return "tablet";
  return "desktop";
}

export type BrowserFamily = "Chrome" | "Safari" | "Firefox" | "Edge" | "Samsung" | "Opera" | "Brave" | "Other";

export function browserFamily(ua: string | null | undefined): BrowserFamily {
  const value = ua ?? "";
  if (/Edg(e|A|iOS)?\//.test(value)) return "Edge";
  if (/OPR\/|Opera/.test(value)) return "Opera";
  if (/SamsungBrowser\//.test(value)) return "Samsung";
  if (/Brave/.test(value)) return "Brave";
  if (/Firefox\/|FxiOS\//.test(value)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(value)) return "Chrome";
  if (/Safari\//.test(value) && /Version\//.test(value)) return "Safari";
  // In-app browsers on iOS (Instagram, X, LinkedIn) are WebKit without "Version/": Safari for our purposes.
  if (/iPhone|iPad|iPod/.test(value) && /AppleWebKit/.test(value)) return "Safari";
  return "Other";
}

/** Screen width as a coarse bucket, so the exact size (a fingerprinting bit) is never stored. */
export function screenBucket(width: unknown): string | null {
  const n = typeof width === "number" ? width : Number(width);
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  if (n < 480) return "<480";
  if (n < 768) return "480-767";
  if (n < 1024) return "768-1023";
  if (n < 1440) return "1024-1439";
  if (n < 1920) return "1440-1919";
  return "1920+";
}
