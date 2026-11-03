// What depends on a table or column. Mirrors apps/server/protocol/dependents.go.

export type DependentKind = "view" | "materialized_view" | "foreign_key" | "routine" | "trigger";

export type Dependent = {
  kind: DependentKind;
  schema: string;
  name: string;
  /** The table a foreign key or trigger sits on. */
  table?: string;
  /** The target's columns this dependent uses, when the database records that. */
  columns?: string[];
  /** The foreign key's definition or the trigger's. */
  detail?: string;
  /** 1 for a direct dependent, more when it reaches the target through views. */
  depth: number;
  /** True when found by reading source text, so it can be wrong in either direction. */
  guess?: boolean;
};

export type Dependents = {
  items: Dependent[];
};
