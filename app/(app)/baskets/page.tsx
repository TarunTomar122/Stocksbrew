import { redirect } from "next/navigation";

/** /baskets has no list of its own yet: the builder is the place, and it lists the baskets you follow. */
export default function BasketsIndex() {
  redirect("/baskets/new");
}
