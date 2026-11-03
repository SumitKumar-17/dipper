// A database's migration history and the request to extend it. Mirrors apps/server/protocol/migration.go.

export type AppliedMigration = {
  /** The file's number, such as "0003". Versions sort as text, so they are zero padded. */
  version: string;
  name: string;
  /** Hash of the file's text when it was applied, so a later edit is noticed. */
  checksum: string;
  appliedAt: string;
  durationMs: number;
};

export type MigrationState = {
  /** False until the first migration is applied: asking never creates anything. */
  tableExists: boolean;
  applied: AppliedMigration[];
};

export type MigrationInput = {
  version: string;
  name: string;
  sql: string;
};

export type ApplyMigrationsRequest = {
  database?: string;
  migrations: MigrationInput[];
  /** Runs them all and rolls back where the database can. */
  dryRun?: boolean;
};

export type MigrationResult = {
  version: string;
  applied: boolean;
  durationMs: number;
  /** Set on the migration that failed; the ones after it were not tried. */
  error?: string;
  /** 0-based statement within the file that failed. */
  failedStatement?: number;
};

export type ApplyMigrationsResult = {
  results: MigrationResult[];
  dryRun: boolean;
  /** True when a dry run really executed the statements and rolled them back. */
  validated: boolean;
  /** False on MySQL, where DDL commits as it runs. */
  transactional: boolean;
};
