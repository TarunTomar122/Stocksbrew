import { LegalLayout } from "@/components/legal-layout";

export const metadata = {
  title: "Cookie policy · tikrr",
};

export default function CookiesPage() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Cookie policy"
      subtitle="tikrr uses a small set of cookies to keep you signed in and to remember your market choice. We don't run tracking ads."
      updated="May 2026"
    >
      <section>
        <h2>Essential</h2>
        <ul>
          <li>
            <strong>Auth session</strong> - set by Firebase Authentication after
            you sign in. Lets you stay signed in across visits without
            re-authenticating.
          </li>
          <li>
            <strong>Market preference</strong> - remembers whether you're
            browsing US or IN markets so we don't reset it on every page load.
          </li>
        </ul>
      </section>

      <section>
        <h2>Analytics</h2>
        <p>
          We use a privacy-respecting analytics setup that doesn't store
          personally identifiable information in cookies. No cross-site
          advertising trackers run on tikrr.
        </p>
      </section>

      <section>
        <h2>Managing cookies</h2>
        <p>
          You can clear cookies in your browser at any time. If you clear the
          auth session cookie, you'll be signed out and need to sign back in.
        </p>
      </section>
    </LegalLayout>
  );
}
