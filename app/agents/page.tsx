import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "AI Stock Agent for Research, Watchlist, and Alerts",
  description: "Connect Claude Code, Hermes, OpenClaw or another AI agent to Stocksbrew stock research, Watchlist changes and alerts through MCP or REST.",
  keywords: [
    "AI stock agent",
    "stock market MCP server",
    "Hermes stock research",
    "OpenClaw stock research",
    "Claude Code stock analysis",
    "stock alerts API",
    "AI agent watchlist",
    "Telegram stock research bot",
    "WhatsApp stock alerts AI",
    "Discord stock research agent",
  ],
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Let your AI agent keep up with your stocks",
    description: "Give your AI agent your Watchlist, Explore data, Market Daily history, full stock detail and curated screens through current Stocksbrew data.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Stocksbrew for AI agents", description: "Stock detail, Explore, Market Daily history, screens, Watchlist and alerts through MCP or REST." },
};

const FAQS = [
  ["What can my agent read?", "Your Watchlist and holdings, the current Explore sections, the last seven Market Daily editions, curated screens, and full stock-page detail: facts, financials, valuation, price history, technicals, earnings, news and Reddit context."],
  ["Can my agent answer questions about a stock that isn't on my Watchlist?", "Yes. It returns the market, fundamental, score and technical data Stocksbrew has. If deeper research is missing, it says so and offers to queue it."],
  ["What happens when evidence is missing?", "Stocksbrew marks it missing, and the agent says not enough current evidence instead of inventing a thesis."],
  ["What happens while research is being generated?", "The response reports queued or running. Your agent gives a labeled baseline answer, then checks again later."],
  ["Can an agent change my Watchlist or alerts?", "It can only do this with write scopes granted, and should ask before every change. Stocksbrew cannot place trades or access a brokerage."],
  ["Can it message me on Telegram, WhatsApp, or Discord?", "OpenClaw, Hermes, or another agent can relay results through channels you configure. Stocksbrew supplies the data; your agent owns delivery."],
  ["Does it work with Claude Code, Cursor and Codex?", "Any client that supports remote Streamable HTTP MCP and OAuth. REST with a personal token works when MCP doesn't fit."],
  ["Is this included with Pro?", "Yes. Pro includes agent access, detailed calls, unlimited Watchlist, alerts and research generation."],
] as const;

function JsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "SoftwareApplication", name: "Stocksbrew for AI Agents", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: "https://www.stocksbrew.online/agents", description: metadata.description, offers: { "@type": "Offer", price: "9", priceCurrency: "USD" } },
        { "@type": "WebAPI", name: "Stocksbrew Agent API", url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers", description: "Stock detail, Explore, Market Daily history, curated screens, Watchlist and alert tools through MCP and REST." },
        { "@type": "FAQPage", mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      ],
    }) }} />
  );
}

function ChatDemo() {
  return (
    <div className="landing-card overflow-hidden rounded-2xl shadow-[0_24px_64px_-30px_rgba(0,0,0,0.38)]">
      <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#d97757] text-[10px] font-bold text-white">C</span>
          <div><p className="text-[12px] font-semibold">Claude</p><p className="text-[10px] text-on-surface-variant">New conversation</p></div>
        </div>
        <span className="font-mono text-[10px] text-on-surface-variant">•••</span>
      </div>
      <div className="bg-surface-container-low/50 px-5 py-6 sm:px-7 sm:py-7">
        <div className="ml-auto max-w-[88%] rounded-2xl bg-surface-container px-4 py-3 text-[13px] leading-relaxed text-on-surface">
          I have $1,000 lying around. Should I buy NVDA or AMD?
        </div>
        <div className="mt-6 flex items-start gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-landing-brand text-[10px] font-bold text-white">S</span>
          <div className="min-w-0 text-[13px] leading-relaxed text-on-surface">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 font-mono text-[10px] text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-bullish" />Stocksbrew <span className="text-landing-brand">get_stock_intelligence · NVDA, AMD</span>
            </div>
            <p>NVDA is the cleaner choice if you want the company with the stronger AI business today. You are paying for that certainty, so the stock can move hard if growth cools.</p>
            <p className="mt-3">AMD has more to prove in AI chips. That gives it more upside if execution lands, and a bumpier path if it doesn&apos;t.</p>
            <p className="mt-3 font-medium">For a long-term one-stock bet, I&apos;d lean NVDA. AMD is the higher-risk upside choice.</p>
          </div>
        </div>
        <div className="mt-6 border-t border-outline-variant pt-4 text-[10px] text-on-surface-variant">
          Current stock research, valuation and market signals from Stocksbrew
        </div>
      </div>
    </div>
  );
}

