import type { Metadata } from "next";

import { PulsePrototype } from "@/components/pulse-prototype";

export const metadata: Metadata = {
  title: "Pulse prototype",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams?: { variant?: string };
};

export default function PulsePrototypePage({ searchParams }: Props) {
  const variant = searchParams?.variant === "B" || searchParams?.variant === "C" ? searchParams.variant : "A";

  return (
    <main className="flex-grow">
      <PulsePrototype initialVariant={variant} />
    </main>
  );
}
