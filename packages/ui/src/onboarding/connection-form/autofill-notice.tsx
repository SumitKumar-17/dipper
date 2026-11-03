// What autofill did, said where it is seen: a mark on each field it filled, and one notice that
// names the source, what was kept, and the undo. The notice lists fields by name only; a filled
// password is said to be filled, never shown.

import { WandSparklesIcon } from "lucide-react";
import type * as React from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../../ui/alert";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { DIALECT_LABEL } from "../dialect-mark";
import type { Fill } from "./autofill/plan";
import type { ConnectionFields, FillKey } from "./use-connection-fields";

const FIELD_LABELS: Record<FillKey, string> = {
  dialect: "database type",
  mode: "view",
  name: "name",
  url: "URL",
  host: "host",
  port: "port",
  user: "user",
  password: "password",
  database: "database",
  ssl: "TLS",
  sslmode: "TLS mode",
  sslrootcert: "CA certificate",
  sslcert: "client certificate",
  sslkey: "client key",
  search_path: "search path",
  socket: "socket",
  ssh_host: "SSH host",
  ssh_port: "SSH port",
  ssh_user: "SSH user",
  ssh_key: "SSH key",
  ssh_fingerprint: "SSH host key",
};

const SOURCE_LABELS: Record<Fill["source"], string> = {
  url: "the pasted URL",
  jdbc: "the pasted JDBC string",
  psql: "the pasted psql command",
  mysql: "the pasted mysql command",
  sqlite: "the pasted SQLite path",
  env: "the pasted environment",
  dsn: "the pasted connection string",
  host: "the host",
};

/** At most a handful of names, so a long query string cannot push the form off the screen. */
function list(names: readonly string[]): string {
  const shown = names.slice(0, 8);
  const more = names.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Beside a field's label while it holds a value autofill put there. */
export function FilledMark({ fields, field }: { fields: ConnectionFields; field: FillKey }): React.ReactElement | null {
  return fields.isFilled(field) ? (
    <Badge size="sm" variant="info">
      filled
    </Badge>
  ) : null;
}

export function AutofillNotice({ fields }: { fields: ConnectionFields }): React.ReactElement | null {
  const { fill } = fields;
  if (fill === null) return null;

  if (fill.conflict !== undefined) {
    return (
      <Alert variant="warning">
        <WandSparklesIcon />
        <AlertTitle>Nothing filled</AlertTitle>
        <AlertDescription>
          That is a {DIALECT_LABEL[fill.conflict.pasted]} connection, and this one is{" "}
          {DIALECT_LABEL[fill.conflict.current]}. Add it as a new connection instead.
        </AlertDescription>
      </Alert>
    );
  }

  const labels = (keys: readonly FillKey[]) => keys.map((key) => FIELD_LABELS[key]);
  return (
    <Alert variant="info">
      <WandSparklesIcon />
      <AlertTitle>
        {fill.filled.length > 0 ? `Filled from ${SOURCE_LABELS[fill.source]}` : "Nothing new to fill"}
      </AlertTitle>
      <AlertDescription>
        {fill.filled.length > 0 && <p>{sentence(list(labels(fill.filled)))}.</p>}
        {fill.kept.length > 0 && <p>Kept as they were: {list(labels(fill.kept))}.</p>}
        {fill.placeholderPassword && <p>The password in it is a placeholder, so type the real one.</p>}
        {fill.ignored.length > 0 && <p>Not carried over: {list(fill.ignored)}.</p>}
      </AlertDescription>
      {fill.filled.length > 0 && (
        <AlertAction>
          <Button onClick={fields.undoFill} size="xs" variant="outline">
            Undo
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
