import type {
  ActivitySnapshot,
  Advice,
  ApplyRequest,
  ApplyResult,
  ExplainRequest,
  Plan,
  RowPageRequest,
  SchemaDiffResult,
  RunRecord,
  TableDetail,
} from "@dipper/protocol";
import type { DipperClient } from "@dipper/client";
import * as React from "react";

type Scope = { connectionId: string | null; database: string | null };

export type TableTools = {
  tableDetail: (schema: string, table: string) => Promise<TableDetail>;
  rowPage: (schema: string, table: string, request: RowPageRequest) => Promise<RunRecord>;
  applyRows: (schema: string, table: string, request: ApplyRequest) => Promise<ApplyResult>;
  explain: (request: ExplainRequest) => Promise<Plan>;
  schemaDiff: (other: string) => Promise<SchemaDiffResult>;
  advice: () => Promise<Advice>;
  activity: () => Promise<ActivitySnapshot>;
  signalSession: (pid: number, action: "cancel" | "terminate") => Promise<void>;
};

/**
 * The per-table and per-statement calls behind the table editor and the plan view. Each one is
 * aimed at the connection and database the workspace has selected, so a surface never has to
 * carry them.
 */
export function useTableTools(getClient: () => DipperClient, { connectionId, database }: Scope): TableTools {
  const aimed = React.useCallback(
    (extra?: object) => {
      if (!connectionId) throw new Error("No connection selected.");
      return { id: connectionId, scoped: { ...(database ? { database } : {}), ...extra } };
    },
    [connectionId, database],
  );

  return React.useMemo<TableTools>(
    () => ({
      tableDetail: async (schema, table) => {
        const { id } = aimed();
        return getClient().connections.tableDetail(id, schema, table, database ? { database } : {});
      },
      rowPage: async (schema, table, request) => {
        const { id, scoped } = aimed();
        return getClient().connections.rowPage(id, schema, table, { ...request, ...scoped });
      },
      applyRows: async (schema, table, request) => {
        const { id, scoped } = aimed();
        return getClient().connections.applyRows(id, schema, table, { ...request, ...scoped });
      },
      explain: async (request) => {
        const { id, scoped } = aimed();
        return getClient().connections.explain(id, { ...request, ...scoped });
      },
      schemaDiff: async (other) => {
        const { id } = aimed();
        return getClient().connections.schemaDiff({
          from: { connectionId: id, ...(database ? { database } : {}) },
          to: { connectionId: id, database: other },
        });
      },
      advice: async () => {
        const { id } = aimed();
        return getClient().connections.advice(id, database ? { database } : {});
      },
      activity: async () => {
        const { id } = aimed();
        return getClient().connections.activity(id);
      },
      signalSession: async (pid, action) => {
        const { id } = aimed();
        await getClient().connections.signalSession(id, pid, action);
      },
    }),
    [aimed, database, getClient],
  );
}
