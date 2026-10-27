import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { DatabaseObjects } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { DialogBackdrop, DialogPortal } from "../../ui/dialog";
import { Spinner } from "../../ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../../ui/tabs";
import { useWorkspace } from "../context";
import { OBJECTS_EVENT } from "./objects-event";
import { qualifiedName, signature } from "./signature";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; objects: DatabaseObjects };

/** Functions, sequences, enums, extensions and triggers. Opens on `requestObjects()`. */
export function ObjectsDialog(): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const listener = (): void => setOpen(true);
    window.addEventListener(OBJECTS_EVENT, listener);
    return () => window.removeEventListener(OBJECTS_EVENT, listener);
  }, []);

  return (
    <DialogPrimitive.Root onOpenChange={setOpen} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-6 z-50 flex min-h-0 min-w-0 origin-center flex-col outline-none",
            "transition-all duration-200 ease-in-out",
            "data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          )}
          data-slot="dialog-popup"
        >
          {open && <ObjectsPanel />}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function ObjectsPanel(): React.ReactElement {
  const { objects } = useWorkspace();
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    objects()
      .then((result) => current && setState({ status: "ready", objects: result }))
      .catch((error: unknown) => current && setState({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [objects]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="border-b px-4 py-3">
        <h2 className="text-base font-medium">Database objects</h2>
      </header>
      {state.status === "loading" && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Spinner /> Reading the catalog
        </p>
      )}
      {state.status === "error" && (
        <Alert className="m-4" variant="error">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === "ready" && <ObjectTabs objects={state.objects} />}
    </div>
  );
}

function ObjectTabs({ objects }: { objects: DatabaseObjects }): React.ReactElement {
  const groups = [
    { value: "routines", label: "Functions", count: objects.routines.length },
    { value: "sequences", label: "Sequences", count: objects.sequences.length },
    { value: "enums", label: "Enums", count: objects.enums.length },
    { value: "extensions", label: "Extensions", count: objects.extensions.length },
    { value: "triggers", label: "Triggers", count: objects.triggers.length },
  ];
  return (
    <Tabs className="min-h-0 flex-1" defaultValue="routines">
      <TabsList className="mx-4 mt-2 w-fit" variant="underline">
        {groups.map((g) => (
          <TabsTab key={g.value} value={g.value}>
            {g.label}
            <Badge size="sm" variant="secondary">
              {g.count}
            </Badge>
          </TabsTab>
        ))}
      </TabsList>
      <Panel value="routines">
        <Cards empty="No functions or procedures.">
          {objects.routines.map((r) => (
            <Card key={`${r.schema}.${signature(r)}`} subtitle={`${r.kind} · ${r.language} · ${r.schema}`} title={signature(r)}>
              {r.definition}
            </Card>
          ))}
        </Cards>
      </Panel>
      <Panel value="sequences">
        <Cards empty="No sequences.">
          {objects.sequences.map((s) => (
            <Card
              key={`${s.schema}.${s.name}`}
              subtitle={`${s.dataType} · step ${s.increment} · ${s.lastValue === null ? "not used yet" : `last value ${s.lastValue}`}`}
              title={qualifiedName(s.schema, s.name)}
            />
          ))}
        </Cards>
      </Panel>
      <Panel value="enums">
        <Cards empty="No enum types.">
          {objects.enums.map((e) => (
            <Card key={`${e.schema}.${e.name}`} subtitle={e.labels.join(" · ")} title={qualifiedName(e.schema, e.name)} />
          ))}
        </Cards>
      </Panel>
      <Panel value="extensions">
        <Cards empty="No extensions.">
          {objects.extensions.map((e) => (
            <Card key={e.name} subtitle={`version ${e.version} · schema ${e.schema}`} title={e.name} />
          ))}
        </Cards>
      </Panel>
      <Panel value="triggers">
        <Cards empty="No triggers.">
          {objects.triggers.map((t) => (
            <Card key={`${t.schema}.${t.table}.${t.name}`} subtitle={`on ${t.table}${t.enabled ? "" : " · disabled"}`} title={t.name}>
              {t.definition}
            </Card>
          ))}
        </Cards>
      </Panel>
    </Tabs>
  );
}

/** A tab's body: scrolls on its own, with the padding on a plain wrapper because TabsPanel owns its spacing. */
function Panel({ children, value }: { children: React.ReactNode; value: string }): React.ReactElement {
  return (
    <TabsPanel className="min-h-0 flex-1 overflow-auto" value={value}>
      <div className="p-4">{children}</div>
    </TabsPanel>
  );
}

function Cards({ children, empty }: { children: React.ReactNode; empty: string }): React.ReactElement {
  const items = React.Children.toArray(children);
  return items.length === 0 ? (
    <p className="text-sm text-muted-foreground">{empty}</p>
  ) : (
    <ul className="flex flex-col gap-3">{items}</ul>
  );
}

function Card({ children, subtitle, title }: { children?: React.ReactNode; subtitle: string; title: string }): React.ReactElement {
  return (
    <li className="rounded-md border bg-card p-3">
      <p className="font-mono text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      {children && <pre className="mt-2 max-h-64 overflow-auto rounded-sm bg-muted/40 p-2 font-mono text-xs">{children}</pre>}
    </li>
  );
}
