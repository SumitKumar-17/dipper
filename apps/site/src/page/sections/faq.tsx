import { Reveal } from "../../shared/motion";
import { Section, SectionHeading } from "../layout/section";
import { FAQ } from "./faq/items";

/** Native disclosure elements: keyboard and screen reader behaviour for free, and no script to load. */
export function FaqSection() {
  // The same entries as structured data, so a search engine that runs the page can show them.
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <Section id="faq" labelledBy="faq-title">
      <SectionHeading id="faq-title" title="Questions." wide>
        The ones people ask before they install.
      </SectionHeading>
      <Reveal className="mt-10 max-w-3xl divide-y divide-border/60 border-y">
        {FAQ.map((item) => (
          <details className="group py-4" key={item.question}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {item.question}
              <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm/6 text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </Reveal>
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }} type="application/ld+json" />
    </Section>
  );
}
