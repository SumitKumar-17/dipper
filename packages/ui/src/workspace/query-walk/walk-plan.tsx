// The database's plan for the statement being walked, beside the walk, with the steps that do the
// open station's work lit. Estimated only: EXPLAIN without ANALYZE runs nothing, which is the same
// promise every probe of the walk keeps.

import type { Plan } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { PlanView } from "../explain/plan-view";
import { isSetOp } from "./clauses";
import { planNodesFor } from "./plan-stations";
import type { Section } from "./program";
import type { Station } from "./station-types";
import { useWalk } from "./walk-context";

type State =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly plan: Plan };

export function WalkPlan({
  section,
  station,
}: {
  section: Section | null;
  station: Station;
}): React.ReactElement {
  const { explain } = useWorkspace();
  const { program } = useWalk();
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    explain({ sql: program.text, analyze: false })
      .then((plan) => current && setState({ status: "ready", plan }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [explain, program.text]);

  // Only the final query's stations are matched: a CTE or subquery chapter runs inside the plan as
  // a node of its own, and its clauses are not the plan's top-level steps. The node names matched
  // are Postgres's; another dialect's plan is shown as it is rather than half matched.
  const main = section !== null && section.origin.kind === "main";
  const parsed = main ? section.parsed : null;
  const select = parsed !== null && !isSetOp(parsed) ? parsed : null;
  const unmatched: Unmatched | null =
    state.status === "ready" && state.plan.dialect !== "postgres"
      ? "dialect"
      : !main
        ? "chapter"
        : select === null
          ? "no-clauses"
          : null;
  const lit = React.useMemo(
    () =>
      state.status === "ready" && unmatched === null && select !== null
        ? new Set(planNodesFor(station, select, state.plan.root))
        : null,
    [select, state, station, unmatched],
  );
  // The lit steps are often deep in the tree and below the fold of a narrow panel, so the first of
  // them is brought into view whenever the station changes.
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    box.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [lit]);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <Spinner className="size-3" /> Asking the database for its plan
      </p>
    );
  }
  if (state.status === "error") {
    return <p className="text-destructive-foreground text-xs">{state.message}</p>;
  }
  return (
    <div className="flex flex-col gap-2" ref={box}>
      <p className="text-muted-foreground text-xs">{caption(lit, station, unmatched)}</p>
      <PlanView lit={lit ?? undefined} plan={state.plan} />
    </div>
  );
}

/** Why the plan is shown with nothing lit. */
type Unmatched = "dialect" | "chapter" | "no-clauses";

const UNMATCHED: Record<Unmatched, string> = {
  dialect: "The plan for the whole statement. Its steps are matched to stations on Postgres only, so nothing is lit here.",
  chapter:
    "The plan for the whole statement. Its steps are matched to the stations of the final query; open that chapter to see them lit.",
  "no-clauses":
    "The plan for the whole statement. Its steps are matched to the clauses of a single SELECT, and this chapter has none to match.",
};

function caption(
  lit: ReadonlySet<unknown> | null,
  station: Station,
  unmatched: Unmatched | null,
): string {
  if (unmatched !== null || lit === null) return UNMATCHED[unmatched ?? "chapter"];
  if (!station.present) return `${station.label} is not in this query, so no step does it.`;
  if (lit.size === 0) {
    return station.id === "select"
      ? "SELECT has no step of its own: each step computes the columns it hands up."
      : `No step of this plan does the work of ${station.label} on its own.`;
  }
  return `Lit: the ${lit.size === 1 ? "step" : `${lit.size} steps`} doing the work of ${station.label}, wherever the planner put ${lit.size === 1 ? "it" : "them"}.`;
}
