import type { TableDetail } from "@dipper/protocol";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Alert, AlertDescription } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../../ui/tabs";
import { useWorkspace } from "../context";
import { DataTab } from "./data-tab";
import { StructureView } from "./structure-view";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; detail: TableDetail };

/** One table, three ways: its rows, its structure, and the DDL that would recreate it. */
export function TableEditor({ schema, table }: { schema: string; table: string }): React.ReactElement {
  const { tableDetail } = useWorkspace();
  const [load, setLoad] = React.useState<Load>({ status: "loading" });

  React.useEffect(() => {
    let current = true;
    setLoad({ status: "loading" });
    tableDetail(schema, table)
      .then((detail) => current && setLoad({ status: "ready", detail }))
      .catch((error: unknown) => current && setLoad({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [tableDetail, schema, table]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-base font-medium">
          {schema}.{table}
        </h2>
        {load.status === "ready" && <Badge variant="secondary">{load.detail.kind.replace("_", " ")}</Badge>}
        {load.status === "ready" && load.detail.comment && (
          <span className="truncate text-sm text-muted-foreground">{load.detail.comment}</span>
        )}
      </header>
      {load.status === "loading" && (
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Spinner /> Reading the table
        </p>
      )}
      {load.status === "error" && (
        <Alert className="m-4" variant="error">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}
      {load.status === "ready" && (
        <Tabs className="min-h-0 flex-1" defaultValue="data">
          <TabsList className="mx-4 mt-2 w-fit" variant="underline">
            <TabsTab value="data">Data</TabsTab>
            <TabsTab value="structure">Structure</TabsTab>
            <TabsTab value="ddl">DDL</TabsTab>
          </TabsList>
          <TabsPanel className="flex min-h-0 flex-1 flex-col" value="data">
            <DataTab detail={load.detail} />
          </TabsPanel>
          <TabsPanel className="min-h-0 flex-1 overflow-auto" value="structure">
            <StructureView detail={load.detail} />
          </TabsPanel>
          <TabsPanel className="min-h-0 flex-1 overflow-auto" value="ddl">
            <DdlView ddl={load.detail.ddl} />
          </TabsPanel>
        </Tabs>
      )}
    </div>
  );
}

function DdlView({ ddl }: { ddl: string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(ddl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative p-4">
      <Button className="absolute end-6 top-6" onClick={copy} size="xs" variant="outline">
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">{ddl}</pre>
    </div>
  );
}
