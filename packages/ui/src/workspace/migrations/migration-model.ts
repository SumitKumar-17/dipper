import type { AppliedMigration, MigrationInput } from "@dipper/protocol";

/** One migration file found on disk. */
export type MigrationFile = MigrationInput & { path: string };

/**
 * `pending` has not run; `applied` ran and the file is unchanged; `modified` ran but the file has
 * since been edited; `missing` ran but its file is gone.
 */
export type MigrationStatus = "pending" | "applied" | "modified" | "missing";

export type MigrationRow = {
  version: string;
  name: string;
  status: MigrationStatus;
  file?: MigrationFile;
  applied?: AppliedMigration;
};

/** The folder, inside a workspace root, that holds migration files. */
export const MIGRATIONS_DIR = "migrations";

const FILE_NAME = /^(\d+)_([^.]+)\.sql$/i;

/** Reads `0003_add_email.sql` into its number and name, or null when it is not a migration file. */
export function parseMigrationName(fileName: string): { version: string; name: string } | null {
  const match = FILE_NAME.exec(fileName);
  if (!match) return null;
  return { version: match[1] ?? "", name: (match[2] ?? "").replace(/_/g, " ") };
}

/** A name safe to put in a file: lowercase words joined by underscores. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The next free number, zero padded to at least four digits and to the width already in use. */
export function nextVersion(versions: readonly string[]): string {
  const width = Math.max(4, ...versions.map((v) => v.length));
  const highest = versions.reduce((top, v) => Math.max(top, Number.parseInt(v, 10) || 0), 0);
  return String(highest + 1).padStart(width, "0");
}

export function migrationFileName(version: string, name: string): string {
  return `${version}_${slugify(name)}.sql`;
}

/** Hex SHA-256 of a migration's text, normalised exactly as the server does (see MigrationChecksum in Go). */
export async function migrationChecksum(text: string): Promise<string> {
  const normal = text.replace(/\r\n/g, "\n").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normal));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Lines the files on disk up against the database's history, ordered by version. `checksums` maps a
 * file's version to its current hash, computed by the caller because hashing is async.
 */
export function reconcile(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
  checksums: ReadonlyMap<string, string>,
): MigrationRow[] {
  const byVersion = new Map<string, MigrationRow>();
  for (const file of files) {
    byVersion.set(file.version, { version: file.version, name: file.name, status: "pending", file });
  }
  for (const record of applied) {
    const row = byVersion.get(record.version);
    if (!row) {
      byVersion.set(record.version, { version: record.version, name: record.name, status: "missing", applied: record });
      continue;
    }
    row.applied = record;
    row.status = checksums.get(record.version) === record.checksum ? "applied" : "modified";
  }
  return [...byVersion.values()].sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
}

/** What an Apply would run: the pending files, in order. */
export function pendingFiles(rows: readonly MigrationRow[]): MigrationFile[] {
  return rows.flatMap((row) => (row.status === "pending" && row.file ? [row.file] : []));
}

/**
 * Pending files numbered below the newest applied version were added out of order, say on a branch.
 * Running them is allowed, but the user should be told.
 */
export function outOfOrder(rows: readonly MigrationRow[]): MigrationRow[] {
  const newestApplied = rows.reduce((top, row) => (row.applied && row.version > top ? row.version : top), "");
  return rows.filter((row) => row.status === "pending" && row.version < newestApplied);
}
