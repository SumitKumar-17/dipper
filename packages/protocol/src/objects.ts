/** A function or stored procedure. */
export type Routine = {
  schema: string;
  name: string;
  kind: "function" | "procedure";
  /** The signature as the database writes it; empty when there are no arguments. */
  arguments: string;
  returns: string;
  language: string;
  /** The full CREATE statement where the database can print one. */
  definition: string;
};

export type Sequence = {
  schema: string;
  name: string;
  dataType: string;
  increment: number;
  /** Null until the sequence has been used. */
  lastValue: number | null;
};

export type EnumType = { schema: string; name: string; labels: string[] };

export type Extension = { name: string; version: string; schema: string };

/** A trigger with the table it fires on, for browsing every trigger in one place. */
export type ObjectTrigger = {
  schema: string;
  table: string;
  name: string;
  enabled: boolean;
  definition: string;
};

/** Everything in a database that is not a table or a view. A group is empty where a dialect has no equivalent. */
export type DatabaseObjects = {
  routines: Routine[];
  sequences: Sequence[];
  enums: EnumType[];
  extensions: Extension[];
  triggers: ObjectTrigger[];
};
