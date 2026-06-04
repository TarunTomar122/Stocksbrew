type QA = { q: string; a: string };

const FAQS: QA[] = [
  {
    q: "What do I get for free?",
    a: "Track up to 3 stocks and see stocksbrew think about the market: live anomalies, Reddit buzz, and fresh earnings reads. The per-stock calls and your portfolio diagnosis are Pro.",
  },
  {
    q: "What does Pro actually add?",
    a: "Unlimited stocks on your Radar, a clear call on each one with the reasoning, pre-earnings setups before the print, portfolio diagnosis, anomalies and Reddit at full depth, and email alerts when something moves.",
  },
  {
    q: "Is this investment advice?",
    a: "No. stocksbrew is research and opinion to help you decide faster. You make the call. We are not a broker and we do not touch your money.",
  },
  {
    q: "How does the free trial work?",
    a: "You get 3 days of full Pro access. Cancel in one click before it ends and you pay nothing. No card games, no dark patterns.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click, no questions asked, and you keep access until the period you paid for runs out.",
  },
  {
    q: "Which markets do you cover?",
    a: "US markets today, with more on the way. Everything you see on the site runs on real, current data.",
  },
];

export function LandingFaq() {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#0052ff]">
          Before you ask
        </span>
        <h2 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1]">
          The honest answers.
        </h2>
      </div>

      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 gap-x-8 gap-y-7 md:grid-cols-2">
        {FAQS.map((item) => (
          <div key={item.q} className="flex flex-col gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
              {item.q}
            </h3>
            <p className="text-[14px] leading-relaxed text-[#6b7280]">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
