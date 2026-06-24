import Image from "next/image";

type Testimonial = {
  quote: string;
  displayName: string;
  handle: string;
  time: string;
  photoUrl: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I used to open six tabs before coffee. Now I check Radar and actually know if I should add or sit out. Talked me out of chasing SMCI on a green open last month.",
    displayName: "marcus",
    handle: "marcus_pnl",
    time: "Mar 12",
    photoUrl: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    quote:
      "The Reddit read on my watchlist caught the INTC pile-on a day early. I trimmed before my group chat even noticed.",
    displayName: "pri",
    handle: "priya_reads",
    time: "Mar 11",
    photoUrl: "https://randomuser.me/api/portraits/women/65.jpg",
  },
  {
    quote:
      "Got the NVDA ping at 7:12am with the actual reason, not just 'stock down.' Trimmed into strength instead of panic selling like I usually do.",
    displayName: "james",
    handle: "james_nvda",
    time: "Mar 10",
    photoUrl: "https://randomuser.me/api/portraits/men/45.jpg",
  },
  {
    quote:
      "Started on the free 3-stock plan. Upgraded after earnings week when it called the beat and fade before I saw it on X.",
    displayName: "elena",
    handle: "elena_earnings",
    time: "Mar 9",
    photoUrl: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    quote:
      "Sector heat plus movers in one scroll. I am not a full-time trader and this is finally enough context to make a call without spiraling.",
    displayName: "chris",
    handle: "lunch_trader",
    time: "Mar 8",
    photoUrl: "https://randomuser.me/api/portraits/men/22.jpg",
  },
  {
    quote:
      "My friend sent me the link thinking it was another stock Twitter clone. The hold call on AAPL matched what I was already thinking, which never happens.",
    displayName: "dan",
    handle: "dan_holdgang",
    time: "Mar 7",
    photoUrl: "https://randomuser.me/api/portraits/men/67.jpg",
  },
  {
    quote:
      "Pre-market tab showed me where the gaps were before the open. Took a small position in RTX and had a plan instead of reacting at the bell.",
    displayName: "aisha",
    handle: "gapandgo",
    time: "Mar 6",
    photoUrl: "https://randomuser.me/api/portraits/women/68.jpg",
  },
  {
    quote:
      "Alerts are the thing. Woke up to a trim call on a name I forgot I still held. Probably saved me a dumb hold through a guidance cut.",
    displayName: "tom",
    handle: "tom_alerts",
    time: "Mar 5",
    photoUrl: "https://randomuser.me/api/portraits/men/51.jpg",
  },
];

function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-on-surface-variant">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function TweetCard({ quote, displayName, handle, time, photoUrl }: Testimonial) {
  return (
    <article className="tweet-card w-[21rem] shrink-0 p-4">
      <div className="flex items-start gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-container">
          <Image
            src={photoUrl}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 truncate text-[14px] leading-tight">
              <span className="font-bold text-on-surface">{displayName}</span>{" "}
              <span className="text-on-surface-variant">@{handle}</span>{" "}
              <span className="text-on-surface-variant">· {time}</span>
            </div>
            <XGlyph />
          </div>
          <p className="mt-2 whitespace-normal text-[14px] leading-relaxed text-on-surface">{quote}</p>
        </div>
      </div>
    </article>
  );
}

function TestimonialStrip({ items }: { items: Testimonial[] }) {
  return (
    <div className="flex shrink-0 items-stretch gap-4 pr-4">
      {items.map((item) => (
        <TweetCard key={item.handle} {...item} />
      ))}
    </div>
  );
}

export function TerminalLandingTestimonials() {
  return (
    <section className="border-t border-outline-variant">
      <div className="landing-inner py-24">
        <div className="mb-1 font-mono text-[12px] text-accent-terminal">// the desk</div>
        <h2 className="mb-8 text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">What traders are saying</h2>

        <div className="testimonials-marquee overflow-hidden">
          <div className="sb-testimonials-tape">
            <TestimonialStrip items={TESTIMONIALS} />
            <TestimonialStrip items={TESTIMONIALS} />
          </div>
        </div>
      </div>
    </section>
  );
}
