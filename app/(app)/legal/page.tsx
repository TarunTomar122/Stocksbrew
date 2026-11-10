import { redirect } from "next/navigation";

/** /legal has no page of its own: the terms are the first thing people look for. */
export default function LegalIndexPage() {
  redirect("/legal/terms");
}
