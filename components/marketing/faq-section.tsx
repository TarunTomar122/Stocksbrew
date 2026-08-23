export type FaqItem = { question: string; answer: string };

export function FaqSection({ faqs, title = "Common questions" }: { faqs: FaqItem[]; title?: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[17px] font-medium tracking-tight text-oa-fg">{title}</h2>
      <div className="flex max-w-[720px] flex-col rounded-[18px] border border-oa-border bg-oa-card px-5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {faqs.map((faq) => (
          <details key={faq.question} className="group border-b border-oa-border py-4 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-oa-fg">
              {faq.question}
              <span className="shrink-0 text-lg font-normal text-oa-muted-fg transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pt-3 text-[13px] leading-relaxed text-oa-muted-fg">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
