import { AnimatePresence, motion } from "motion/react";
import type * as React from "react";
import { useCollapse } from "../../lib/motion";
import { Button } from "../../ui/button";
import { Field, FieldDescription, FieldLabel } from "../../ui/field";
import { Input } from "../../ui/input";
import { DIALECT_DEFAULTS } from "../dialect-mark";
import { providerFor } from "./autofill/providers";
import { FilledMark } from "./autofill-notice";
import type { ConnectionFields, FillKey } from "./use-connection-fields";

function Label({ fields, field, children }: { fields: ConnectionFields; field: FillKey; children: React.ReactNode }): React.ReactElement {
  return (
    <FieldLabel>
      {children}
      <FilledMark field={field} fields={fields} />
    </FieldLabel>
  );
}

/** Where the server is, in whichever of the two shapes is showing. */
export function AddressFields({ fields }: { fields: ConnectionFields }): React.ReactElement {
  const collapse = useCollapse();
  const { dialect, mode, setMode } = fields;
  // Said whenever the host is a provider's, typed or pasted: it is what the person would otherwise
  // learn from a connection that fails.
  const provider = mode === "fields" ? providerFor(fields.host, fields.user) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Address</span>
        <Button
          onClick={() => setMode(mode === "url" ? "fields" : "url")}
          size="xs"
          variant="ghost"
        >
          {mode === "url" ? "Use fields" : "Use URL"}
        </Button>
      </div>

      {/* The two shapes are the same information, so they swap in place and the panel takes
          the height of whichever is showing rather than jumping to the taller one. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          key={mode}
          transition={collapse}
        >
          {mode === "url" ? (
            <Field>
              <FieldLabel>Connection URL</FieldLabel>
              <Input
                autoComplete="off"
                name="url"
                onValueChange={fields.setUrl}
                placeholder={`${dialect}://user@localhost:${DIALECT_DEFAULTS[dialect].port}/${DIALECT_DEFAULTS[dialect].database}`}
                spellCheck={false}
                value={fields.url}
              />
              <FieldDescription>
                The server parses this. A psql or mysql command, a JDBC string or a DATABASE_URL line
                fills the fields instead.
              </FieldDescription>
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label field="host" fields={fields}>
                    Host
                  </Label>
                  <Input
                    autoComplete="off"
                    name="host"
                    onBlur={fields.completeHost}
                    onValueChange={fields.setHost}
                    placeholder="host, host:port or a pasted URL"
                    spellCheck={false}
                    value={fields.host}
                  />
                </Field>
                <Field>
                  <Label field="port" fields={fields}>
                    Port
                  </Label>
                  <Input
                    inputMode="numeric"
                    name="port"
                    onValueChange={fields.setPort}
                    value={fields.port}
                  />
                </Field>
                <Field>
                  <Label field="user" fields={fields}>
                    User
                  </Label>
                  <Input
                    autoComplete="off"
                    name="user"
                    onValueChange={fields.setUser}
                    spellCheck={false}
                    value={fields.user}
                  />
                </Field>
                <Field>
                  <Label field="database" fields={fields}>
                    Database
                  </Label>
                  <Input
                    autoComplete="off"
                    name="database"
                    onValueChange={fields.setDatabase}
                    spellCheck={false}
                    value={fields.database}
                  />
                </Field>
              </div>
              {provider !== null && (
                <p className="text-muted-foreground text-xs">
                  {provider.name}: {provider.note}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
