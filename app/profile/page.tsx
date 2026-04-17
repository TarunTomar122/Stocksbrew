import Link from "next/link";

import { Shell } from "@/components/shell";

const user = {
  name: "Tanay Tomar",
  email: "tanay@tikrr.online",
  initials: "TT",
  joined: "Jan 2026",
  tier: "Premium",
  watchlist: [
    { ticker: "NVDA", name: "NVIDIA", change: +3.42 },
    { ticker: "AAPL", name: "Apple", change: -0.67 },
    { ticker: "MSFT", name: "Microsoft", change: +1.18 },
    { ticker: "GOOGL", name: "Alphabet", change: +0.94 },
    { ticker: "TSLA", name: "Tesla", change: +5.21 },
    { ticker: "AMZN", name: "Amazon", change: +2.14 },
  ],
  sectors: ["Technology", "AI & Semiconductors", "Cloud Infrastructure"],
  activity: {
    briefings_read: 47,
    stocks_analyzed: 128,
    alerts_received: 23,
    member_days: 62,
  },
  notifications: {
    ai_briefing: { label: "AI Morning Brief", desc: "Your personalized market intelligence at 6:30 AM", enabled: true },
    price_alerts: { label: "Price Alerts", desc: "When watchlist stocks move more than ±3%", enabled: true },
    weekly_digest: { label: "Weekly Digest", desc: "Saturday summary of the week's biggest moves", enabled: false },
    breaking_news: { label: "Breaking Signals", desc: "High-urgency events affecting your watchlist", enabled: true },
  },
};

export default function ProfilePage() {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl">

        {/* Profile header */}
        <section className="mb-8 overflow-hidden border border-[#1A1A1A]">
          <div className="border-b border-[#1A1A1A] bg-[#1A1A1A] px-8 py-8">
            <div className="flex items-center gap-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#D4AF37] text-2xl font-headline italic text-[#D4AF37]">
                {user.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-headline text-2xl italic text-white">{user.name}</h1>
                <p className="text-xs text-white/40">{user.email}</p>
              </div>
              <div className="hidden text-right sm:block">
                <span className="border border-[#D4AF37] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#D4AF37]">
                  {user.tier}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 px-8 py-6">
            {[
              { v: user.activity.briefings_read, l: "Briefs read" },
              { v: user.activity.stocks_analyzed, l: "Stocks viewed" },
              { v: user.activity.alerts_received, l: "Alerts" },
              { v: user.activity.member_days, l: "Days active" },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <p className="font-mono text-2xl tabular-nums text-[#1A1A1A]">{s.v}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#1A1A1A]/30">{s.l}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Watchlist */}
        <section className="mb-8 border border-[#1A1A1A]/10 p-6">
          <div className="mb-5 flex items-center justify-between border-b border-[#1A1A1A]/10 pb-4">
            <h3 className="font-headline text-lg italic">Watchlist</h3>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/30">{user.watchlist.length} stocks</span>
          </div>
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-3">
            {user.watchlist.map((stock) => (
              <Link
                key={stock.ticker}
                href={`/stock/${encodeURIComponent(stock.ticker)}?market=us`}
                className="flex items-center gap-3 border border-[#1A1A1A]/5 p-4 transition hover:border-[#D4AF37] hover:bg-white"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#1A1A1A] text-[10px] font-bold text-[#F9F8F6]">
                  {stock.ticker.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#1A1A1A]">{stock.ticker}</p>
                  <p
                    className={`text-[10px] font-bold font-mono tabular-nums ${stock.change >= 0 ? "text-[#2D6A4F]" : "text-[#9B2226]"}`}
                  >
                    {stock.change >= 0 ? "+" : ""}
                    {stock.change.toFixed(2)}%
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Sector focus */}
        <section className="mb-8 border border-[#1A1A1A]/10 p-6">
          <h3 className="mb-4 font-headline text-lg italic">Sector focus</h3>
          <div className="flex flex-wrap gap-2">
            {user.sectors.map((sector) => (
              <span
                key={sector}
                className="border border-[#1A1A1A]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1A1A1A]/60"
              >
                {sector}
              </span>
            ))}
          </div>
        </section>

        {/* Alert preferences */}
        <section className="mb-8 border border-[#1A1A1A]/10 p-6">
          <h3 className="mb-6 font-headline text-lg italic">Alert preferences</h3>
          <div className="space-y-6">
            {Object.values(user.notifications).map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">{item.label}</p>
                  <p className="mt-0.5 text-xs text-[#1A1A1A]/40">{item.desc}</p>
                </div>
                <div
                  className={`mt-0.5 flex h-6 w-11 shrink-0 cursor-default items-center px-0.5 transition-colors ${
                    item.enabled ? "bg-[#D4AF37]" : "bg-[#1A1A1A]/10"
                  }`}
                >
                  <div
                    className={`h-5 w-5 bg-white shadow-sm transition-transform ${
                      item.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Subscription */}
        <section className="relative mb-8 overflow-hidden border border-[#1A1A1A]/10 p-6">
          <div className="relative">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline text-lg italic">Subscription</h3>
              <span className="border border-[#D4AF37] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-[#D4AF37]">{user.tier}</span>
            </div>
            <p className="mb-5 text-sm text-[#1A1A1A]/50">
              Unlimited AI intelligence, real-time alerts, and full watchlist coverage.
            </p>
            <div className="mb-4 flex items-baseline gap-1">
              <span className="font-headline text-4xl italic text-[#1A1A1A]">$12</span>
              <span className="text-sm text-[#1A1A1A]/30">/month</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#1A1A1A]/40">
              <span className="material-symbols-outlined text-[#2D6A4F] text-sm">check_circle</span>
              Member since {user.joined}
              <span>·</span>
              Next billing: Feb 1, 2026
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between pb-8 pt-2">
          <p className="font-headline text-sm italic text-[#1A1A1A]/20">tikrr</p>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30 transition-colors hover:text-[#9B2226]"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Sign out
          </Link>
        </div>
      </div>
    </Shell>
  );
}
