"use client";

import { ReactNode } from "react";
import NextTopLoader from "nextjs-toploader";

import { AuthProvider } from "@/lib/auth-context";
import { GoogleAnalyticsPageview } from "@/components/google-analytics";
import { AttributionTrigger } from "@/components/attribution-trigger";
import { PostHogPageview } from "@/components/posthog-pageview";

type ProvidersProps = {
  children: ReactNode;
  initialAuthed: boolean;
};

export function Providers({ children, initialAuthed }: ProvidersProps) {
  return (
    <AuthProvider initialAuthed={initialAuthed}>
      <PostHogPageview />
      <GoogleAnalyticsPageview />
      <AttributionTrigger />
      <NextTopLoader
        color="var(--primary)"
        initialPosition={0.12}
        crawlSpeed={200}
        height={3}
        crawl={true}
        showSpinner={false}
        easing="ease"
        speed={400}
        shadow={false}
      />
      {children}
    </AuthProvider>
  );
}
