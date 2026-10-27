import type * as React from "react";
import { Field, FieldDescription, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import type { ConnectionFields } from "./use-connection-fields";

/**
 * Where a SQLite database is. A plain text input rather than a file picker: the server reads the
 * file from its own disk, which a browser's picker cannot name a path on.
 */
export function FileField({ fields }: { fields: ConnectionFields }): React.ReactElement {
  return (
    <Field>
      <FieldLabel>Database file</FieldLabel>
      <Input
        autoComplete="off"
        onValueChange={fields.setDatabase}
        placeholder="/path/to/app.db"
        spellCheck={false}
        value={fields.database}
      />
      <FieldDescription>
        The path of an existing file on the machine dipper runs on. Use :memory: for a scratch
        database.
      </FieldDescription>
    </Field>
  );
}
