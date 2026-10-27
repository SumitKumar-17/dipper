import type { ConnectionColor, ConnectionSummary } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { Switch } from "../../ui/switch";
import { COLOR_LABEL } from "../../workspace/connection-tag";
import { useWorkspace } from "../../workspace/context";
import { ErrorText } from "../../workspace/error-text";

const SELECT =
  "h-7 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The two safety settings of a saved connection: a colour tag and read-only mode. Read-only is
 * enforced by the server, so it holds for every client, including a script.
 */
export function ConnectionSafety({ connection }: { connection: ConnectionSummary }): React.ReactElement {
  const { updateConnection } = useWorkspace();
  const [error, setError] = React.useState<string | null>(null);

  const save = (patch: { color?: ConnectionColor | ""; readOnly?: boolean }): void => {
    setError(null);
    updateConnection(connection.id, patch).catch((cause: unknown) => setError(messageOf(cause)));
  };

  return (
    <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1 ps-6 text-muted-foreground text-xs">
      <label className="flex items-center gap-1.5">
        Tag
        <select
          aria-label={`Colour tag for ${connection.name}`}
          className={SELECT}
          onChange={(event) => save({ color: event.target.value as ConnectionColor | "" })}
          value={connection.color ?? ""}
        >
          <option value="">None</option>
          {(Object.keys(COLOR_LABEL) as ConnectionColor[]).map((color) => (
            <option key={color} value={color}>
              {COLOR_LABEL[color]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <Switch checked={connection.readOnly ?? false} onCheckedChange={(readOnly) => save({ readOnly })} />
        Read-only: refuse writes
      </label>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
