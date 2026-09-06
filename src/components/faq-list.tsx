import { faqJsonLd, type FaqItem } from "@/lib/faq";

export function FaqList({
  items,
  title,
  lang,
  headingId,
}: {
  items: readonly FaqItem[];
  title: string;
  lang?: string;
  headingId: string;
}) {
  return (
    <section className="faq" lang={lang} aria-labelledby={headingId}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(items) }} />
      <h2 id={headingId}>{title}</h2>
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </section>
  );
}
