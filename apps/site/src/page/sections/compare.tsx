import { Reveal } from "../../shared/motion";
import { Section, SectionHeading } from "../layout/section";
import { small } from "../layout/type";
import { COMPARED_ON, COMPARE_ROWS, TOOLS } from "./compare/rows";

/** How Dipper sits next to the tools people already use. A real table, so it reads out properly. */
export function CompareSection() {
  return (
    <Section id="compare" labelledBy="compare-title">
      <SectionHeading id="compare-title" title="How it compares." wide>
        Dipper is not trying to be every database tool. It is a small one that explains what your SQL does.
      </SectionHeading>
      <Reveal className="mt-10 overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Dipper compared with DBeaver, TablePlus, pgAdmin and psql</caption>
          <thead>
            <tr className="border-b">
              <td />
              {TOOLS.map((tool, index) => (
                <th
                  className={`px-3 py-3 font-medium ${index === 0 ? "text-foreground" : "text-muted-foreground"}`}
                  key={tool}
                  scope="col"
                >
                  {tool}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {COMPARE_ROWS.map((row) => (
              <tr key={row.label}>
                <th className="px-3 py-3 font-normal text-foreground" scope="row">
                  {row.label}
                </th>
                {row.cells.map((cell, index) => (
                  <td className={`px-3 py-3 ${index === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`} key={TOOLS[index]}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
      <p className={`${small} mt-4`}>
        Checked {COMPARED_ON}. Other projects keep changing, so confirm anything that matters to you in their own documentation.
      </p>
    </Section>
  );
}
