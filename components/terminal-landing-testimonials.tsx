import Image from "next/image";

type ReviewSegment = { text: string; highlight?: boolean };

type Review = {
  segments: ReviewSegment[];
  displayName: string;
  handle: string;
  photoUrl: string;
};

const REVIEWS: Review[] = [
  {
    segments: [
      { text: "I used to open six tabs before coffee. " },
      { text: "Now I check Radar and actually know if I should add or sit out.", highlight: true },
      { text: " Talked me out of chasing a gap-up loser last month." },
    ],
    displayName: "Marcus",
    handle: "marcus_pnl",
    photoUrl: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    segments: [
      { text: "The " },
      { text: "Reddit read on my watchlist caught the pile-on a day early.", highlight: true },
      { text: " I trimmed before my group chat even noticed." },
    ],
    displayName: "Margo",
    handle: "margo_reads",
    photoUrl: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    segments: [
      { text: "Got the " },
      { text: "trim call at 7am with the actual reason", highlight: true },
      { text: ", not just 'stock down.' Finally something I can act on before the open." },
    ],
    displayName: "Ravi",
    handle: "ravi_preopen",
    photoUrl: "https://randomuser.me/api/portraits/men/45.jpg",
  },
];

function StarRow() {
  return (
    <div className="landing-review-stars" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 20 20" aria-hidden className="landing-review-star">
          <path
            fill="currentColor"
            d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z"
          />
        </svg>
      ))}
    </div>
  );
}

function ReviewCard({ segments, displayName, handle, photoUrl }: Review) {
  return (
    <article className="landing-review-card flex h-full flex-col items-center px-2 text-center sm:px-4">
      <div className="flex h-5 w-full items-center justify-center">
        <StarRow />
      </div>
      <blockquote className="landing-review-quote mt-5 flex-1">
        {segments.map((segment, index) =>
          segment.highlight ? (
            <mark key={index} className="landing-review-highlight">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </blockquote>
      <footer className="mt-auto flex items-center justify-center gap-2.5 pt-6">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-container">
          <Image src={photoUrl} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-[14px] font-semibold leading-tight text-on-surface">{displayName}</p>
          <p className="text-[13px] leading-tight text-on-surface-variant">@{handle}</p>
        </div>
      </footer>
    </article>
  );
}

export function TerminalLandingTestimonials() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="landing-section-kicker text-landing-brand">Reviews</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">
            What people are saying
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-3 md:items-stretch md:gap-6 lg:gap-10">
          {REVIEWS.map((review) => (
            <ReviewCard key={review.handle} {...review} />
          ))}
        </div>
      </div>
    </section>
  );
}
