import type { Metadata } from "next";
import type { ReactNode } from "react";

/** The owner's private pages: never indexed, never followed (robots.txt says so too). */
export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
