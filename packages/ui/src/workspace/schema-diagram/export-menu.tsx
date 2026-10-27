import type { DatabaseSchema } from "@dipper/protocol";
import { DownloadIcon } from "lucide-react";
import * as React from "react";
import { Button } from "../../ui/button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger } from "../../ui/dropdown-menu";
import { toDbml, toMermaid } from "./schema-export";

type Format = { label: string; extension: string; write: (schema: DatabaseSchema) => string };

const FORMATS: readonly Format[] = [
  { label: "Mermaid (.mmd)", extension: "mmd", write: toMermaid },
  { label: "DBML (.dbml)", extension: "dbml", write: toDbml },
];

/** Hands the browser a text file to save. The file's name carries the database it describes. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Export the whole schema, not just the tables the canvas is showing, as text other tools read. */
export function ExportMenu({ database, schema }: { database: string | null; schema: DatabaseSchema }): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="xs" variant="ghost" />}>
        <DownloadIcon />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map((format) => (
          <DropdownMenuItem
            key={format.extension}
            onClick={() => download(`${database ?? "schema"}.${format.extension}`, format.write(schema))}
          >
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
