import type { DipperClient } from "@dipper/client";
import { MIGRATIONS_DIR, migrationFileName, nextVersion, parseMigrationName, type MigrationFile } from "@dipper/ui";
import * as React from "react";

export type MigrationFiles = {
  migrationFiles: () => Promise<MigrationFile[]>;
  createMigrationFile: (name: string, sql: string) => Promise<MigrationFile>;
};

/** Server paths are native: join with whatever separator the root itself uses. */
function joinPath(root: string, ...parts: string[]): string {
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Migration files are plain `.sql` files in a `migrations` folder inside a workspace root. The first
 * root that already has one wins; with none, the last root is used, since that is the folder the
 * user added themselves (the first is the managed queries folder). Reading goes through the
 * ordinary file API, so it obeys the same root confinement as everything else.
 */
export function useMigrationFiles(getClient: () => DipperClient, roots: readonly string[]): MigrationFiles {
  const findDir = React.useCallback(async (): Promise<string | null> => {
    const last = roots[roots.length - 1];
    if (!last) return null;
    for (const root of roots) {
      const entries = await getClient().files.list(root).catch(() => []);
      if (entries.some((e) => e.kind === "dir" && e.name === MIGRATIONS_DIR)) return joinPath(root, MIGRATIONS_DIR);
    }
    return joinPath(last, MIGRATIONS_DIR);
  }, [getClient, roots]);

  const migrationFiles = React.useCallback(async (): Promise<MigrationFile[]> => {
    const dir = await findDir();
    if (!dir) return [];
    const files = getClient().files;
    // A missing folder just means no migrations yet.
    const entries = await files.list(dir).catch(() => []);
    const found: MigrationFile[] = [];
    for (const entry of entries) {
      const parsed = entry.kind === "file" ? parseMigrationName(entry.name) : null;
      if (!parsed) continue;
      const { content } = await files.read(entry.path);
      found.push({ ...parsed, sql: content, path: entry.path });
    }
    return found.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  }, [findDir, getClient]);

  const createMigrationFile = React.useCallback(
    async (name: string, sql: string): Promise<MigrationFile> => {
      const dir = await findDir();
      if (!dir) throw new Error("Add a workspace folder first: migrations are saved inside it.");
      const existing = await migrationFiles();
      const version = nextVersion(existing.map((f) => f.version));
      const path = joinPath(dir, migrationFileName(version, name));
      await getClient().files.write({ path, content: sql });
      return { version, name: name.trim(), sql, path };
    },
    [findDir, getClient, migrationFiles],
  );

  return { migrationFiles, createMigrationFile };
}
