import Link from "next/link";

/** The inbox with nothing in the last two weeks: what will land here, and the one step that fills it. */
export function EmptyInbox({ example = false, unavailable = false }: { example?: boolean; unavailable?: boolean }) {
  // Nothing came back because a read failed: say so instead of claiming nothing happened.
  if (unavailable) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-4 py-8 text-center">
        <p className="text-[15px] font-medium text-oa-fg">We couldn&apos;t read {example ? "the example's" : "your"} inbox just now.</p>
        <p className="mx-auto mt-1 max-w-lg text-pretty text-[14px] leading-5 text-oa-muted-fg">Try again in a minute.</p>
      </div>
    );
  }
  return (
    <div className="oa-surface border border-oa-border bg-oa-card px-4 py-8 text-center">
      <p className="text-[15px] font-medium text-oa-fg">{example ? "The example portfolio has nothing new in the last two weeks." : "Nothing has happened for you in the last two weeks."}</p>
      {example ? null : (
        <p className="mx-auto mt-1 max-w-lg text-pretty text-[14px] leading-5 text-oa-muted-fg">
          When an agent flags something, a call on one of your stocks moves or an investor you follow trades, it shows up here.{" "}
          <Link href="/agents" prefetch={false} className="font-medium text-oa-primary hover:underline">
            Set up an agent
          </Link>{" "}
          to have something watched for you.
        </p>
      )}
    </div>
  );
}
