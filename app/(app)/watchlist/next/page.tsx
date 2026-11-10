import { redirect } from "next/navigation";

/** Preview URL kept for bookmarks; main Radar lives at /watchlist. */
export default function WatchlistNextRedirect() {
  redirect("/watchlist");
}
