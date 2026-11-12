import Link from "next/link";

/**
 * The inbox with nothing in the last two weeks, or one that could not be read: one calm line under the title, not a
 * card. A read that failed says so instead of claiming nothing happened.
 */
export function EmptyInbox({ example = false, unavailable = false }: { example?: boolean; unavailable?: boolean }) {
  if (unavailable) {
    return (
      <p role="status" className="text-pretty px-1 text-[15px] leading-[22px] text-oa-muted-fg">
        We couldn&apos;t read {example ? "the example's" : "your"} inbox just now. Try again in a minute.
      </p>
    );
  }
  if (example) {
    return <p className="text-pretty px-1 text-[15px] leading-[22px] text-oa-muted-fg">Nothing has happened on the example portfolio&apos;s stocks in the last two weeks.</p>;
  }
  return (
    <p className="text-pretty px-1 text-[15px] leading-[22px] text-oa-muted-fg">
      Nothing has happened on your stocks in the last two weeks.{" "}
      <Link href="/agents" prefetch={false} className="font-medium text-oa-primary hover:underline">
        Set up an agent
      </Link>{" "}
      to have them watched for you.
    </p>
  );
}
