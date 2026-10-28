import { ChevronRightIcon } from "lucide-react";
import * as React from "react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../../ui/collapsible";
import { Field, FieldDescription, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import type { AdvancedOption, ConnectionFields } from "./use-connection-fields";

type Row = { key: AdvancedOption; label: string; placeholder: string; hint: string };

const TLS_ROWS: Row[] = [
  { key: "sslrootcert", label: "CA certificate", placeholder: "/path/to/ca.pem", hint: "Trust a private CA, so the server's certificate can be verified." },
  { key: "sslcert", label: "Client certificate", placeholder: "/path/to/client.pem", hint: "For servers that ask the client to present one. Needs the key below." },
  { key: "sslkey", label: "Client key", placeholder: "/path/to/client.key", hint: "The private key for the client certificate." },
];

/** What a dialect lets you set beyond the address. Paths are read by the server, on its machine. */
function rowsFor(dialect: ConnectionFields["dialect"]): Row[] {
  if (dialect === "postgres") {
    return [
      { key: "search_path", label: "Search path", placeholder: "app, public", hint: "Schemas looked in for unqualified names, in order." },
      ...TLS_ROWS,
    ];
  }
  return [
    { key: "socket", label: "Unix socket", placeholder: "/var/run/mysqld/mysqld.sock", hint: "Connect through a socket file instead of the host and port." },
    ...TLS_ROWS,
  ];
}

/** Options most connections never need, folded away until asked for. */
export function AdvancedFields({ fields }: { fields: ConnectionFields }): React.ReactElement {
  const rows = rowsFor(fields.dialect);
  const set = rows.filter((row) => fields.advanced[row.key].trim() !== "").length;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group cursor-pointer">
        <span className="flex items-center gap-1 text-sm font-medium">
          <ChevronRightIcon className="size-4 transition-transform group-data-panel-open:rotate-90" />
          Advanced{set > 0 && <span className="font-normal text-muted-foreground"> ({set} set)</span>}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="flex flex-col gap-3 pt-3">
          {rows.map((row) => (
            <Field key={row.key}>
              <FieldLabel>{row.label}</FieldLabel>
              <Input
                autoComplete="off"
                onValueChange={(value) => fields.setAdvanced(row.key, value)}
                placeholder={row.placeholder}
                value={fields.advanced[row.key]}
              />
              <FieldDescription>{row.hint}</FieldDescription>
            </Field>
          ))}
          {fields.dialect === "postgres" && (
            <FieldDescription>
              For a unix socket, use the socket directory as the host, for example /var/run/postgresql.
            </FieldDescription>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
