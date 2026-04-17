type EmptyStateProps = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center justify-center py-24 text-center sm:py-32">
      <div className="mb-6 flex h-16 w-16 items-center justify-center border border-[#1A1A1A]">
        <span className="material-symbols-outlined text-3xl opacity-30">hourglass_empty</span>
      </div>
      <h1 className="mb-2 font-headline text-2xl italic text-[#1A1A1A]">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-[#6A6A6A]">{body}</p>
    </section>
  );
}
