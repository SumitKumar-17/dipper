import type * as React from "react";
import { Field, FieldDescription, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { FilledMark } from "./autofill-notice";
import type { ConnectionFields } from "./use-connection-fields";

/**
 * Where a SQLite database is. A plain text input rather than a file picker: the server reads the
 * file from its own disk, which a browser's picker cannot name a path on.
 */
export function FileField({ fields }: { fields: ConnectionFields }): React.ReactElement {
  return (
    <Field>
      <FieldLabel>
        Database file
        <FilledMark field="database" fields={fields} />
      </FieldLabel>
      <Input
        autoComplete="off"
        name="database"
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
