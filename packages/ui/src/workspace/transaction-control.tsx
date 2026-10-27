import { CheckIcon, DatabaseZapIcon, Undo2Icon } from "lucide-react";
import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useWorkspace } from "./context";
import { ErrorText } from "./error-text";

/**
 * Transaction mode. By default every statement commits on its own. Begin pins one connection, so
 * the statements that follow (across runs) form one transaction that can be committed or rolled
 * back as a whole. A failed transaction accepts only a rollback, so that is the only thing offered.
 */
export function TransactionControl(): React.ReactElement | null {
  const { connection, transaction, beginTransaction, commitTransaction, rollbackTransaction } = useWorkspace();
  if (!connection || connection.status !== "connected") return null;
  const { state, busy, error } = transaction;

  if (state === "none") {
    return (
      <span className="flex items-center gap-2">
        {error && <ErrorText>{error}</ErrorText>}
        <Button
          disabled={busy || connection.readOnly}
          onClick={() => void beginTransaction()}
          size="sm"
          title={
            connection.readOnly
              ? "This connection is read-only"
              : "Group the statements you run into one transaction you can commit or roll back"
          }
          variant="outline"
        >
          {busy ? <Spinner /> : <DatabaseZapIcon />}
          Begin
        </Button>
      </span>
    );
  }

  const failed = state === "failed";
  return (
    <span className="flex items-center gap-1.5">
      {error && <ErrorText>{error}</ErrorText>}
      <Badge variant={failed ? "destructive" : "default"}>{failed ? "Transaction failed" : "In transaction"}</Badge>
      {!failed && (
        <Button disabled={busy} onClick={() => void commitTransaction()} size="sm" variant="outline">
          <CheckIcon /> Commit
        </Button>
      )}
      <Button disabled={busy} onClick={() => void rollbackTransaction()} size="sm" variant={failed ? "default" : "outline"}>
        <Undo2Icon /> Rollback
      </Button>
    </span>
  );
}
