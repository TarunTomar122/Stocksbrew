import { browserFamily, deviceClass, isBot, screenBucket } from "@/lib/analytics/ua";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const FIREFOX_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("bot filter", () => {
  it("lets real browsers through", () => {
    for (const ua of [CHROME_MAC, SAFARI_IPHONE, SAFARI_MAC, FIREFOX_WIN, EDGE_WIN, ANDROID_PHONE, SAMSUNG, IPAD]) expect(isBot(ua)).toBe(false);
  });

  it("drops crawlers, unfurlers, headless browsers, monitors and HTTP libraries", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) facebookexternalhit/1.1",
      "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Twitterbot/1.0",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
      "",
      "Mozilla/5.0",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });
});

describe("device and browser", () => {
  it("classes devices", () => {
    expect(deviceClass(CHROME_MAC, 1440)).toBe("desktop");
    expect(deviceClass(SAFARI_IPHONE, 390)).toBe("mobile");
    expect(deviceClass(ANDROID_PHONE, 412)).toBe("mobile");
    expect(deviceClass(ANDROID_TABLET, 800)).toBe("tablet");
    expect(deviceClass(IPAD, 820)).toBe("tablet");
    // iPadOS asking for the desktop site
    expect(deviceClass(SAFARI_MAC, 820)).toBe("tablet");
    expect(deviceClass(SAFARI_MAC, 1512)).toBe("desktop");
  });

  it("names the browser family", () => {
    expect(browserFamily(CHROME_MAC)).toBe("Chrome");
    expect(browserFamily(SAFARI_IPHONE)).toBe("Safari");
    expect(browserFamily(FIREFOX_WIN)).toBe("Firefox");
    expect(browserFamily(EDGE_WIN)).toBe("Edge");
    expect(browserFamily(SAMSUNG)).toBe("Samsung");
    expect(browserFamily("Mozilla/5.0 (X11; Linux) Something")).toBe("Other");
  });

  it("buckets screen widths so the exact size is never kept", () => {
    expect(screenBucket(390)).toBe("<480");
    expect(screenBucket(1280)).toBe("1024-1439");
    expect(screenBucket(1920)).toBe("1920+");
    expect(screenBucket(-1)).toBeNull();
    expect(screenBucket("wide")).toBeNull();
  });
});
