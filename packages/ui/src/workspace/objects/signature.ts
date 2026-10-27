import type { Routine } from "@dipper/protocol";

/** `add_tax(price numeric, rate numeric) -> numeric`, the way a routine is named in a list. */
export function signature(routine: Routine): string {
  const call = `${routine.name}(${routine.arguments})`;
  return routine.returns ? `${call} -> ${routine.returns}` : call;
}

/** `schema.name`, or just the name when the schema is the only one anyone reads (MySQL's own). */
export function qualifiedName(schema: string, name: string): string {
  return schema ? `${schema}.${name}` : name;
}
