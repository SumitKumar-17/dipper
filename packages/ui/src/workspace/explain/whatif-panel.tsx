import type { WhatIfResult } from "@dipper/protocol";
import { XIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Alert, AlertDescription } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Spinner } from "../../ui/spinner";
import { useWorkspace } from "../context";
import { PlanCompare } from "./plan-compare";
import { addDefinition, isIndexDefinition } from "./whatif-model";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: WhatIfResult };

/**
 * Plans the statement as if some indexes existed. Nothing is built, so it is safe on a table of any
 * size, and the result says whether the planner would actually use each one.
 */
export function WhatIfPanel({ sql }: { sql: string }): React.ReactElement {
  const { whatIf } = useWorkspace();
  const [draft, setDraft] = React.useState("");
  const [definitions, setDefinitions] = React.useState<string[]>([]);
  const [state, setState] = React.useState<State>({ status: "idle" });

  const add = (): void => {
    if (!isIndexDefinition(draft)) return;
    setDefinitions((list) => addDefinition(list, draft));
    setDraft("");
  };

  const run = (): void => {
    setState({ status: "loading" });
    whatIf({ sql, indexes: definitions }).then(
      (result) => setState({ status: "ready", result }),
      (error: unknown) => setState({ status: "error", message: messageOf(error) }),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Type an index and see how the planner would run this query if it existed. Nothing is built.
      </p>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Index to try"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="create index on users (email)"
          value={draft}
        />
        <Button disabled={!isIndexDefinition(draft)} onClick={add} variant="outline">
          Add
        </Button>
      </div>
      {definitions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {definitions.map((d) => (
            <li className="flex items-center gap-2" key={d}>
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{d}</code>
              <Button aria-label={`Remove ${d}`} onClick={() => setDefinitions((list) => list.filter((x) => x !== d))} size="icon-sm" variant="ghost">
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button disabled={definitions.length === 0 || state.status === "loading"} onClick={run}>
          {state.status === "loading" ? <Spinner /> : null} Plan with {definitions.length === 1 ? "this index" : `${definitions.length} indexes`}
        </Button>
      </div>
      {state.status === "error" && (
        <Alert variant="error">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === "ready" && !state.result.available && (
        <Alert variant="warning">
          <AlertDescription>{state.result.reason}</AlertDescription>
        </Alert>
      )}
      {state.status === "ready" && state.result.available && state.result.before && state.result.after && (
        <>
          <ul className="flex flex-col gap-1">
            {state.result.indexes.map((index) => (
              <li className="flex flex-wrap items-center gap-2 text-sm" key={index.definition}>
                <code className="font-mono text-xs">{index.definition}</code>
                <Badge size="sm" variant={index.used ? "success" : "warning"}>
                  {index.used ? "the planner would use it" : "the planner ignores it"}
                </Badge>
              </li>
            ))}
          </ul>
          <PlanCompare after={state.result.after} before={state.result.before} />
        </>
      )}
    </div>
  );
}
