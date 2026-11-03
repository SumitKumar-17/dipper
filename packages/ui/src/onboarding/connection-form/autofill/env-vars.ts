// The environment variables libpq and the mysql client read in place of flags. They arrive as a
// prefix on a copied command (`PGPASSWORD=... psql -h ...`) or as lines of a .env file.

import type { Dialect } from "@dipper/protocol";
import { type ConnectionDraft, isValidHost, parsePort, setPassword, setText } from "./draft";
import { applyParams } from "./params";

type Target = "host" | "port" | "user" | "password" | "database" | "param";

const VARIABLES: Record<string, { dialect: Dialect; target: Target; param?: string }> = {
  PGHOST: { dialect: "postgres", target: "host" },
  PGHOSTADDR: { dialect: "postgres", target: "host" },
  PGPORT: { dialect: "postgres", target: "port" },
  PGUSER: { dialect: "postgres", target: "user" },
  PGPASSWORD: { dialect: "postgres", target: "password" },
  PGDATABASE: { dialect: "postgres", target: "database" },
  PGSSLMODE: { dialect: "postgres", target: "param", param: "sslmode" },
  PGSSLROOTCERT: { dialect: "postgres", target: "param", param: "sslrootcert" },
  PGSSLCERT: { dialect: "postgres", target: "param", param: "sslcert" },
  PGSSLKEY: { dialect: "postgres", target: "param", param: "sslkey" },
  PGOPTIONS: { dialect: "postgres", target: "param", param: "options" },
  MYSQL_HOST: { dialect: "mysql", target: "host" },
  MYSQL_TCP_PORT: { dialect: "mysql", target: "port" },
  MYSQL_PWD: { dialect: "mysql", target: "password" },
  MYSQL_UNIX_PORT: { dialect: "mysql", target: "param", param: "socket" },
};

export function isClientVariable(name: string): boolean {
  return VARIABLES[name] !== undefined;
}

/** The dialect a client variable belongs to, for a paste that names nothing else. */
export function dialectOfVariable(name: string): Dialect | undefined {
  return VARIABLES[name]?.dialect;
}

/**
 * Applies one variable. Returns false when its value is malformed (a port that is not a number,
 * a host with a space in it), which makes the whole paste untrustworthy.
 */
export function applyClientVariable(draft: ConnectionDraft, name: string, value: string): boolean {
  const variable = VARIABLES[name];
  if (variable === undefined) return true;
  switch (variable.target) {
    case "host":
      if (!isValidHost(value)) return false;
      draft.host = value;
      return true;
    case "port": {
      const port = parsePort(value);
      if (port === null) return false;
      draft.port = port;
      return true;
    }
    case "user":
      setText(draft, "user", value);
      return true;
    case "database":
      setText(draft, "database", value);
      return true;
    case "password":
      setPassword(draft, value);
      return true;
    case "param":
      applyParams(draft, [[variable.param ?? "", value]]);
      return true;
  }
}
