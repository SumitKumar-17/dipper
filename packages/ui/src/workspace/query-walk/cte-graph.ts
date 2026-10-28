// Which CTE feeds which: every place a chapter reads a CTE by name, gathered into one graph.
//
// An edge is read off a FROM or JOIN the walk already parsed, never off a word search, so a column
// that happens to share a CTE's name is not mistaken for a read. The reader is the chapter whose
// own clauses hold the reference: a CTE read inside an EXISTS is read by that EXISTS chapter, which
// is the same chapter the strip lists, so the graph and the strip name the same things.

import { isSetOp, type SourceRef } from "./clauses";
import { parseSelect } from "./parse-select";
import { sectionForSource } from "./program-select";
import type { Program, Section, SectionId } from "./program-types";

export type CteReader = {
  readonly id: SectionId;
  readonly label: string;
  /** How many FROM or JOIN entries in that chapter name the CTE. */
  readonly references: number;
};

export type CteNode = {
  readonly id: SectionId;
  readonly label: string;
  /** The chapters that read it, in program order. Empty for a CTE nothing reads. */
  readonly readers: readonly CteReader[];
  /** Every reference across all readers. */
  readonly references: number;
};

function sourcesOf(section: Section): readonly SourceRef[] {
  const parsed = section.parsed;
  if (parsed === null || isSetOp(parsed)) return [];
  return [parsed.first, ...parsed.joins.map((join) => join.source)];
}

/**
 * The CTE sections a recursive CTE's two halves read. Its own text is the walk's invented `select *
 * from chain`, which reads nothing, so the halves are parsed behind the same WITH prefix the
 * section runs with: that is what makes a name the prefix declares parse as a CTE reference.
 */
function recursionReads(program: Program, section: Section): SectionId[] {
  const recursion = section.recursion;
  if (recursion === null) return [];
  return [recursion.anchorSql, recursion.stepSql].flatMap((half) => {
    const parsed = parseSelect(`${section.prefix}${half}`, program.dialect);
    if (parsed.kind !== "select") return [];
    return [parsed.first, ...parsed.joins.map((join) => join.source)].flatMap((source) => {
      const read = source.kind === "cte" ? sectionForSource(program, section, source) : null;
      return read ? [read.id] : [];
    });
  });
}

function readsOf(program: Program, section: Section): SectionId[] {
  const direct = sourcesOf(section).flatMap((source) => {
    const read = source.kind === "cte" ? sectionForSource(program, section, source) : null;
    return read ? [read.id] : [];
  });
  return [...direct, ...recursionReads(program, section)].filter((id) => id !== section.id);
}

/** Every CTE of the program, in program order, with the chapters that read it. */
export function cteGraph(program: Program): CteNode[] {
  const counts = new Map<SectionId, Map<SectionId, number>>();
  for (const reader of program.sections) {
    for (const id of readsOf(program, reader)) {
      const byReader = counts.get(id) ?? new Map<SectionId, number>();
      byReader.set(reader.id, (byReader.get(reader.id) ?? 0) + 1);
      counts.set(id, byReader);
    }
  }
  return program.sections
    .filter((section) => section.origin.kind === "cte")
    .map((cte) => {
      const byReader = counts.get(cte.id) ?? new Map<SectionId, number>();
      const readers = program.sections.flatMap((section) => {
        const references = byReader.get(section.id);
        return references ? [{ id: section.id, label: section.label, references }] : [];
      });
      return {
        id: cte.id,
        label: cte.label,
        readers,
        references: readers.reduce((sum, reader) => sum + reader.references, 0),
      };
    });
}

/** `used by 2`, and the reference count beside it when one chapter reads the CTE more than once. */
export function usedBy(node: CteNode): string {
  const base = `used by ${node.readers.length}`;
  return node.references > node.readers.length ? `${base}, ${node.references} reads` : base;
}
