type FaqItem = { question: string; answer: string };

export function FaqSection({ faqs, title = "Common questions" }: { faqs: FaqItem[]; title?: string }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-[22px] font-medium tracking-tight text-oa-fg">{title}</h2>
      <dl className="flex max-w-[720px] flex-col gap-5">
        {faqs.map((faq) => (
          <div key={faq.question} className="flex flex-col gap-1.5">
            <dt className="text-[15px] font-medium tracking-tight text-oa-fg">{faq.question}</dt>
            <dd className="text-sm leading-relaxed text-oa-muted-fg">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
