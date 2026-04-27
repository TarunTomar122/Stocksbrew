"use client";

import { ReactNode } from "react";
import NextTopLoader from "nextjs-toploader";

import { AuthProvider } from "@/lib/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
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
