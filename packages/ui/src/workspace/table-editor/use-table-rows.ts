import type { Cell, RowFilterOp, RunRecord } from "@dipper/protocol";
import * as React from "react";
import { messageOf } from "../../lib/errors";
import { useWorkspace } from "../context";

export const PAGE_SIZE = 100;

export type Filter = { id: number; column: string; op: RowFilterOp; value: string };
export type Sort = { column: string; desc: boolean };

type Page =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; columns: string[]; rows: Cell[][]; hasMore: boolean };

function pageOf(record: RunRecord): Page {
  const result = record.results?.[0];
  if (record.status !== "done" || !result) {
    return { status: "error", message: record.error?.message ?? "The page could not be read." };
  }
  return {
    status: "ready",
    columns: result.columns.map((column) => column.name),
    rows: result.rows,
    hasMore: result.rowCount >= PAGE_SIZE,
  };
}

/**
 * One table's rows, a page at a time. The server sorts and filters, so the browser never holds
 * more than a page; changing the query starts over from the first page.
 */
export function useTableRows(schema: string, table: string) {
  const { rowPage } = useWorkspace();
  const [offset, setOffset] = React.useState(0);
  const [sort, setSort] = React.useState<Sort | null>(null);
  const [filters, setFilters] = React.useState<Filter[]>([]);
  const [page, setPage] = React.useState<Page>({ status: "loading" });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    setPage({ status: "loading" });
    rowPage(schema, table, {
      limit: PAGE_SIZE,
      offset,
      ...(sort ? { sort: [{ column: sort.column, desc: sort.desc }] } : {}),
      filters: filters
        .filter((f) => f.column && (f.op === "is_null" || f.op === "not_null" || f.value !== ""))
        .map(({ column, op, value }) => ({ column, op, value })),
    })
      .then((record) => current && setPage(pageOf(record)))
      .catch((error: unknown) => current && setPage({ status: "error", message: messageOf(error) }));
    return () => {
      current = false;
    };
  }, [rowPage, schema, table, offset, sort, filters, nonce]);

  const restart = <T,>(set: (value: T) => void) => (value: T) => {
    setOffset(0);
    set(value);
  };

  return {
    page,
    offset,
    sort,
    filters,
    reload: () => setNonce((n) => n + 1),
    nextPage: () => setOffset((o) => o + PAGE_SIZE),
    previousPage: () => setOffset((o) => Math.max(0, o - PAGE_SIZE)),
    setSort: restart(setSort),
    setFilters: restart(setFilters),
  };
}
