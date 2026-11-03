import type { Dependent } from "@dipper/protocol";
import { AlertTriangleIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { plural } from "../../lib/format";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { groupDependents, mergeDependents, dependentName, type Target } from "./dependents-model";

type State = { status: "loading" } | { status: "ready"; items: Dependent[] } | { status: "failed"; message: string };

/** Loads what depends on each target. Targets are compared by value so a re-render never refetches. */
function useDependents(schema: string, table: string, targets: readonly Target[]): State {
  const { dependents } = useWorkspace();
  const [state, setState] = React.useState<State>({ status: "loading" });
  const key = JSON.stringify(targets);

  React.useEffect(() => {
    let current = true;
    const wanted = JSON.parse(key) as Target[];
    setState({ status: "loading" });
    Promise.all(wanted.map((t) => dependents(schema, table, t.column)))
      .then((results) => current && setState({ status: "ready", items: mergeDependents(results.map((r) => r.items)) }))
      .catch((error: unknown) => current && setState({ status: "failed", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [dependents, key, schema, table]);

  return state;
}

/**
 * Warns about what a change would leave pointing at something that moved or vanished. Renders nothing
 * when there are no targets, or nothing depends on them.
 */
export function DependentsNotice({ schema, table, targets }: { schema: string; table: string; targets: readonly Target[] }): React.ReactElement | null {
  const state = useDependents(schema, table, targets);
  if (targets.length === 0) return null;
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Looking for what depends on this
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <Alert variant="warning">
        <AlertDescription>Could not check what depends on this: {state.message}</AlertDescription>
      </Alert>
    );
  }
  if (state.items.length === 0) return null;
  const groups = groupDependents(state.items);
  return (
    <Alert variant="warning">
      <AlertTriangleIcon />
      <AlertTitle>{plural(state.items.length, "thing")} depend on this</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group.kind}>
              <div className="font-medium">{group.label}</div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li className="flex flex-wrap items-baseline gap-x-2" key={`${item.schema}.${item.table ?? ""}.${item.name}`}>
                    <span className="font-mono text-xs">{dependentName(item)}</span>
                    {item.depth > 1 && <span className="text-xs">through another view</span>}
                    {item.columns && item.columns.length > 0 && <span className="text-xs">uses {item.columns.join(", ")}</span>}
                    {item.guess && <Badge size="sm" variant="outline">found by name</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
