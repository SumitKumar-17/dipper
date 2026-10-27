import type { Finding, FindingKind } from "@dipper/protocol";

/** The order findings are read in: what is broken, then what is wasteful, then what is slow. */
export const KIND_ORDER: readonly FindingKind[] = [
  "invalid_index",
  "missing_fk_index",
  "duplicate_index",
  "unused_index",
  "dead_rows",
];

export const KIND_TITLE: Readonly<Record<FindingKind, string>> = {
  invalid_index: "Invalid indexes",
  missing_fk_index: "Foreign keys without an index",
  duplicate_index: "Duplicate indexes",
  unused_index: "Unused indexes",
  dead_rows: "Tables with many dead rows",
};

/** Findings grouped by kind, in reading order, leaving out kinds with nothing in them. */
export function groupFindings(findings: readonly Finding[]): { kind: FindingKind; findings: Finding[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, findings: findings.filter((f) => f.kind === kind) })).filter(
    (group) => group.findings.length > 0,
  );
}

/**
 * Bytes that dropping the flagged indexes would give back. A duplicate's size is the whole pair,
 * of which one is kept, so only the unused and invalid ones are counted outright.
 */
export function recoverableBytes(findings: readonly Finding[]): number {
  return findings
    .filter((f) => f.kind === "unused_index" || f.kind === "invalid_index")
    .reduce((total, f) => total + (f.sizeBytes ?? 0), 0);
}