export default async function AgentsPage() {
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const subscribed = resolveIsSubscribed(userDoc);

  return (
    <main className="landing-page min-w-0 flex-grow bg-surface text-on-surface">
      <JsonLd />

      <header className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
          <div className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-24">
            <div>
              <h1 className="max-w-xl text-[40px] font-semibold leading-[1.03] tracking-[-0.05em] sm:text-[58px]">Let your agent keep up with your stocks.</h1>
              <p className="mt-6 max-w-lg text-[16px] leading-[1.65] text-on-surface-variant sm:text-[18px]">Claude and ChatGPT don&apos;t know what happened in the market this morning. Connect Stocksbrew and they will.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="#connect" className="landing-btn-primary px-5 py-3 text-[13px]">Connect your agent</Link>
                <Link href="#access" className="landing-btn-secondary px-5 py-3 text-[13px]">See how it works</Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-on-surface-variant">
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-signal-bullish" />MCP over OAuth</span>
                <span>Included with Pro</span>
                <span>No brokerage access</span>
              </div>
            </div>
            <ChatDemo />
          </div>
        </div>
      </header>

      <section id="access" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
          <p className="landing-section-kicker text-landing-brand">What changes in the conversation</p>
          <div className="mt-7 grid divide-y divide-outline-variant border-y border-outline-variant md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="py-5 md:px-6 md:first:pl-0">
              <p className="text-[15px] font-semibold">It knows your Watchlist</p>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">Your tracked stocks, alerts and the latest changes are already there.</p>
            </div>
            <div className="py-5 md:px-6">
              <p className="text-[15px] font-semibold">Research any stock</p>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">Ask a normal question. It can pull the full stock page when the answer needs evidence.</p>
            </div>
            <div className="py-5 md:px-6 md:pr-0">
              <p className="text-[15px] font-semibold">It keeps uncertainty clear</p>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">Missing data stays labeled as not enough current evidence.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="connect" className="scroll-mt-24 border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="landing-section-kicker text-landing-brand">Connect once</p>
            <h2 className="mt-3 max-w-md text-[30px] font-semibold tracking-[-0.035em] sm:text-[40px]">One prompt, and your agent is set up.</h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-on-surface-variant">Use it in Claude Code, ChatGPT, Cursor, Codex or another OAuth-capable client.</p>
            <AgentClientLogos className="mt-6" />
            <p className="mt-7 text-[12px] leading-relaxed text-on-surface-variant">Read context is available immediately. Your agent should ask before changing a Watchlist stock or price alert.</p>
          </div>
          <div>
            <AgentSetupPrompt compact />
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-on-surface-variant">
              <span>OAuth keeps your token out of the chat.</span>
              <Link href="/developers" className="font-semibold text-landing-brand">Full tool reference →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant bg-surface-container-low/35">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
          <div className="flex flex-col gap-6 border-y border-outline-variant py-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="landing-section-kicker text-landing-brand">For developers</p>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] sm:text-[30px]">Need the full tool map?</h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-surface-variant">Every MCP tool, scope, REST endpoint, quota and error shape, in one reference.</p>
            </div>
            <Link href="/developers" className="landing-btn-secondary shrink-0 self-start px-5 py-3 text-[13px] sm:self-auto">Open developer docs →</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-outline-variant">
        <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 lg:py-16">
          <div className="landing-card flex flex-col gap-6 rounded-2xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
            <div>
              <p className="landing-section-kicker text-landing-brand">Ready when you are</p>
              <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] sm:text-[30px]">Give your agent the same context you use.</h2>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-on-surface-variant">$9/month. Three days free. Detailed calls, unlimited Watchlist, alerts, research generation and agent access.</p>
            </div>
            <Link href={subscribed ? "#connect" : "/subscribe"} className="landing-btn-primary shrink-0 self-start px-5 py-3 text-[13px] sm:self-auto">
              {subscribed ? "Connect your agent" : "Start your 3-day free trial"}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[820px] px-5 py-12 sm:px-8 lg:py-16">
        <p className="landing-section-kicker text-landing-brand">Questions</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">Before you connect</h2>
        <div className="mt-6 divide-y divide-outline-variant border-y border-outline-variant">
          {FAQS.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-semibold text-on-surface [&::-webkit-details-marker]:hidden">
                {question}
                <span aria-hidden className="font-mono text-[18px] font-normal text-on-surface-variant transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
