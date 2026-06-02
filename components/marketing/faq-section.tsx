type FaqItem = { question: string; answer: string };

export function FaqSection({ faqs, title = "Common questions" }: { faqs: FaqItem[]; title?: string }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em]">{title}</h2>
      <dl className="flex flex-col gap-4 max-w-[720px]">
        {faqs.map((faq) => (
          <div key={faq.question} className="flex flex-col gap-1.5">
            <dt className="text-[15px] font-semibold text-[#111111]">{faq.question}</dt>
            <dd className="text-[14px] text-[#6b7280] leading-relaxed">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
