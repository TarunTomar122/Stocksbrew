import { redirect } from "next/navigation";

import { PublicHomePage } from "@/components/public-home-page";
import { getSessionUser } from "@/lib/auth-server";
import { signedInHomeDestination } from "@/lib/home-routing";

export default async function HomePage() {
  const session = await getSessionUser().catch(() => null);
  const destination = signedInHomeDestination(Boolean(session));
  if (destination) redirect(destination);
  return <PublicHomePage />;
}
