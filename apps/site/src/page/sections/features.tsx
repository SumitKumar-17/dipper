import { Reveal } from "../../shared/motion";
import { Section, SectionHeading } from "../layout/section";
import { small } from "../layout/type";
import { FEATURES } from "./features/items";

/** What else is in the app beyond the editor: the database tools, one card each. */
export function FeaturesSection() {
  return (
    <Section id="database-tools" labelledBy="tools-title">
      <SectionHeading id="tools-title" title="Look after the database, too." wide>
        Dipper is a workspace for the database as well as the queries. Everything below runs against
        your own server, and nothing changes until you have read it.
      </SectionHeading>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal as="li" delay={0.05 * (index % 3)} key={feature.title}>
            <article className="h-full rounded-xl border bg-card p-5">
              <h3 className="text-base font-medium text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm/6 text-muted-foreground">{feature.text}</p>
              <p className={`${small} mt-3`}>{feature.where}</p>
            </article>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
