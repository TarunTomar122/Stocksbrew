import { LegalLayout } from "@/components/legal-layout";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How stocksbrew collects, uses, and protects your personal data. Learn about cookies, third parties, and your controls.",
  alternates: { canonical: "/legal/privacy" },
  openGraph: {
    title: "Privacy policy · stocksbrew",
    description:
      "How stocksbrew collects, uses, and protects your personal data.",
    url: "https://www.stocksbrew.online/legal/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Privacy policy"
      subtitle="What we collect, why we collect it, and the controls you have over your data."
      updated="May 2026"
    >
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info</strong> - your name, email, and profile
            picture from Google when you sign in. We use Firebase Authentication
            to handle this.
          </li>
          <li>
            <strong>Radar &amp; preferences</strong> - the tickers you add and
            the market you've selected (US or IN), stored against your account.
          </li>
          <li>
            <strong>Usage signals</strong> - anonymized pageviews, navigation
            paths, and feature interactions to help us improve the product.
          </li>
        </ul>
      </section>

      <section>
        <h2>Why we collect it</h2>
        <p>
          To run the service. We use account info to identify you, Radar data to
          generate your personal AI briefs, and usage signals to find what's
          working and what's broken. We don't sell or rent your personal data.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We set a small number of essential cookies to keep you signed in and
          remember your market preference. See the{" "}
          <a href="/legal/cookies">cookie policy</a> for the full list.
        </p>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>Google (Firebase Auth) - sign-in.</li>
          <li>Firestore (Google Cloud) - your account and Radar storage.</li>
          <li>OpenAI - generates the natural-language AI briefs and alerts.</li>
          <li>
            News and pricing vendors - provide the underlying market data.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your controls</h2>
        <p>
          You can update your Radar any time in the app. To delete your account
          or request a copy of your data, email{" "}
          <a href="mailto:tomartarun2001@gmail.com">tomartarun2001@gmail.com</a>{" "}
          and we'll action the request within 30 days.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          stocksbrew isn't directed at children under 18 and we don't knowingly
          collect data from them. If you believe a minor has signed up, contact
          us and we'll remove the account.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If we make a material change to this policy, we'll surface it in the
          app and update the "last updated" date above.
        </p>
      </section>
    </LegalLayout>
  );
}
