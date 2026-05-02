import { LegalLayout } from "@/components/legal-layout";

export const metadata = {
  title: "Terms of service · Tikrr",
};

export default function TermsPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Terms of service"
      subtitle="The rules of the road for using Tikrr. By signing in or using the site, you agree to these terms."
      updated="May 2026"
    >
      <section>
        <h2>Who we are</h2>
        <p>
          Tikrr is a market-intelligence service that surfaces price action, news,
          and AI-generated commentary on publicly traded equities across US and
          Indian markets. "We", "us", and "Tikrr" refer to the operators of this
          service. "You" refers to the person using it.
        </p>
      </section>

      <section>
        <h2>Account &amp; eligibility</h2>
        <p>
          You must be at least 18 years old to create an account. You're
          responsible for keeping your sign-in credentials secure and for any
          activity under your account. We may suspend or terminate accounts that
          abuse the service, scrape data, or violate applicable law.
        </p>
      </section>

      <section>
        <h2>Not investment advice</h2>
        <p>
          Everything Tikrr publishes — including AI briefs, alerts, screens,
          scores, and price commentary — is for informational and educational
          purposes only. Tikrr is not a registered investment advisor. Nothing on
          the service is a recommendation to buy, sell, or hold any security. Do
          your own research and consider speaking to a licensed advisor before
          making investment decisions.
        </p>
      </section>

      <section>
        <h2>Data &amp; accuracy</h2>
        <p>
          We pull pricing, fundamentals, and news from third-party providers and
          generate AI commentary on top of that. Data can be delayed, incomplete,
          or wrong. We don't warrant the accuracy or timeliness of anything on
          the service. You use Tikrr at your own risk.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Don't scrape, mirror, or resell Tikrr data.</li>
          <li>Don't reverse-engineer the service or attempt to bypass rate limits.</li>
          <li>Don't use Tikrr to harass, deceive, or manipulate markets.</li>
        </ul>
      </section>

      <section>
        <h2>Subscriptions</h2>
        <p>
          Pro features may require a paid subscription. Pricing, billing cycles,
          and refund eligibility are described on the pricing page. While Tikrr is
          in beta, the watchlist tier is free of charge — we'll notify you well
          before that changes.
        </p>
      </section>

      <section>
        <h2>Termination</h2>
        <p>
          You can stop using Tikrr at any time. We can suspend or terminate the
          service, or your access to it, with reasonable notice — or immediately
          if you breach these terms.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the maximum extent permitted by law, Tikrr is not liable for any
          investment losses, lost profits, or indirect damages arising from your
          use of the service. The service is provided "as is".
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms? Email{" "}
          <a href="mailto:hello@tikrr.com">hello@tikrr.com</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
