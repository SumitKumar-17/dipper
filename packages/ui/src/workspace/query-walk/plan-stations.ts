// Which steps of the database's plan do a station's work, read off the plan's node types and the
// aliases its scans name.
//
// The plan and the walk describe the same query in two different orders: the walk in the logical
// order SQL defines, the plan in whatever order the planner chose. So a station maps to the nodes
// that carry out its clause, wherever the planner put them, and a node may serve two stations at
// once - one Sort can order the rows for a window function and for ORDER BY alike. A station whose
// work no node does on its own (SELECT computes its columns inside whichever node hands rows up)
// maps to nothing, and says so rather than borrowing a neighbour's.

import type { PlanNode } from "@dipper/protocol";
import type { ParsedSelect, SourceRef } from "./clauses";
import type { Station } from "./station-types";

const JOINS = new Set(["nested loop", "hash join", "merge join"]);
const SORTS = new Set(["sort", "incremental sort"]);

const typeOf = (node: PlanNode): string => node.nodeType.toLowerCase();

function every(root: PlanNode): PlanNode[] {
  return [root, ...root.children.flatMap(every)];
}

/** The name a scan answers to: its alias, else its relation. */
const scanName = (node: PlanNode): string | null =>
  (node.alias ?? node.relation)?.toLowerCase() ?? null;

const sourceName = (source: SourceRef): string => (source.alias ?? source.name).toLowerCase();

/** Scans of the query's own FROM list, not of a subquery or CTE body that happens to be inside. */
function ownScans(root: PlanNode, parsed: ParsedSelect): PlanNode[] {
  const names = new Set([parsed.first, ...parsed.joins.map((join) => join.source)].map(sourceName));
  return every(root).filter((node) => {
    const name = scanName(node);
    return typeOf(node).includes("scan") && name !== null && names.has(name);
  });
}

/**
 * The join node that brings join `index`'s source in: the deepest join whose inputs hold both that
 * source and something the FROM list had before it.
 */
function joinNode(root: PlanNode, parsed: ParsedSelect, index: number): PlanNode[] {
  const sources = [parsed.first, ...parsed.joins.map((join) => join.source)];
  const incoming = sourceName(sources[index + 1]!);
  const before = new Set(sources.slice(0, index + 1).map(sourceName));
  const names = (node: PlanNode): Set<string> =>
    new Set(every(node).flatMap((n) => (scanName(n) === null ? [] : [scanName(n)!])));
  const candidates = every(root).filter((node) => {
    if (!JOINS.has(typeOf(node))) return false;
    const inside = names(node);
    return inside.has(incoming) && [...before].some((name) => inside.has(name));
  });
  // Deepest first: a join is inside every join above it, so the smallest subtree is the one that
  // actually met the two sides.
  const deepest = candidates.filter(
    (node) => !candidates.some((other) => other !== node && every(node).includes(other)),
  );
  return deepest.slice(0, 1);
}

/** The Sort nearest the top: the one that orders what the query returns. */
function topSort(root: PlanNode): PlanNode[] {
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (SORTS.has(typeOf(node))) return [node];
    queue.push(...node.children);
  }
  return [];
}

const aggregates = (root: PlanNode): PlanNode[] =>
  every(root).filter((node) => typeOf(node).includes("aggregate") || typeOf(node) === "group");

export function planNodesFor(station: Station, parsed: ParsedSelect, root: PlanNode): PlanNode[] {
  if (!station.present) return [];
  switch (station.id) {
    case "from":
      return ownScans(root, parsed);
    case "join":
      return joinNode(root, parsed, station.joinIndex);
    case "where": {
      // A WHERE test is pushed down to the scan it is about, as a filter or an index condition. An
      // index condition that names another source is the join's lookup, not the WHERE's.
      const names = [parsed.first, ...parsed.joins.map((join) => join.source)].map(sourceName);
      const namesOther = (node: PlanNode, text: string): boolean =>
        names.some(
          (name) => name !== scanName(node) && text.toLowerCase().includes(`${name}.`),
        );
      return ownScans(root, parsed).filter(
        (node) =>
          node.filter !== undefined ||
          (node.index !== undefined && node.condition !== undefined && !namesOther(node, node.condition)),
      );
    }
    case "group":
      return aggregates(root);
    case "having":
      return aggregates(root).filter((node) => node.filter !== undefined);
    case "window":
      return every(root).filter((node) => typeOf(node) === "windowagg");
    case "distinct":
      return [
        ...every(root).filter((node) => typeOf(node) === "unique"),
        ...(parsed.groupBy === null ? aggregates(root) : []),
      ];
    case "order":
      return topSort(root);
    case "limit":
      return every(root).filter((node) => typeOf(node) === "limit");
    default:
      return [];
  }
}
